"""OpenAI 协议兼容的 LLM 适配器

DeepSeek / 通义千问(dashscope-compatible-mode)/ 智谱 GLM-4-Flash 都暴露
OpenAI 兼容 API,共用一套 SDK 实现, 只需改 base_url + api_key + model 名。
"""

from __future__ import annotations

import structlog
from openai import AsyncOpenAI
from openai._exceptions import APIError, APITimeoutError, RateLimitError

from app.adapters.base import LLMProvider, LLMResult

logger = structlog.get_logger()


def _effective_api_key(raw: str) -> tuple[str, bool]:
    """去掉空白；把仓库/样例占位符视作未配置(避免带着 __xxx__ 去调 DeepSeek 再层层失败落到 mock)。 """
    key = (raw or "").strip()
    if not key:
        return "", False
    if key.startswith("__") and key.endswith("__"):
        return "", False
    return key, True


class OpenAICompatProvider(LLMProvider):
    """通用 OpenAI 兼容 provider"""

    def __init__(
        self,
        *,
        name: str,
        base_url: str,
        api_key: str,
        model: str,
        cost_per_1k_input: float,
        cost_per_1k_output: float,
        timeout_sec: float = 60.0,
    ) -> None:
        self.name = name
        self.model = model
        clean_key, has_key = _effective_api_key(api_key)
        self._client = AsyncOpenAI(
            api_key=clean_key or "missing",
            base_url=base_url,
            timeout=timeout_sec,
        )
        self._cost_in = cost_per_1k_input
        self._cost_out = cost_per_1k_output
        self._has_key = has_key

    async def chat_completion(
        self,
        *,
        system: str,
        user: str,
        json_mode: bool = True,
        max_tokens: int = 4096,
        temperature: float = 0.4,
    ) -> LLMResult:
        if not self._has_key:
            raise RuntimeError(f"{self.name} API key 未配置")

        kwargs: dict = {
            "model": self.model,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
            "max_tokens": max_tokens,
            "temperature": temperature,
        }
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        try:
            resp = await self._client.chat.completions.create(**kwargs)
        except RateLimitError as err:
            logger.warning("llm.rate_limited", provider=self.name, err=str(err))
            raise
        except APITimeoutError as err:
            logger.warning("llm.timeout", provider=self.name, err=str(err))
            raise
        except APIError as err:
            logger.warning("llm.api_error", provider=self.name, err=str(err))
            raise

        text = (resp.choices[0].message.content or "").strip()
        usage = resp.usage
        tokens_in = usage.prompt_tokens if usage else 0
        tokens_out = usage.completion_tokens if usage else 0
        cost = (tokens_in * self._cost_in + tokens_out * self._cost_out) / 1000.0

        return LLMResult(
            text=text,
            model=self.model,
            tokens_input=tokens_in,
            tokens_output=tokens_out,
            cost_yuan=round(cost, 4),
        )

    async def health(self) -> bool:
        if not self._has_key:
            return False
        try:
            r = await self.chat_completion(
                system="ping",
                user="ping",
                json_mode=False,
                max_tokens=4,
                temperature=0,
            )
            return bool(r.text)
        except Exception:
            return False
