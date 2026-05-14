"""LLM 运行时配置 - 业务后端从 system_config 注入,覆盖进程环境变量"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field


class LlmRuntimeConfig(BaseModel):
    """与 backend/src/infra/ai-service/ai-service.types.ts LlmRuntimeDto 对齐"""

    primary_model: Optional[str] = Field(default=None, max_length=128)
    backup_model: Optional[str] = Field(default=None, max_length=128)
    deepseek_api_key: Optional[str] = Field(default=None, max_length=512)
    qwen_api_key: Optional[str] = Field(default=None, max_length=512)
    glm_api_key: Optional[str] = Field(default=None, max_length=512)
    deepseek_base_url: Optional[str] = Field(default=None, max_length=512)
    qwen_base_url: Optional[str] = Field(default=None, max_length=512)
    glm_base_url: Optional[str] = Field(default=None, max_length=512)
