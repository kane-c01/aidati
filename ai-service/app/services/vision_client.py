"""通义千问 VL(及任何 OpenAI 兼容多模态模型)客户端

设计要点:
1. 对外只暴露两个高层方法
   - extract_document(url, kind)  → markdown + chapter_hints
   - recognize_region(image_url, bbox, coord, kind) → ocr_text 或 chart_data
2. 内部统一走 OpenAI 兼容的 chat.completions(DashScope 官方在
   `https://dashscope.aliyuncs.com/compatible-mode/v1` 暴露 VL),
   完全不引入额外 SDK,与现有 LLM provider 共用 base_url + api_key。
3. 整张图 → markdown 用 image_url 直接传 OSS 公网 URL;
   单区域识别先用 PIL 把矩形抠出来转 base64 再丢给模型(保证不依赖第三方裁剪服务)。
"""

from __future__ import annotations

import base64
import io
import json
import re
from typing import Any

import httpx
import structlog
from openai import AsyncOpenAI

from app.core.config import settings
from app.models.extract import (
    ExtractDocumentRequest,
    ExtractDocumentResponse,
    ExtractedPage,
    ExtractedRegion,
    RecognizeRegionRequest,
    RecognizeRegionResponse,
    RegionKind,
    VisionRuntimeConfig,
)

logger = structlog.get_logger()


# ---------- 提示词 ----------

DOC_EXTRACT_SYSTEM = (
    "你是文档识别助手。请把图片或 PDF 页面识别成结构化 Markdown,要求:\n"
    "1. 正文按原文流式输出,保留段落 / 列表 / 加粗 / 分级标题(用 # / ##)\n"
    "2. 表格用 GFM Markdown 表格语法\n"
    "3. 数学公式用 LaTeX 行内 $...$ 或块 $$...$$\n"
    "4. 图表 / 插图 用 ![chart](#) 占位, 并紧接一行 \"> 图表说明: ...\"\n"
    "5. 章节大标题前加一个空行, 便于下游切分\n"
    "6. 不要输出额外说明 / 不要解释你做了什么\n"
)


REGION_TEXT_SYSTEM = "请识别这张图中的所有文字, 直接输出原文(可含换行 / 标点)。不要任何解释或前缀。"


REGION_FORMULA_SYSTEM = (
    "请把图中的数学公式识别成 LaTeX, 直接输出 LaTeX 源码,"
    "可用 $...$ 或 $$...$$ 包裹。不要任何解释。"
)


REGION_TABLE_SYSTEM = (
    "请把图中的表格识别成 GitHub Flavored Markdown 表格,"
    "直接输出表格,不要任何解释。"
)


REGION_CHART_SYSTEM = (
    "请把图中的图表识别成结构化 JSON, 严格按以下 schema 输出, 不要解释:\n"
    "{\n"
    '  "type": "bar | line | pie | scatter | other",\n'
    '  "title": "...",\n'
    '  "x_label": "...",\n'
    '  "y_label": "...",\n'
    '  "series": [\n'
    '    { "name": "...", "points": [{"x": "...", "y": 12.3}, ...] }\n'
    "  ],\n"
    '  "summary": "一句话概述图表传达的信息"\n'
    "}\n"
)


# ---------- 配置解析 ----------


def _resolve_runtime(rt: VisionRuntimeConfig | None) -> tuple[str, str, str, str]:
    """返回 (provider, model, api_key, base_url)"""
    provider = (rt.provider if rt else None) or settings.vision_provider or "qwen_vl"
    model = (rt.model if rt else None) or settings.vision_model or "qwen-vl-max"
    api_key = (rt.api_key if rt else None) or settings.qwen_api_key
    base_url = (rt.base_url if rt else None) or settings.qwen_base_url
    return provider, model, (api_key or "").strip(), (base_url or "").strip()


def _build_client(api_key: str, base_url: str) -> AsyncOpenAI:
    return AsyncOpenAI(
        api_key=api_key or "missing",
        base_url=base_url,
        timeout=120.0,
    )


# ---------- 图像处理 ----------


async def _fetch_image(url: str) -> bytes:
    async with httpx.AsyncClient(timeout=30.0, follow_redirects=True) as client:
        r = await client.get(url)
        r.raise_for_status()
        return r.content


def _crop_region(raw: bytes, bbox: list[float], coord: str) -> bytes:
    """按 bbox 抠图,返回新 PNG 字节"""
    try:
        from PIL import Image  # 延迟 import, 避免启动开销
    except ImportError as err:
        raise RuntimeError(
            "缺少 Pillow, 请在 ai-service 安装 Pillow >=10.0",
        ) from err

    img = Image.open(io.BytesIO(raw))
    img = img.convert("RGB")
    w, h = img.size
    if coord == "normalized":
        x = max(0, int(bbox[0] * w))
        y = max(0, int(bbox[1] * h))
        rw = max(1, int(bbox[2] * w))
        rh = max(1, int(bbox[3] * h))
    else:
        x = max(0, int(bbox[0]))
        y = max(0, int(bbox[1]))
        rw = max(1, int(bbox[2]))
        rh = max(1, int(bbox[3]))
    right = min(w, x + rw)
    bottom = min(h, y + rh)
    crop = img.crop((x, y, right, bottom))
    out = io.BytesIO()
    crop.save(out, format="PNG", optimize=True)
    return out.getvalue()


def _bytes_to_data_url(b: bytes, mime: str = "image/png") -> str:
    return f"data:{mime};base64,{base64.b64encode(b).decode('ascii')}"


# ---------- 调用 VL ----------


def _system_for_kind(kind: RegionKind) -> str:
    if kind == "formula":
        return REGION_FORMULA_SYSTEM
    if kind == "table":
        return REGION_TABLE_SYSTEM
    if kind == "chart":
        return REGION_CHART_SYSTEM
    return REGION_TEXT_SYSTEM


async def _call_vl(
    *,
    client: AsyncOpenAI,
    model: str,
    system: str,
    image_input: dict,
    user_text: str,
    json_mode: bool = False,
    max_tokens: int = 2048,
) -> tuple[str, dict]:
    """统一调用 VL 模型, 返回 (text, usage)"""
    kwargs: dict[str, Any] = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": user_text},
                    image_input,
                ],
            },
        ],
        "max_tokens": max_tokens,
        "temperature": 0.1,
    }
    if json_mode:
        kwargs["response_format"] = {"type": "json_object"}

    resp = await client.chat.completions.create(**kwargs)
    text = (resp.choices[0].message.content or "").strip()
    u = resp.usage
    usage = {
        "model": model,
        "tokens_input": u.prompt_tokens if u else 0,
        "tokens_output": u.completion_tokens if u else 0,
    }
    cost = (
        usage["tokens_input"] * settings.vision_cost_per_1k_input
        + usage["tokens_output"] * settings.vision_cost_per_1k_output
    ) / 1000.0
    usage["cost_yuan"] = round(cost, 4)
    usage["provider"] = "qwen_vl"
    return text, usage


# ---------- 公开方法 ----------


CHAPTER_HEADER_RE = re.compile(r"^\s{0,3}#{1,3}\s+(.+?)\s*$", re.MULTILINE)


def _is_dashscope_compatible_url(url: str) -> bool:
    """https/http 公网 URL 即可由 DashScope 直接 fetch, 跳过本地下载 + base64"""
    u = url.strip().lower()
    return u.startswith("http://") or u.startswith("https://")


async def _build_image_input(
    *, url: str | None = None, image_b64: str | None = None, image_mime: str = "image/jpeg"
) -> dict:
    """构造 OpenAI 兼容的 image_url 入参

    优先级:
    1. image_b64: 由调用方(backend)直接给出 base64, 一次 RTT 直送 DashScope,
       彻底避免 DashScope 远程 fetch OSS 的失败/延迟。最快的路径。
    2. url 是公网 https/http: 透传给 DashScope, 让阿里云服务端去拉。
    3. 兜底: ai-service 自己 fetch -> 转 base64 data URL。
    """
    if image_b64:
        return {
            "type": "image_url",
            "image_url": {"url": f"data:{image_mime};base64,{image_b64}"},
        }
    if not url:
        raise RuntimeError("既未提供 url 也未提供 image_b64")
    if _is_dashscope_compatible_url(url):
        return {"type": "image_url", "image_url": {"url": url}}
    raw = await _fetch_image(url)
    return {
        "type": "image_url",
        "image_url": {"url": _bytes_to_data_url(raw, "image/png")},
    }


async def extract_document(req: ExtractDocumentRequest) -> ExtractDocumentResponse:
    """整张图 / PDF 单页抽取为 Markdown

    PDF 多页:目前只识别第一页(用户场景拍照通常单页);多页 PDF 抽取由
    后端先用 pdfplumber 拆页或转图后再多次调用本接口。
    """
    _, model, api_key, base_url = _resolve_runtime(req.vision_runtime)
    if not api_key:
        raise RuntimeError("vision API key 未配置")
    if req.kind != "image":
        raise RuntimeError("当前 ai-service 适配器仅支持 image; PDF 请由 backend 拆页后传图")
    if not req.url and not req.image_b64:
        raise RuntimeError("ExtractDocumentRequest 必须提供 url 或 image_b64")

    client = _build_client(api_key, base_url)
    image_input = await _build_image_input(
        url=req.url, image_b64=req.image_b64, image_mime=req.image_mime or "image/jpeg"
    )

    md, usage = await _call_vl(
        client=client,
        model=model,
        system=DOC_EXTRACT_SYSTEM,
        image_input=image_input,
        user_text="请把这张文档图片识别成 Markdown",
        max_tokens=4096,
    )

    chapter_hints = [m.group(1).strip() for m in CHAPTER_HEADER_RE.finditer(md)]

    return ExtractDocumentResponse(
        pages=[ExtractedPage(page_no=1, markdown=md, regions=[])],
        markdown=md,
        chapter_hints=chapter_hints,
        usage=usage,
    )


async def recognize_region(req: RecognizeRegionRequest) -> RecognizeRegionResponse:
    """单区域识别 - 文字 / 公式 / 表格 / 图表"""
    _, model, api_key, base_url = _resolve_runtime(req.vision_runtime)
    if not api_key:
        raise RuntimeError("vision API key 未配置")

    client = _build_client(api_key, base_url)

    # 抠区域 → 转 data URL,避免对 OSS 的"裁剪 URL 参数"的依赖
    raw = await _fetch_image(req.image_url)
    cropped = _crop_region(raw, req.bbox, req.coord)
    image_input = {
        "type": "image_url",
        "image_url": {"url": _bytes_to_data_url(cropped, "image/png")},
    }

    system = _system_for_kind(req.kind)
    json_mode = req.kind == "chart"

    text, usage = await _call_vl(
        client=client,
        model=model,
        system=system,
        image_input=image_input,
        user_text="请识别框选区域的内容",
        json_mode=json_mode,
        max_tokens=2048,
    )

    if req.kind == "chart":
        try:
            chart_data = json.loads(text)
        except json.JSONDecodeError:
            logger.warning("vision.chart_json_invalid", raw=text[:200])
            chart_data = {"raw_text": text}
        return RecognizeRegionResponse(
            kind="chart",
            chart_data=chart_data,
            usage=usage,
        )

    return RecognizeRegionResponse(
        kind=req.kind,
        ocr_text=text,
        usage=usage,
    )
