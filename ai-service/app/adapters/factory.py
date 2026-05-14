"""LLM provider 工厂 + 主备切换链"""

from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from app.models.llm_runtime import LlmRuntimeConfig

import structlog
from tenacity import retry, retry_if_exception_type, stop_after_attempt, wait_exponential

from app.adapters.base import LLMProvider, LLMResult
from app.adapters.mock import MockLLMProvider
from app.adapters.openai_compat import OpenAICompatProvider
from app.core.config import settings

logger = structlog.get_logger()


# 单价(元/千 token), 与 PRD §10.1 对齐
_COSTS = {
    "deepseek-chat": (0.001, 0.002),
    "deepseek-reasoner": (0.004, 0.016),
    "qwen-plus": (0.004, 0.008),
    "qwen-turbo": (0.0008, 0.002),
    "glm-4-flash": (0.0, 0.0),  # 免费额度
}


def build_provider(name: str) -> LLMProvider:
    """按名字实例化一个 provider"""
    if name == "mock" or settings.llm_force_mock:
        return MockLLMProvider()

    if name == "deepseek":
        model = "deepseek-chat"
        return OpenAICompatProvider(
            name="deepseek",
            base_url=settings.deepseek_base_url,
            api_key=settings.deepseek_api_key,
            model=model,
            cost_per_1k_input=_COSTS[model][0],
            cost_per_1k_output=_COSTS[model][1],
        )

    if name == "qwen":
        model = "qwen-plus"
        return OpenAICompatProvider(
            name="qwen",
            base_url=settings.qwen_base_url,
            api_key=settings.qwen_api_key,
            model=model,
            cost_per_1k_input=_COSTS[model][0],
            cost_per_1k_output=_COSTS[model][1],
        )

    if name == "glm":
        model = "glm-4-flash"
        return OpenAICompatProvider(
            name="glm",
            base_url=settings.glm_base_url,
            api_key=settings.glm_api_key,
            model=model,
            cost_per_1k_input=_COSTS[model][0],
            cost_per_1k_output=_COSTS[model][1],
        )

    raise ValueError(f"未知 LLM provider: {name}")


def build_chain() -> list[LLMProvider]:
    """按 settings 配置返回主备链:[primary, *backups]
    任意 provider 失败由 LLMChain 自动降级
    """
    if settings.llm_force_mock:
        logger.info("llm.chain.mock_only")
        return [MockLLMProvider()]

    chain: list[LLMProvider] = []
    seen: set[str] = set()
    candidates = [settings.llm_primary_provider, *settings.llm_backup_providers, "mock"]
    for name in candidates:
        if name in seen:
            continue
        try:
            p = build_provider(name)
            chain.append(p)
            seen.add(name)
        except Exception as err:
            logger.warning("llm.chain.build_failed", provider=name, err=str(err))
    if not chain:
        chain = [MockLLMProvider()]
    logger.info("llm.chain.built", chain=[p.name for p in chain])
    return chain


def build_chain_from_runtime(rt: "LlmRuntimeConfig | None" = None) -> list[LLMProvider]:
    """按后端注入的运行时配置构建 provider 链; 若 rt 为 None 退化为 build_chain()"""
    if rt is None:
        return build_chain()
    if settings.llm_force_mock:
        return [MockLLMProvider()]

    chain: list[LLMProvider] = []

    def _try_add(name: str, model: str, api_key: str | None, base_url: str | None) -> None:
        key = (api_key or "").strip()
        if not key:
            return
        cost = _COSTS.get(model, (0.002, 0.004))
        chain.append(
            OpenAICompatProvider(
                name=name,
                base_url=(base_url or "").strip() or getattr(settings, f"{name}_base_url", ""),
                api_key=key,
                model=model,
                cost_per_1k_input=cost[0],
                cost_per_1k_output=cost[1],
            )
        )

    primary = (rt.primary_model or "deepseek-chat").strip()
    backup = (rt.backup_model or "qwen-plus").strip()

    if "deepseek" in primary:
        _try_add("deepseek", primary, rt.deepseek_api_key or settings.deepseek_api_key, rt.deepseek_base_url)
    elif "qwen" in primary:
        _try_add("qwen", primary, rt.qwen_api_key or settings.qwen_api_key, rt.qwen_base_url)
    elif "glm" in primary:
        _try_add("glm", primary, rt.glm_api_key or settings.glm_api_key, rt.glm_base_url)

    if "deepseek" in backup and all(p.name != "deepseek" for p in chain):
        _try_add("deepseek", backup, rt.deepseek_api_key or settings.deepseek_api_key, rt.deepseek_base_url)
    if "qwen" in backup and all(p.name != "qwen" for p in chain):
        _try_add("qwen", backup, rt.qwen_api_key or settings.qwen_api_key, rt.qwen_base_url)
    if "glm" in backup and all(p.name != "glm" for p in chain):
        _try_add("glm", backup, rt.glm_api_key or settings.glm_api_key, rt.glm_base_url)

    if not chain:
        chain = [MockLLMProvider()]
    chain.append(MockLLMProvider())
    logger.info("llm.chain_from_runtime.built", chain=[p.name for p in chain])
    return chain


class LLMChain:
    """主备 LLM 链 - 顺序尝试, 任一成功即返回, 全部失败抛 RuntimeError"""

    def __init__(self, providers: list[LLMProvider]) -> None:
        if not providers:
            raise ValueError("LLMChain 至少需要 1 个 provider")
        self.providers = providers

    @retry(
        stop=stop_after_attempt(2),
        wait=wait_exponential(multiplier=0.5, max=4),
        retry=retry_if_exception_type(Exception),
        reraise=True,
    )
    async def _call_one(
        self,
        provider: LLMProvider,
        *,
        system: str,
        user: str,
        json_mode: bool,
        max_tokens: int,
        temperature: float,
    ) -> LLMResult:
        return await provider.chat_completion(
            system=system,
            user=user,
            json_mode=json_mode,
            max_tokens=max_tokens,
            temperature=temperature,
        )

    async def chat(
        self,
        *,
        system: str,
        user: str,
        json_mode: bool = True,
        max_tokens: int = 4096,
        temperature: float = 0.4,
    ) -> LLMResult:
        last_err: Exception | None = None
        for provider in self.providers:
            try:
                logger.debug("llm.try", provider=provider.name)
                return await self._call_one(
                    provider,
                    system=system,
                    user=user,
                    json_mode=json_mode,
                    max_tokens=max_tokens,
                    temperature=temperature,
                )
            except Exception as err:
                last_err = err
                logger.warning(
                    "llm.provider_failed",
                    provider=provider.name,
                    err=str(err)[:200],
                )
                continue
        raise RuntimeError(f"全部 LLM provider 调用失败: {last_err}")
