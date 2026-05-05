"""LLM 适配器抽象 - 业务代码统一面向本接口编程"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass


@dataclass
class LLMResult:
    """LLM 单次调用结果"""

    text: str
    """模型的原始字符串输出, JSON 模式下应为合法 JSON 字符串"""
    model: str
    tokens_input: int
    tokens_output: int
    """元/千 token 估算成本(由 provider 自己折算)"""
    cost_yuan: float


class LLMProvider(ABC):
    """LLM 提供商抽象接口

    主备切换由调用方(LLM Chain)决定;每个具体 provider 只关心自己的 SDK 调用。
    """

    name: str = "abstract"

    @abstractmethod
    async def chat_completion(
        self,
        *,
        system: str,
        user: str,
        json_mode: bool = True,
        max_tokens: int = 4096,
        temperature: float = 0.4,
    ) -> LLMResult:
        """调用一次对话补全, 返回 LLMResult"""
        raise NotImplementedError

    @abstractmethod
    async def health(self) -> bool:
        """快速健康探测(供 /readyz 使用)"""
        raise NotImplementedError
