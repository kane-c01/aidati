"""Mock LLM 适配器

用途:
- 本地无 API key 时验证整条链路
- 单元测试 / CI

策略:粗暴解析 prompt 关键词决定返回什么 JSON。
- 包含「请按以下 JSON Schema 出题」→ 返回固定数量的占位题
- 包含「请你批改下列主观题」→ 给每道题打 8 分 + 占位反馈
"""

from __future__ import annotations

import json
import re
from typing import Any

import structlog

from app.adapters.base import LLMProvider, LLMResult

logger = structlog.get_logger()


def _extract_count(text: str, default: int = 5) -> int:
    """从 prompt 抠出「共 N 题」"""
    m = re.search(r"共\s*(\d+)\s*题", text)
    if m:
        return min(50, max(1, int(m.group(1))))
    m = re.search(r"count[\"']?\s*[:=]\s*(\d+)", text)
    if m:
        return min(50, max(1, int(m.group(1))))
    return default


def _extract_types(text: str) -> list[str]:
    """从用户 prompt「【题目类型集合】xxx,yyy」一行中抽题型, 而不是全文找关键词
    (system 中包含完整题型列表会导致误识别)
    """
    m = re.search(r"【题目类型集合】([\w,]+)", text)
    if m:
        wanted = [t.strip() for t in m.group(1).split(",") if t.strip()]
        return wanted or ["single"]
    return ["single"]


def _build_question(order_no: int, qtype: str) -> dict[str, Any]:
    base = {
        "order_no": order_no,
        "type": qtype,
        "difficulty": "medium",
        "knowledge_points": [f"占位知识点-{order_no}"],
        "score": 10,
    }
    if qtype == "single":
        base.update(
            {
                "stem": f"【MOCK 单选 {order_no}】下列哪一项是占位答案?",
                "options": [
                    {"id": "A", "text": "占位 A(正确)"},
                    {"id": "B", "text": "占位 B"},
                    {"id": "C", "text": "占位 C"},
                    {"id": "D", "text": "占位 D"},
                ],
                "correct_answer": ["A"],
                "explanation": "MOCK 占位解析:本题选 A, 因为 A 是占位正确答案。",
            }
        )
    elif qtype == "multiple":
        base.update(
            {
                "stem": f"【MOCK 多选 {order_no}】下列哪些是占位答案?",
                "options": [
                    {"id": "A", "text": "占位 A(正确)"},
                    {"id": "B", "text": "占位 B(正确)"},
                    {"id": "C", "text": "占位 C"},
                    {"id": "D", "text": "占位 D"},
                ],
                "correct_answer": ["A", "B"],
                "explanation": "MOCK 占位解析:A 和 B 都是占位正确选项。",
            }
        )
    elif qtype == "judge":
        base.update(
            {
                "stem": f"【MOCK 判断 {order_no}】这是一道占位判断题, 内容为真。",
                "correct_answer": True,
                "explanation": "MOCK 占位解析:此题为真。",
            }
        )
    elif qtype == "fill":
        base.update(
            {
                "stem": f"【MOCK 填空 {order_no}】请填写一个占位答案: ____。",
                "correct_answer": "占位答案",
                "explanation": "MOCK 占位解析:本题应填「占位答案」。",
            }
        )
    else:  # short_answer
        base.update(
            {
                "stem": f"【MOCK 简答 {order_no}】请简述一段占位文字的核心观点。",
                "correct_answer": "核心观点是占位文字描述了一个占位概念, 主要包括 X、Y、Z 三方面。",
                "explanation": "MOCK 占位解析:可从 X、Y、Z 三方面展开, 每点 2-3 句即可。",
            }
        )
    return base


class MockLLMProvider(LLMProvider):
    name = "mock"

    async def chat_completion(
        self,
        *,
        system: str,
        user: str,
        json_mode: bool = True,
        max_tokens: int = 4096,
        temperature: float = 0.4,
    ) -> LLMResult:
        prompt = (system or "") + "\n" + (user or "")

        # 用 system 关键词「阅卷老师」识别批改任务, 比 "批改" 关键词更准确
        # (出题 prompt 里也会出现「便于 AI 批改」等表述, 不能用作判别)
        if "阅卷老师" in system or "请你批改下列主观题" in user:
            payload = self._build_grade(prompt)
        else:
            payload = self._build_generate(prompt)

        text = json.dumps(payload, ensure_ascii=False)
        return LLMResult(
            text=text,
            model="mock-llm-1.0",
            tokens_input=len(prompt) // 2,
            tokens_output=len(text) // 2,
            cost_yuan=0.0,
        )

    async def health(self) -> bool:
        return True

    # ----- 内部 -----
    def _build_generate(self, prompt: str) -> dict[str, Any]:
        count = _extract_count(prompt)
        types = _extract_types(prompt)
        questions = []
        for i in range(count):
            qtype = types[i % len(types)]
            questions.append(_build_question(i + 1, qtype))
        return {"questions": questions}

    def _build_grade(self, prompt: str) -> dict[str, Any]:
        # 抽出 question_id 列表(非常简单的正则)
        ids = re.findall(r'"question_id"\s*:\s*"([^"]+)"', prompt)
        if not ids:
            ids = ["mock-q-1"]
        results = []
        for qid in ids:
            results.append(
                {
                    "question_id": qid,
                    "score": 8,
                    "is_correct": False,
                    "confidence": 0.85,
                    "feedback": "MOCK 占位反馈:回答覆盖了核心要点, 但论述深度有所欠缺, 建议补充具体例子并展开论证。",
                    "suggestions": "建议从「X 角度」「Y 角度」补充, 并加 1-2 个例子。",
                }
            )
        return {"results": results}
