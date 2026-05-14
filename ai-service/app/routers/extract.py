"""POST /v1/extract/document, /v1/extract/region — 文档 / 区域识别入口

业务后端 → ai-service 内部网络调用, 由 X-Internal-Token 鉴权。
"""

from __future__ import annotations

import openai
import structlog
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.auth import require_internal_token
from app.models.extract import (
    ExtractDocumentRequest,
    ExtractDocumentResponse,
    PdfToImagesRequest,
    PdfToImagesResponse,
    RecognizeRegionRequest,
    RecognizeRegionResponse,
    SplitChaptersRequest,
    SplitChaptersResponse,
)
from app.services import chapter_splitter, document_extract, vision_client

logger = structlog.get_logger()

router = APIRouter(
    prefix="/v1/extract",
    dependencies=[Depends(require_internal_token)],
    tags=["extract"],
)


@router.post(
    "/document",
    response_model=ExtractDocumentResponse,
    status_code=status.HTTP_200_OK,
)
async def extract_document(body: ExtractDocumentRequest) -> ExtractDocumentResponse:
    url_tag = body.url[-64:] if body.url else "<image_b64>"
    b64_len = len(body.image_b64) if body.image_b64 else 0
    logger.info(
        "extract.document.start",
        url=url_tag,
        kind=body.kind,
        b64_chars=b64_len,
    )
    try:
        return await document_extract.extract_document(body)
    except openai.BadRequestError as err:
        # DashScope/qwen-vl 对图片输入拒绝(常见: 公网拉不到 URL / b64 不合规)
        msg = getattr(err, "message", None) or str(err)
        logger.warning(
            "extract.document.upstream_bad_request",
            url=url_tag,
            b64_chars=b64_len,
            err=msg[:300],
        )
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={
                "code": 30002,
                "message": "AI 视觉模型拒绝该图片, 请检查图是否可被识别或换一张",
            },
        ) from err
    except RuntimeError as err:
        logger.warning("extract.document.failed", err=str(err))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": 30002, "message": str(err)},
        ) from err


@router.post(
    "/region",
    response_model=RecognizeRegionResponse,
    status_code=status.HTTP_200_OK,
)
async def recognize_region(body: RecognizeRegionRequest) -> RecognizeRegionResponse:
    logger.info(
        "extract.region.start",
        kind=body.kind,
        coord=body.coord,
        url=body.image_url[-48:],
    )
    try:
        return await vision_client.recognize_region(body)
    except RuntimeError as err:
        logger.warning("extract.region.failed", err=str(err))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": 30002, "message": str(err)},
        ) from err


@router.post(
    "/pdf-to-images",
    response_model=PdfToImagesResponse,
    status_code=status.HTTP_200_OK,
)
async def pdf_to_images(body: PdfToImagesRequest) -> PdfToImagesResponse:
    """PDF → 多张 PNG(供 backend 上传 OSS 后建拍照集)"""
    logger.info(
        "extract.pdf_to_images.start",
        url=body.url[-64:],
        max_pages=body.max_pages,
        dpi=body.dpi,
    )
    try:
        return await document_extract.pdf_to_images(body)
    except RuntimeError as err:
        logger.warning("extract.pdf_to_images.failed", err=str(err))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": 30002, "message": str(err)},
        ) from err


@router.post(
    "/split-chapters",
    response_model=SplitChaptersResponse,
    status_code=status.HTTP_200_OK,
)
async def split_chapters(body: SplitChaptersRequest) -> SplitChaptersResponse:
    logger.info(
        "extract.split.start",
        chars=len(body.markdown),
        hints=len(body.chapter_hints),
        book=body.book_title,
    )
    try:
        return await chapter_splitter.split_chapters(body)
    except RuntimeError as err:
        logger.warning("extract.split.failed", err=str(err))
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail={"code": 30002, "message": str(err)},
        ) from err
