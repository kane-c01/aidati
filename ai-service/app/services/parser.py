"""LLM JSON 输出解析与校验

LLM 偶尔会输出:
- 包裹在 ```json ... ``` 里
- 前后多一段中文解释
- 数组数量与请求不一致
- 字段缺失或多余

本模块负责:
1. 抽取首个合法 JSON 对象(剥 Markdown 围栏 + 找最外层 {})
2. 用 jsonschema 做结构校验
3. 必要时一次自动修复(按 schema 默认值补字段、超量截断、不足时打日志告警)
"""

from __future__ import annotations

import json
import re
from typing import Any

import structlog
from jsonschema import Draft202012Validator, ValidationError

logger = structlog.get_logger()

# ----- JSON 抽取 -----

_FENCE_RE = re.compile(r"```(?:json)?\s*(\{.*?\})\s*```", re.DOTALL)
_LOOSE_BRACE_RE = re.compile(r"\{.*\}", re.DOTALL)


def extract_json(raw: str) -> dict[str, Any]:
    """从 LLM 原始输出中抽出 JSON 对象, 失败抛 ValueError"""
    if not raw:
        raise ValueError("LLM 输出为空")

    fence_match = _FENCE_RE.search(raw)
    candidates: list[str] = []
    if fence_match:
        candidates.append(fence_match.group(1))
    candidates.append(raw.strip())
    loose = _LOOSE_BRACE_RE.search(raw)
    if loose:
        candidates.append(loose.group(0))

    for c in candidates:
        try:
            return json.loads(c)
        except json.JSONDecodeError:
            continue

    raise ValueError("LLM 输出无法解析为 JSON")


# ----- JSON Schema -----

QUESTIONS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["questions"],
    "properties": {
        "questions": {
            "type": "array",
            "minItems": 1,
            "maxItems": 50,
            "items": {
                "type": "object",
                "required": [
                    "order_no",
                    "type",
                    "difficulty",
                    "stem",
                    "correct_answer",
                    "explanation",
                ],
                "properties": {
                    "order_no": {"type": "integer", "minimum": 1, "maximum": 50},
                    "type": {
                        "type": "string",
                        "enum": ["single", "multiple", "judge", "fill", "short_answer"],
                    },
                    "difficulty": {
                        "type": "string",
                        "enum": ["easy", "medium", "hard"],
                    },
                    "stem": {"type": "string", "minLength": 4, "maxLength": 2000},
                    "options": {"type": ["array", "null"]},
                    "correct_answer": {
                        "anyOf": [
                            {"type": "array"},
                            {"type": "string"},
                            {"type": "boolean"},
                        ]
                    },
                    "explanation": {"type": "string", "minLength": 4, "maxLength": 2000},
                    "knowledge_points": {"type": "array"},
                    "score": {"type": "integer", "minimum": 1, "maximum": 100},
                },
            },
        }
    },
}


GRADE_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["results"],
    "properties": {
        "results": {
            "type": "array",
            "minItems": 1,
            "maxItems": 50,
            "items": {
                "type": "object",
                "required": ["question_id", "score", "is_correct", "feedback"],
                "properties": {
                    "question_id": {"type": "string", "minLength": 1},
                    "score": {"type": "integer", "minimum": 0, "maximum": 100},
                    "is_correct": {"type": "boolean"},
                    "confidence": {"type": "number", "minimum": 0, "maximum": 1},
                    "feedback": {"type": "string", "minLength": 8, "maxLength": 2000},
                    "suggestions": {"type": ["string", "null"], "maxLength": 2000},
                },
            },
        }
    },
}


# ----- 校验 + 自动修复 -----

def validate_and_repair_questions(
    payload: dict[str, Any],
    *,
    expected_count: int,
    allowed_types: list[str],
) -> dict[str, Any]:
    """对出题 JSON 做结构校验 + 必要的字段补全

    遇到无法修复的错误抛 ValueError(由调用方决定是否切备用 LLM)
    """
    Draft202012Validator(QUESTIONS_SCHEMA).validate(payload)

    questions = payload.get("questions", [])

    repaired: list[dict[str, Any]] = []
    for i, q in enumerate(questions):
        q = dict(q)
        q["order_no"] = q.get("order_no") or (i + 1)
        if q["type"] not in allowed_types:
            logger.warning(
                "parser.type_not_allowed",
                got=q["type"],
                allowed=allowed_types,
                fallback=allowed_types[0],
            )
            q["type"] = allowed_types[0]

        # 单选/多选必须有 options
        if q["type"] in ("single", "multiple"):
            opts = q.get("options")
            if not isinstance(opts, list) or len(opts) < 2:
                raise ValueError(f"题 {q['order_no']}({q['type']}) 缺少 options 或选项不足 2 个")

        # judge 标准化 correct_answer
        if q["type"] == "judge":
            ca = q.get("correct_answer")
            if isinstance(ca, str):
                q["correct_answer"] = ca.lower() in ("true", "对", "正确", "yes", "y", "1")
            elif isinstance(ca, list) and ca:
                first = str(ca[0]).lower()
                q["correct_answer"] = first in ("true", "对", "正确", "yes", "y", "1", "a")

        q.setdefault("knowledge_points", [])
        q.setdefault("score", 10)
        repaired.append(q)

    # 数量修正(LLM 偶尔多出一道或少一道)
    if len(repaired) > expected_count:
        logger.warning("parser.truncate_extra", got=len(repaired), want=expected_count)
        repaired = repaired[:expected_count]
    elif len(repaired) < expected_count:
        logger.warning("parser.short_questions", got=len(repaired), want=expected_count)
        # 不强行补, 由业务侧决定是否报错(M3 简化:接受少量)

    payload["questions"] = repaired
    return payload


def validate_grade_results(
    payload: dict[str, Any],
    *,
    expected_question_ids: list[str],
) -> dict[str, Any]:
    Draft202012Validator(GRADE_SCHEMA).validate(payload)
    results = payload.get("results", [])

    by_id = {r["question_id"]: r for r in results}
    aligned = []
    for qid in expected_question_ids:
        r = by_id.get(qid)
        if not r:
            logger.warning("parser.grade_missing_qid", qid=qid)
            r = {
                "question_id": qid,
                "score": 0,
                "is_correct": False,
                "confidence": 0.5,
                "feedback": "AI 未对该题给出有效反馈, 暂以 0 分计, 用户可发起申诉。",
                "suggestions": None,
            }
        aligned.append(r)
    payload["results"] = aligned
    return payload


__all__ = [
    "extract_json",
    "validate_and_repair_questions",
    "validate_grade_results",
    "QUESTIONS_SCHEMA",
    "GRADE_SCHEMA",
    "ValidationError",
]
