"""LLMClient - 业务层使用的高层 API

封装 LLMChain + 解析 + 校验 + 一次自动重试, 业务路由只调本类。
"""

from __future__ import annotations

import structlog

from app.adapters.factory import LLMChain, build_chain
from app.models.grade import GradeAnswerItem, GradeAnswerResult
from app.models.question import GeneratedQuestion, GenerateConfig, LlmUsage
from app.services.parser import (
    extract_json,
    validate_and_repair_questions,
    validate_grade_results,
)
from app.services.prompt_builder import build_generate_prompt, build_grade_prompt

logger = structlog.get_logger()


class LLMClient:
    """高层封装 - 出题 / 批改"""

    def __init__(self, chain: LLMChain | None = None) -> None:
        self.chain = chain or LLMChain(build_chain())

    async def generate_questions(
        self,
        *,
        paper_id: str,
        source_type: str,
        config: GenerateConfig,
        context_text: str,
        book_title: str | None,
        chapter_titles: list[str] | None,
    ) -> tuple[list[GeneratedQuestion], LlmUsage]:
        system, user = build_generate_prompt(
            source_type=source_type,
            config=config,
            context_text=context_text,
            book_title=book_title,
            chapter_titles=chapter_titles,
        )

        last_err: Exception | None = None
        for attempt in range(2):
            try:
                result = await self.chain.chat(
                    system=system,
                    user=user,
                    json_mode=True,
                    max_tokens=4096,
                    temperature=0.4 if attempt == 0 else 0.1,
                )
                payload = extract_json(result.text)
                payload = validate_and_repair_questions(
                    payload,
                    expected_count=config.count,
                    allowed_types=list(config.question_types),
                )
                qs = [GeneratedQuestion.model_validate(q) for q in payload["questions"]]
                usage = LlmUsage(
                    model=result.model,
                    tokens_input=result.tokens_input,
                    tokens_output=result.tokens_output,
                    cost_yuan=result.cost_yuan,
                    provider=self._guess_provider(result.model),
                )
                logger.info(
                    "llm.generate_ok",
                    paper_id=paper_id,
                    model=result.model,
                    n=len(qs),
                    attempt=attempt + 1,
                )
                return qs, usage
            except Exception as err:
                last_err = err
                logger.warning(
                    "llm.generate_attempt_failed",
                    paper_id=paper_id,
                    attempt=attempt + 1,
                    err=str(err)[:200],
                )

        raise RuntimeError(f"出题失败(2 次重试): {last_err}")

    async def grade_subjective(
        self,
        *,
        paper_id: str,
        items: list[GradeAnswerItem],
    ) -> tuple[list[GradeAnswerResult], LlmUsage]:
        system, user = build_grade_prompt(paper_id=paper_id, items=items)
        expected_ids = [it.question_id for it in items]

        last_err: Exception | None = None
        for attempt in range(2):
            try:
                result = await self.chain.chat(
                    system=system,
                    user=user,
                    json_mode=True,
                    max_tokens=4096,
                    temperature=0.2,
                )
                payload = extract_json(result.text)
                payload = validate_grade_results(payload, expected_question_ids=expected_ids)
                results = [GradeAnswerResult.model_validate(r) for r in payload["results"]]
                usage = LlmUsage(
                    model=result.model,
                    tokens_input=result.tokens_input,
                    tokens_output=result.tokens_output,
                    cost_yuan=result.cost_yuan,
                    provider=self._guess_provider(result.model),
                )
                logger.info(
                    "llm.grade_ok",
                    paper_id=paper_id,
                    n=len(results),
                    model=result.model,
                    attempt=attempt + 1,
                )
                return results, usage
            except Exception as err:
                last_err = err
                logger.warning(
                    "llm.grade_attempt_failed",
                    paper_id=paper_id,
                    attempt=attempt + 1,
                    err=str(err)[:200],
                )

        raise RuntimeError(f"主观题批改失败(2 次重试): {last_err}")

    @staticmethod
    def _guess_provider(model: str) -> str:
        m = model.lower()
        if "deepseek" in m:
            return "deepseek"
        if "qwen" in m:
            return "qwen"
        if "glm" in m:
            return "glm"
        if "mock" in m:
            return "mock"
        return "unknown"


_default_client: LLMClient | None = None


def get_llm_client() -> LLMClient:
    """FastAPI 依赖注入入口"""
    global _default_client
    if _default_client is None:
        _default_client = LLMClient()
    return _default_client
