"""配置中心 - 基于 pydantic-settings 自动加载 .env"""

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """全局配置 - 实际密钥从环境变量注入, 严禁硬编码"""

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
        extra="ignore",
    )

    # 基础
    env: str = "development"
    version: str = "0.1.0"
    port: int = 8000
    log_level: str = "INFO"

    # Redis (用于幂等键、限流、任务状态缓存)
    redis_url: str = "redis://localhost:6379/0"

    # LLM 提供商
    llm_primary_provider: str = "deepseek"  # deepseek | qwen | glm
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    qwen_api_key: str = ""
    qwen_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    glm_api_key: str = ""
    glm_base_url: str = "https://open.bigmodel.cn/api/paas/v4"

    # 微信内容安全 API
    wechat_appid: str = ""
    wechat_secret: str = ""

    # 与业务后端的内部通信
    backend_callback_url: str = "http://localhost:3000/v1"
    internal_token: str = ""


@lru_cache(maxsize=1)
def _get_settings() -> Settings:
    return Settings()


settings = _get_settings()
