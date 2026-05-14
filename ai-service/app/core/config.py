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
    llm_primary_provider: str = "deepseek"  # deepseek | qwen | glm | mock
    llm_backup_providers: list[str] = ["qwen", "glm"]
    """无 API key 时强制走 mock(本地调试默认 true)"""
    llm_force_mock: bool = True
    deepseek_api_key: str = ""
    deepseek_base_url: str = "https://api.deepseek.com"
    qwen_api_key: str = ""
    qwen_base_url: str = "https://dashscope.aliyuncs.com/compatible-mode/v1"
    glm_api_key: str = ""
    glm_base_url: str = "https://open.bigmodel.cn/api/paas/v4"

    # 视觉模型(VL)
    vision_provider: str = "qwen_vl"
    vision_model: str = "qwen-vl-max"
    vision_cost_per_1k_input: float = 0.003
    vision_cost_per_1k_output: float = 0.006

    # 微信内容安全 API(M6 接入)
    wechat_appid: str = ""
    wechat_secret: str = ""

    # 与业务后端的内部通信
    backend_callback_url: str = "http://localhost:3000/v1"
    """业务后端 → ai-service 通过 X-Internal-Token 头鉴权
    生产建议从 KMS 注入, 与后端共享同一密钥"""
    internal_token: str = "dev-internal-token-please-change"


@lru_cache(maxsize=1)
def _get_settings() -> Settings:
    return Settings()


settings = _get_settings()
