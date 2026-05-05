"""内部 token 鉴权 - 仅业务后端可调 ai-service"""

from __future__ import annotations

from fastapi import Header, HTTPException, status

from app.core.config import settings


async def require_internal_token(
    x_internal_token: str = Header(default=""),
) -> None:
    """请求头 X-Internal-Token 必须等于 settings.internal_token"""
    expected = settings.internal_token
    if not expected or x_internal_token != expected:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="invalid internal token",
        )
