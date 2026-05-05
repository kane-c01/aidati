"""POST /generate-paper - 业务后端 → ai-service 出题入口"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import require_internal_token
from app.models import GeneratePaperRequest, GeneratePaperResponse
from app.services.llm_client import LLMClient, get_llm_client

logger = structlog.get_logger()

router = APIRouter(
    prefix="",
    dependencies=[Depends(require_internal_token)],
    tags=["generate"],
)


@router.post(
    "/generate-paper",
    response_model=GeneratePaperResponse,
    status_code=status.HTTP_200_OK,
)
async def generate_paper(
    body: GeneratePaperRequest,
    client: LLMClient = Depends(get_llm_client),
) -> GeneratePaperResponse:
    logger.info(
        "generate.start",
        paper_id=body.paper_id,
        user_id=body.user_id,
        source_type=body.source_type,
        count=body.config.count,
        types=body.config.question_types,
    )
    try:
        questions, usage = await client.generate_questions(
            paper_id=body.paper_id,
            source_type=body.source_type,
            config=body.config,
            context_text=body.context_text,
            book_title=body.book_title,
            chapter_titles=body.chapter_titles,
        )
    except RuntimeError as err:
        logger.error("generate.failed", paper_id=body.paper_id, err=str(err))
        # 30002 LLM 不可用, 业务侧据此切失败状态
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": 30002, "message": str(err)},
        ) from err

    return GeneratePaperResponse(
        paper_id=body.paper_id,
        questions=questions,
        usage=usage,
    )
