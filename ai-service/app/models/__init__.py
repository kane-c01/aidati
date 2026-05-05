"""Pydantic 数据模型 - 与业务后端的 RPC 契约"""
from app.models.question import (
    GeneratePaperRequest,
    GeneratePaperResponse,
    GeneratedQuestion,
)
from app.models.grade import (
    GradePaperRequest,
    GradePaperResponse,
    GradeAnswerItem,
    GradeAnswerResult,
)

__all__ = [
    "GeneratePaperRequest",
    "GeneratePaperResponse",
    "GeneratedQuestion",
    "GradePaperRequest",
    "GradePaperResponse",
    "GradeAnswerItem",
    "GradeAnswerResult",
]
