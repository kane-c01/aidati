"""文档抽取(PDF + 图片)— 把文档变成结构化 Markdown

设计:
- PDF: pdfplumber 抽每页文字(不调 VL,免费、毫秒级,只支持文字版 PDF)
       扫描版 PDF 可在 PR2.4 接入: 用 pdf2image 拆页 → 逐页调 VL
- IMAGE: 走 vision_client.extract_document(单图 → markdown)

无论哪种 kind,最终输出:
  ExtractDocumentResponse {
    pages: ExtractedPage[],      # 每页一项,含 page.markdown
    markdown: str,               # 全文拼接
    chapter_hints: str[],        # 启发式章节标题
    usage?: dict
  }
"""

from __future__ import annotations

import io
import re
from typing import Any

import httpx
import structlog

from app.models.extract import (
    ExtractDocumentRequest,
    ExtractDocumentResponse,
    ExtractedPage,
    PdfPageImage,
    PdfToImagesRequest,
    PdfToImagesResponse,
)
from app.services import vision_client

logger = structlog.get_logger()


# 启发式章节标题正则:中文教材 / 英文教材常见模式
_CHAPTER_PATTERNS = [
    re.compile(r"^\s{0,4}(第\s*[一二三四五六七八九十百千零〇0-9]+\s*[章节卷篇])(\s*[\u4e00-\u9fa5\w].*)?$"),
    re.compile(r"^\s{0,4}(Chapter\s+\d+|Lesson\s+\d+|Unit\s+\d+)(.*)$", re.IGNORECASE),
    re.compile(r"^\s{0,3}#{1,3}\s+(.+?)\s*$"),
]


def _looks_like_chapter_title(line: str) -> bool:
    s = line.strip()
    if not s or len(s) > 80:
        return False
    return any(p.match(s) for p in _CHAPTER_PATTERNS)


def _extract_chapter_hints_from_text(text: str) -> list[str]:
    hints: list[str] = []
    for raw in text.splitlines():
        if _looks_like_chapter_title(raw):
            hints.append(raw.strip())
    return hints[:200]


async def _fetch(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=60.0, follow_redirects=True) as client:
        r = await client.get(url)
        r.raise_for_status()
        return r.content


async def _extract_pdf(req: ExtractDocumentRequest) -> ExtractDocumentResponse:
    """PDF 抽取(双通道):
    1) 优先 pdfplumber 抽文字版 PDF(快、免费)
    2) 文本太少(疑似扫描版)→ PyMuPDF 渲染每页 → 通义 VL 走 OCR
    """
    try:
        import pdfplumber  # noqa: WPS433 - 延迟 import 避免启动开销
    except ImportError as err:
        raise RuntimeError("缺少 pdfplumber, 请在 ai-service 安装 pdfplumber>=0.11") from err

    raw = await _fetch(req.url)
    pages: list[ExtractedPage] = []
    with pdfplumber.open(io.BytesIO(raw)) as pdf:
        for idx, page in enumerate(pdf.pages):
            text = page.extract_text() or ""
            pages.append(
                ExtractedPage(page_no=idx + 1, markdown=text.strip(), regions=[])
            )

    full = "\n\n".join(p.markdown for p in pages if p.markdown)
    used_vl = False
    vl_usage_total: dict[str, float | str | int] = {
        "model": "pdfplumber",
        "tokens_input": 0,
        "tokens_output": 0,
        "cost_yuan": 0.0,
        "provider": "pdfplumber",
    }

    # 阈值:每页平均不到 80 字 → 视为扫描版, 走 VL
    avg_chars = len(full) / max(1, len(pages))
    if avg_chars < 80:
        logger.info(
            "extract.pdf.fallback_vl",
            pages=len(pages),
            chars=len(full),
            avg=round(avg_chars, 1),
        )
        try:
            pages, vl_total_in, vl_total_out, vl_cost = await _extract_pdf_via_vl(raw, req)
            full = "\n\n".join(p.markdown for p in pages if p.markdown)
            used_vl = True
            vl_usage_total = {
                "model": "pymupdf+qwen-vl",
                "tokens_input": vl_total_in,
                "tokens_output": vl_total_out,
                "cost_yuan": round(vl_cost, 4),
                "provider": "qwen_vl",
            }
        except RuntimeError as err:
            logger.warning("extract.pdf.vl_failed_fallback_text", err=str(err))
            # VL 失败兜底:就当文本版已有内容(可能为空)

    hints = _extract_chapter_hints_from_text(full)

    if not full.strip():
        logger.warning("extract.pdf.empty_text", url=req.url[-48:])
    else:
        logger.info(
            "extract.pdf.ok",
            pages=len(pages),
            chars=len(full),
            chapter_hints=len(hints),
            used_vl=used_vl,
        )

    return ExtractDocumentResponse(
        pages=pages,
        markdown=full,
        chapter_hints=hints,
        usage=vl_usage_total,
    )


async def _extract_pdf_via_vl(
    raw: bytes,
    req: ExtractDocumentRequest,
    *,
    concurrency: int = 6,
) -> tuple[list[ExtractedPage], int, int, float]:
    """扫描版 PDF 兜底:用 PyMuPDF 渲染每页 → 并发调通义 VL 抽 markdown"""
    try:
        import asyncio

        import fitz  # PyMuPDF
        from PIL import Image
    except ImportError as err:
        raise RuntimeError(
            "扫描版 PDF 需要 PyMuPDF + Pillow,请在 ai-service 安装 pymupdf, Pillow",
        ) from err

    # 复用 vision_client 的客户端构造:本质上就是 OpenAI 兼容
    from app.services.vision_client import (  # noqa: WPS433 - 局部 import 防循环
        DOC_EXTRACT_SYSTEM,
        _build_client,
        _bytes_to_data_url,
        _call_vl,
        _resolve_runtime,
    )

    _, model, api_key, base_url = _resolve_runtime(req.vision_runtime)
    if not api_key:
        raise RuntimeError("vision API key 未配置, 无法处理扫描版 PDF")
    client = _build_client(api_key, base_url)

    # 第一步:同步把所有页渲染为 PNG bytes(CPU 任务,无需并发)
    rendered: list[tuple[int, str]] = []  # (page_no, data_url)
    doc = fitz.open(stream=raw, filetype="pdf")
    try:
        for idx, page in enumerate(doc):
            zoom = 150 / 72
            mat = fitz.Matrix(zoom, zoom)
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            max_side = 1600
            w, h = img.size
            if max(w, h) > max_side:
                if w >= h:
                    img = img.resize((max_side, int(h * max_side / w)))
                else:
                    img = img.resize((int(w * max_side / h), max_side))
            buf = io.BytesIO()
            img.save(buf, format="PNG", optimize=True)
            rendered.append((idx + 1, _bytes_to_data_url(buf.getvalue(), "image/png")))
    finally:
        doc.close()

    # 第二步:并发调 VL(asyncio.Semaphore 限流到 concurrency)
    semaphore = asyncio.Semaphore(max(1, concurrency))

    async def _ocr_one(page_no: int, data_url: str) -> tuple[int, str, dict]:
        async with semaphore:
            text, usage = await _call_vl(
                client=client,
                model=model,
                system=DOC_EXTRACT_SYSTEM,
                image_input={"type": "image_url", "image_url": {"url": data_url}},
                user_text=f"请把这张 PDF 第 {page_no} 页识别成 Markdown",
                max_tokens=4096,
            )
            return page_no, text, usage

    results = await asyncio.gather(
        *[_ocr_one(p, u) for p, u in rendered], return_exceptions=True
    )

    pages: list[ExtractedPage] = []
    total_in = total_out = 0
    total_cost = 0.0
    for r in results:
        if isinstance(r, BaseException):
            logger.warning("extract.pdf.vl_page_failed", err=str(r)[:200])
            continue
        page_no, text, usage = r
        pages.append(
            ExtractedPage(page_no=page_no, markdown=text.strip(), regions=[])
        )
        total_in += int(usage.get("tokens_input", 0) or 0)
        total_out += int(usage.get("tokens_output", 0) or 0)
        total_cost += float(usage.get("cost_yuan", 0.0) or 0.0)

    pages.sort(key=lambda p: p.page_no)
    return pages, total_in, total_out, total_cost


async def extract_document(req: ExtractDocumentRequest) -> ExtractDocumentResponse:
    """统一入口:按 kind 分流"""
    if req.kind == "pdf":
        return await _extract_pdf(req)
    if req.kind == "image":
        return await vision_client.extract_document(req)
    raise RuntimeError(f"不支持的 kind: {req.kind}")


async def pdf_to_images(req: PdfToImagesRequest) -> PdfToImagesResponse:
    """把 PDF 的每页渲染成 PNG, 不调 VL, 仅本地 fitz + Pillow

    用于"拍照集统一入口"——backend 拿到 PNG 字节后逐页上传 OSS, 绑成 PhotoSet。
    """
    try:
        import base64
        import fitz  # PyMuPDF
        from PIL import Image
    except ImportError as err:
        raise RuntimeError(
            "PDF→图片需要 PyMuPDF + Pillow, 请安装 pymupdf, Pillow",
        ) from err

    raw = await _fetch(req.url)
    out: list[PdfPageImage] = []
    truncated = False

    doc = fitz.open(stream=raw, filetype="pdf")
    try:
        total = doc.page_count
        if total > req.max_pages:
            truncated = True
        zoom = req.dpi / 72.0
        mat = fitz.Matrix(zoom, zoom)
        for idx in range(min(total, req.max_pages)):
            page = doc.load_page(idx)
            pix = page.get_pixmap(matrix=mat, alpha=False)
            img = Image.open(io.BytesIO(pix.tobytes("png")))
            w, h = img.size
            if max(w, h) > req.max_side:
                if w >= h:
                    img = img.resize((req.max_side, int(h * req.max_side / w)))
                else:
                    img = img.resize((int(w * req.max_side / h), req.max_side))
            buf = io.BytesIO()
            img.save(buf, format="PNG", optimize=True)
            png = buf.getvalue()
            out.append(
                PdfPageImage(
                    page_no=idx + 1,
                    width=img.size[0],
                    height=img.size[1],
                    png_b64=base64.b64encode(png).decode("ascii"),
                ),
            )
    finally:
        doc.close()

    logger.info(
        "extract.pdf_to_images.ok",
        url=req.url[-48:],
        total=total,
        rendered=len(out),
        truncated=truncated,
    )
    return PdfToImagesResponse(pages=out, total_pages=total, truncated=truncated)


__all__: tuple[str, ...] = ("extract_document", "pdf_to_images")


_ = Any
