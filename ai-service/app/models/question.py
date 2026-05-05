"""出题(generate-paper)请求与响应模型"""

from __future__ import annotations

from typing import Literal, Optional

from pydantic import BaseModel, Field, field_validator

QuestionType = Literal["single", "multiple", "judge", "fill", "short_answer"]
DifficultyLevel = Literal["easy", "medium", "hard"]
SourceType = Literal["book", "chapter", "photo_set"]


class GenerateConfig(BaseModel):
    """前端选的出题参数 - 与 02 文档 §3.6 paper.config 一致"""

    question_types: list[QuestionType] = Field(min_length=1, max_length=5)
    difficulty: DifficultyLevel = "medium"
    count: int = Field(ge=1, le=50)
    custom_prompt: Optional[str] = Field(default=None, max_length=500)


class GeneratePaperRequest(BaseModel):
    """业务后端 → ai-service POST /generate-paper"""

    paper_id: str = Field(description="业务侧 paper.id, 仅用作日志关联")
    user_id: str = Field(description="用户 id, 仅日志")
    source_type: SourceType
    config: GenerateConfig
    """素材正文(章节合并文本 / 拍照集 OCR 文本), 由后端预先拼好"""
    context_text: str = Field(min_length=10, max_length=80_000)
    book_title: Optional[str] = Field(default=None, max_length=256)
    chapter_titles: Optional[list[str]] = Field(default=None)


class GeneratedQuestion(BaseModel):
    """LLM 输出的单道题, 与 prisma Question 字段一一对应"""

    order_no: int = Field(ge=1, le=50)
    type: QuestionType
    difficulty: DifficultyLevel
    stem: str = Field(min_length=4, max_length=2000)
    options: Optional[list[dict]] = Field(default=None)
    """[{ id: 'A', text: '...' }, ...] - single / multiple 必填, judge 可选(默认 A=正确 B=错误), fill / short_answer 不需要"""
    correct_answer: list | str | bool = Field(
        description="['A'] / ['A','B'] / true / '答案文本'(fill 多个用 / 分隔)"
    )
    explanation: str = Field(min_length=4, max_length=2000)
    knowledge_points: list[str] = Field(default_factory=list, max_length=10)
    score: int = Field(default=10, ge=1, le=100)

    @field_validator("options")
    @classmethod
    def options_consistent_with_type(cls, v, info):
        # 仅做粗校验, 严格校验在 parser 层做
        return v


class LlmUsage(BaseModel):
    """LLM 使用量统计, 业务侧用于成本审计"""

    model: str
    tokens_input: int = 0
    tokens_output: int = 0
    cost_yuan: float = 0.0
    provider: str
    """deepseek | qwen | glm | mock"""


class GeneratePaperResponse(BaseModel):
    """ai-service → 业务后端"""

    paper_id: str
    questions: list[GeneratedQuestion]
    usage: LlmUsage
