"""
AI 编排服务入口

职责(整体):
- 出题(POST /generate-paper):基于章节/拍照内容调用 LLM 生成题目
- 批改(POST /grade-paper):主观题 AI 评分
- OCR 兜底(POST /ocr):微信侧失败时的腾讯云/百度云备援

实际业务路由会在 M3 里程碑实现, M0 阶段仅提供健康检查端点。
路由契约见《03-API接口文档.md》§十三, 由业务后端 (NestJS) 通过内部网络调用。
"""

from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import AsyncIterator

import structlog
from fastapi import FastAPI

from app.adapters.openai_compat import _effective_api_key
from app.core.config import settings
from app.core.logging import setup_logging
from app.routers import extract as extract_router
from app.routers import generate as generate_router
from app.routers import grade as grade_router

logger = structlog.get_logger()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """应用生命周期 - 启动 / 关闭钩子"""
    setup_logging(settings.log_level)
    logger.info(
        "ai_service.startup",
        env=settings.env,
        port=settings.port,
        version=settings.version,
        llm_force_mock=settings.llm_force_mock,
    )
    if not settings.llm_force_mock:
        has_any_llm_key = (
            _effective_api_key(settings.deepseek_api_key)[1]
            or _effective_api_key(settings.qwen_api_key)[1]
            or _effective_api_key(settings.glm_api_key)[1]
        )
        if not has_any_llm_key:
            logger.warning(
                "ai_service.no_valid_llm_keys",
                msg="未配置有效 LLM API Key(或仍为 __placeholder__)，请求将落到链条末端的 MOCK，用户会看到「占位 A/B」题干。请在环境变量中写入 DEEPSEEK_API_KEY / QWEN_API_KEY / GLM_API_KEY 其一。",
            )
    yield
    logger.info("ai_service.shutdown")


app = FastAPI(
    title="考题魔盒 - AI 编排服务",
    version=settings.version,
    docs_url="/docs" if settings.env != "production" else None,
    redoc_url=None,
    openapi_url="/openapi.json" if settings.env != "production" else None,
    lifespan=lifespan,
)

app.include_router(extract_router.router)
app.include_router(generate_router.router)
app.include_router(grade_router.router)


@app.get("/healthz")
async def healthz() -> dict[str, str]:
    """进程存活探针"""
    return {
        "status": "ok",
        "ts": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/readyz")
async def readyz() -> dict[str, object]:
    """依赖就绪探针 - 检查 LLM 主链是否可用"""
    from app.services.llm_client import get_llm_client

    client = get_llm_client()
    primary = client.chain.providers[0] if client.chain.providers else None
    llm_ok = await primary.health() if primary else False
    return {
        "status": "ok" if llm_ok else "degraded",
        "deps": {
            "redis": "pending",
            "llm": "ok" if llm_ok else "fail",
            "llm_primary": primary.name if primary else "none",
        },
    }


@app.get("/version")
async def version() -> dict[str, str]:
    return {
        "version": settings.version,
        "env": settings.env,
    }
