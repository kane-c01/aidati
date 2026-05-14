"""Pydantic 数据模型 - 与业务后端的 RPC 契约"""
from app.models.extract import (
    ExtractDocumentRequest,
    ExtractDocumentResponse,
    ExtractedPage,
    ExtractedRegion,
    PdfPageImage,
    PdfToImagesRequest,
    PdfToImagesResponse,
    RecognizeRegionRequest,
    RecognizeRegionResponse,
    SplitChapter,
    SplitChaptersRequest,
    SplitChaptersResponse,
    VisionRuntimeConfig,
)
from app.models.grade import (
    GradeAnswerItem,
    GradeAnswerResult,
    GradePaperRequest,
    GradePaperResponse,
)
from app.models.question import (
    GeneratedQuestion,
    GeneratePaperRequest,
    GeneratePaperResponse,
)

__all__ = [
    "GeneratePaperRequest",
    "GeneratePaperResponse",
    "GeneratedQuestion",
    "GradePaperRequest",
    "GradePaperResponse",
    "GradeAnswerItem",
    "GradeAnswerResult",
    "ExtractDocumentRequest",
    "ExtractDocumentResponse",
    "ExtractedPage",
    "ExtractedRegion",
    "PdfPageImage",
    "PdfToImagesRequest",
    "PdfToImagesResponse",
    "RecognizeRegionRequest",
    "RecognizeRegionResponse",
    "SplitChapter",
    "SplitChaptersRequest",
    "SplitChaptersResponse",
    "VisionRuntimeConfig",
]
