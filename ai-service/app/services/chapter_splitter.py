"""把整篇 markdown 切成结构化章节

策略:
- 复用现有 LLMChain(deepseek/qwen/glm/mock)
- 给 LLM 一段提示词 + chapter_hints + book_title
- 期望 LLM 输出严格 JSON: { chapters: [{order_no, title, content_summary, content_full}] }
- 长文本超出 LLM 单次容量时, 按章节启发或字符长度切片, 多次调用拼接
- 全部失败时, 用启发式 hints 兜底产出粗章节(标题 + 全文夹括),保证业务能继续
"""

from __future__ import annotations

import math
from typing import Any

import structlog
from jsonschema import Draft202012Validator, ValidationError

from app.adapters.factory import LLMChain, build_chain_from_runtime
from app.models.extract import (
    SplitChapter,
    SplitChaptersRequest,
    SplitChaptersResponse,
)
from app.models.llm_runtime import LlmRuntimeConfig
from app.services.parser import extract_json

logger = structlog.get_logger()

# ---------- 单次 LLM 输入大小阈值(粗略估算字符 vs token 1.5 ~ 2.5x) ----------
MAX_CHARS_SINGLE_PASS = 24_000


# ---------- 提示词 ----------

SPLIT_SYSTEM_PROMPT = """你是教材编辑助手。请把给定全文切分为结构化章节, 严格输出 JSON, 不输出任何解释。

要求:
1. 按原文自然章节切分,标题尽量取原文小标题(若用户提供 chapter_hints 则优先用作标题候选)
2. content_full 必须是该章节的完整原文(可保留 Markdown 格式),不要改写、不要总结
3. content_summary 是 1-3 句话的纲要,40-200 字
4. order_no 从 1 起递增, title 不超过 80 字
5. 若全文未分章节(如散文 / 公文),按内容主题切成 1-5 块即可

输出格式严格:
{
  "chapters": [
    {
      "order_no": 1,
      "title": "...",
      "content_summary": "...",
      "content_full": "..."
    }
  ]
}
"""


def _build_user_prompt(
    *,
    book_title: str | None,
    chapter_hints: list[str],
    markdown: str,
    max_chapters: int | None,
) -> str:
    parts: list[str] = []
    if book_title:
        parts.append(f"书名:{book_title}\n")
    if chapter_hints:
        head = "已发现的章节标题候选(优先使用):\n" + "\n".join(
            f"- {h}" for h in chapter_hints[:60]
        )
        parts.append(head + "\n")
    if max_chapters:
        parts.append(f"目标章节数上限:{max_chapters}\n")
    parts.append("以下是全文:\n\n")
    parts.append(markdown)
    return "\n".join(parts)


# ---------- JSON Schema 校验 ----------

_CHAPTERS_SCHEMA: dict[str, Any] = {
    "type": "object",
    "required": ["chapters"],
    "properties": {
        "chapters": {
            "type": "array",
            "minItems": 1,
            "items": {
                "type": "object",
                "required": ["order_no", "title", "content_full"],
                "properties": {
                    "order_no": {"type": "integer", "minimum": 1, "maximum": 500},
                    "title": {"type": "string", "minLength": 1, "maxLength": 200},
                    "content_summary": {"type": ["string", "null"], "maxLength": 4000},
                    "content_full": {"type": "string"},
                },
            },
        }
    },
}


def _validate(payload: dict[str, Any]) -> list[SplitChapter]:
    Draft202012Validator(_CHAPTERS_SCHEMA).validate(payload)
    out: list[SplitChapter] = []
    for raw in payload["chapters"]:
        out.append(
            SplitChapter(
                order_no=int(raw["order_no"]),
                title=str(raw["title"]).strip()[:200],
                content_summary=(raw.get("content_summary") or None),
                content_full=str(raw.get("content_full") or ""),
            ),
        )
    # order_no 重排,保证连续从 1 开始
    out.sort(key=lambda c: c.order_no)
    for i, c in enumerate(out):
        c.order_no = i + 1
    return out


# ---------- 切片(超长文档) ----------


def _chunk_by_chars(markdown: str, max_chars: int) -> list[str]:
    """按字符长度近似切片(尽量在段落处断开)"""
    if len(markdown) <= max_chars:
        return [markdown]
    n_chunks = math.ceil(len(markdown) / max_chars)
    target = math.ceil(len(markdown) / n_chunks)
    chunks: list[str] = []
    pos = 0
    while pos < len(markdown):
        end = min(pos + target, len(markdown))
        if end < len(markdown):
            # 往后找段落分隔(双换行)避免硬切
            window = markdown[end : min(end + 800, len(markdown))]
            i = window.find("\n\n")
            if i != -1:
                end = end + i
        chunks.append(markdown[pos:end].strip())
        pos = end
    return [c for c in chunks if c]


# ---------- 启发式兜底 ----------


def _heuristic_split(markdown: str, hints: list[str]) -> list[SplitChapter]:
    """LLM 全失败时,按 chapter_hints 出现位置切;若无 hints 则一刀整书"""
    if not hints:
        return [
            SplitChapter(
                order_no=1,
                title="全文",
                content_summary=None,
                content_full=markdown,
            )
        ]
    chapters: list[SplitChapter] = []
    starts: list[tuple[int, str]] = []
    for h in hints:
        idx = markdown.find(h)
        if idx >= 0:
            starts.append((idx, h))
    starts.sort(key=lambda x: x[0])
    if not starts:
        return [
            SplitChapter(
                order_no=1,
                title="全文",
                content_summary=None,
                content_full=markdown,
            )
        ]
    for i, (pos, title) in enumerate(starts):
        end = starts[i + 1][0] if i + 1 < len(starts) else len(markdown)
        chapters.append(
            SplitChapter(
                order_no=i + 1,
                title=title.strip()[:200],
                content_summary=None,
                content_full=markdown[pos:end].strip(),
            ),
        )
    return chapters


# ---------- 主入口 ----------


SPLIT_CONCURRENCY = 4


async def split_chapters(req: SplitChaptersRequest) -> SplitChaptersResponse:
    """整篇 markdown → 结构化章节(chunks 并发调用 LLM)"""
    import asyncio

    rt: LlmRuntimeConfig | None = None
    if req.llm_runtime:
        try:
            rt = LlmRuntimeConfig.model_validate(req.llm_runtime)
        except Exception as err:
            logger.warning("split.bad_runtime", err=str(err))

    chain = LLMChain(build_chain_from_runtime(rt))
    chunks = _chunk_by_chars(req.markdown, MAX_CHARS_SINGLE_PASS)
    semaphore = asyncio.Semaphore(SPLIT_CONCURRENCY)

    async def _do_chunk(idx: int, chunk: str) -> tuple[int, list[SplitChapter], object | None]:
        """返回 (idx, chapters, llm_result_or_None) — None 表示走了启发式兜底"""
        async with semaphore:
            user_prompt = _build_user_prompt(
                book_title=req.book_title,
                chapter_hints=req.chapter_hints,
                markdown=chunk,
                max_chapters=req.max_chapters,
            )
            try:
                res = await chain.chat(
                    system=SPLIT_SYSTEM_PROMPT,
                    user=user_prompt,
                    json_mode=True,
                    max_tokens=8192,
                    temperature=0.2,
                )
                payload = extract_json(res.text)
                chapters = _validate(payload)
                logger.info(
                    "split.chunk.ok",
                    chunk=idx + 1,
                    total=len(chunks),
                    chapters=len(chapters),
                )
                return idx, chapters, res
            except (ValueError, ValidationError, RuntimeError) as err:
                logger.warning(
                    "split.chunk.failed_fallback_heuristic",
                    chunk=idx + 1,
                    err=str(err)[:200],
                )
                return idx, _heuristic_split(chunk, req.chapter_hints), None

    results = await asyncio.gather(*[_do_chunk(i, c) for i, c in enumerate(chunks)])
    # 按 idx 排序合并(asyncio.gather 已经按入参顺序返回, 这里二次保险)
    results.sort(key=lambda x: x[0])

    all_chapters: list[SplitChapter] = []
    total_in = total_out = 0
    cost_yuan = 0.0
    model_name = "?"

    for _, chapters, llm_res in results:
        for c in chapters:
            c.order_no = len(all_chapters) + 1
            all_chapters.append(c)
        if llm_res is not None:
            total_in += llm_res.tokens_input
            total_out += llm_res.tokens_output
            cost_yuan += llm_res.cost_yuan
            model_name = llm_res.model

    if not all_chapters:
        all_chapters = _heuristic_split(req.markdown, req.chapter_hints)

    return SplitChaptersResponse(
        chapters=all_chapters,
        usage={
            "model": model_name,
            "tokens_input": total_in,
            "tokens_output": total_out,
            "cost_yuan": round(cost_yuan, 4),
            "provider": "llm",
        },
    )


__all__: tuple[str, ...] = ("split_chapters",)
