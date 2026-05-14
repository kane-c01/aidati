"""文档/区域识别 RPC 契约 - 与 backend/src/infra/ai-service/ai-service.types.ts 对齐"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field

RegionKind = Literal["text", "chart", "formula", "table"]


class VisionRuntimeConfig(BaseModel):
    """视觉模型运行时(从 backend system_config 注入,覆盖进程 env)"""

    provider: Optional[str] = Field(default=None, max_length=64)
    """目前仅支持 'qwen_vl'(DashScope OpenAI 兼容);为后续扩展(腾讯 / 智谱 VL)预留"""
    model: Optional[str] = Field(default=None, max_length=128)
    """模型名,默认 qwen-vl-max"""
    api_key: Optional[str] = Field(default=None, max_length=512)
    """优先于 settings.qwen_api_key"""
    base_url: Optional[str] = Field(default=None, max_length=512)


# ===== 整文档抽取 =====


class ExtractDocumentRequest(BaseModel):
    """整张图 / 整篇 PDF → 结构化 Markdown(含表格/公式/图表占位)

    `url` 与 `image_b64` 二选一:
    - 优先 image_b64(由 backend 从 OSS 拉到内存后转发, 跳过 DashScope 拉外网 URL),
      在 dev/内网部署、OSS 不公开访问的场景里直接消除了「DashScope 拉不到图」的超时
    - 兜底 url(公开 OSS / 预签 / 三方 https 图)
    """

    url: Optional[str] = Field(default=None, max_length=1024)
    """图片或 PDF 的可访问 URL(优先 OSS 公网或预签名)"""

    image_b64: Optional[str] = Field(default=None, max_length=20 * 1024 * 1024)
    """图片原始字节的 base64 (无 'data:image/...;base64,' 前缀);单张 < 15 MB"""

    image_mime: Optional[str] = Field(default="image/jpeg", max_length=64)
    """配合 image_b64 使用的 mime; 默认 image/jpeg, 上传压缩后通常都是 JPEG"""

    kind: Literal["image", "pdf"] = "image"

    language_hint: Optional[str] = Field(default="zh", max_length=8)

    vision_runtime: Optional[VisionRuntimeConfig] = None


class ExtractedRegion(BaseModel):
    """文档抽取结果中的一段(供后台校对页可视化)"""

    kind: RegionKind
    bbox: Optional[list[float]] = None
    """[x, y, w, h] 归一化或像素;若 kind=text 整段全屏可省略"""
    text: Optional[str] = None
    chart_data: Optional[dict] = None


class ExtractedPage(BaseModel):
    page_no: int = 1
    markdown: str = ""
    regions: list[ExtractedRegion] = []


class ExtractDocumentResponse(BaseModel):
    pages: list[ExtractedPage]
    """整文档 Markdown(所有 page.markdown 拼接,便于 LLM 后续切章节)"""
    markdown: str = ""
    chapter_hints: list[str] = []
    """启发式抽出来的章节标题候选;LLM 切章节时作为 hint"""
    usage: Optional[dict] = None
    """{model, tokens_input, tokens_output, cost_yuan, provider}"""


# ===== 单区域识别(框选 OCR / 图表识别) =====


class RecognizeRegionRequest(BaseModel):
    """对单张图的某个矩形区域做识别"""

    image_url: str = Field(min_length=1, max_length=1024)
    bbox: list[float] = Field(min_length=4, max_length=4)
    """[x, y, w, h]; 当 coord=normalized 时为 0-1, pixel 时为像素整数"""
    coord: Literal["normalized", "pixel"] = "normalized"
    kind: RegionKind = "text"

    vision_runtime: Optional[VisionRuntimeConfig] = None


class RecognizeRegionResponse(BaseModel):
    kind: RegionKind
    ocr_text: Optional[str] = None
    chart_data: Optional[dict] = None
    confidence: Optional[float] = None
    usage: Optional[dict] = None


# ===== PDF 拆页为图片(供"拍照集"统一入口) =====


class PdfToImagesRequest(BaseModel):
    """把 PDF 渲染成多张 PNG, 供 backend 上传到 OSS 后建拍照集。

    与 extract_document 不同, 此接口只输出图片字节, 不调 VL 也不抽 markdown,
    完全本地 fitz + Pillow 处理(无云费、毫秒级)。
    """

    url: str = Field(min_length=1, max_length=1024)
    """PDF 的可访问 URL(优先 OSS 公网或预签名)"""

    max_pages: int = Field(default=50, ge=1, le=200)
    """安全闸门:超过 max_pages 直接报错(避免一次跑 200 页拖死服务)"""

    dpi: int = Field(default=150, ge=72, le=300)
    """渲染 DPI;150 ≈ 屏幕清晰度, 300 偏激进, 默认 150 平衡"""

    max_side: int = Field(default=1600, ge=480, le=2400)
    """渲染后再缩放, 单边不超过此像素;OCR 1600 已经够清晰"""


class PdfPageImage(BaseModel):
    page_no: int = Field(ge=1)
    width: int = Field(ge=1)
    height: int = Field(ge=1)
    png_b64: str
    """PNG 字节的 base64;backend 解码后直接 PutObject 到 OSS"""


class PdfToImagesResponse(BaseModel):
    pages: list[PdfPageImage]
    total_pages: int
    """PDF 实际页数(可能 > max_pages, 此时仅返回前 max_pages 张, total_pages 仍是真实总数)"""

    truncated: bool = False
    """是否因 max_pages 截断"""


# ===== LLM 切章节 =====


class SplitChaptersRequest(BaseModel):
    """全文 markdown → 结构化章节"""

    markdown: str = Field(min_length=1, max_length=200_000)
    """章节标题候选(启发式 + 书签),作为 LLM 的强 hint"""
    chapter_hints: list[str] = Field(default_factory=list)
    book_title: Optional[str] = None
    """期望切出的章节数量上限(LLM 会在不超过该值的情况下自然切分);留空交给 LLM 自决"""
    max_chapters: Optional[int] = Field(default=None, ge=1, le=200)

    llm_runtime: Optional[dict] = None
    """复用现有 LlmRuntimeConfig(为防 import 循环,这里用 dict 接,内部转 LlmRuntimeConfig)"""


class SplitChapter(BaseModel):
    order_no: int = Field(ge=1)
    title: str = Field(min_length=1, max_length=128)
    content_summary: Optional[str] = Field(default=None, max_length=2000)
    content_full: str = ""


class SplitChaptersResponse(BaseModel):
    chapters: list[SplitChapter]
    usage: Optional[dict] = None
