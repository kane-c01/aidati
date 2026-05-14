"""POST /grade-paper - 主观题批改"""

from __future__ import annotations

import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import require_internal_token
from app.adapters.factory import LLMChain, build_chain_from_runtime
from app.models import GradePaperRequest, GradePaperResponse
from app.services.llm_client import LLMClient

logger = structlog.get_logger()

router = APIRouter(
    prefix="",
    dependencies=[Depends(require_internal_token)],
    tags=["grade"],
)


@router.post(
    "/grade-paper",
    response_model=GradePaperResponse,
    status_code=status.HTTP_200_OK,
)
async def grade_paper(
    body: GradePaperRequest,
) -> GradePaperResponse:
    logger.info(
        "grade.start",
        paper_id=body.paper_id,
        user_id=body.user_id,
        n=len(body.items),
    )
    chain_list = build_chain_from_runtime(body.llm_runtime)
    client = LLMClient(LLMChain(chain_list))
    try:
        results, usage = await client.grade_subjective(
            paper_id=body.paper_id,
            items=body.items,
        )
    except RuntimeError as err:
        logger.error("grade.failed", paper_id=body.paper_id, err=str(err))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": 30002, "message": str(err)},
        ) from err

    return GradePaperResponse(
        paper_id=body.paper_id,
        results=results,
        usage=usage,
    )
