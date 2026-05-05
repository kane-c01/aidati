"""主观题批改(grade-paper)请求与响应模型"""

from __future__ import annotations

from typing import Optional

from pydantic import BaseModel, Field

from app.models.question import LlmUsage


class GradeAnswerItem(BaseModel):
    """业务后端把每道主观题的题干 + 标准答案 + 用户答案打包给 ai-service"""

    question_id: str
    stem: str = Field(min_length=1, max_length=2000)
    """题干"""
    reference_answer: str = Field(default="", max_length=4000)
    """标准/参考答案(若 LLM 出题时已给, 直接传过来)"""
    knowledge_points: list[str] = Field(default_factory=list)
    user_answer: str = Field(default="", max_length=8000)
    full_score: int = Field(default=10, ge=1, le=100)


class GradePaperRequest(BaseModel):
    paper_id: str
    user_id: str
    items: list[GradeAnswerItem] = Field(min_length=1, max_length=50)


class GradeAnswerResult(BaseModel):
    """单题批改结果"""

    question_id: str
    score: int = Field(ge=0, le=100)
    is_correct: bool
    """0..1, AI 自评信心"""
    confidence: float = Field(ge=0, le=1, default=0.8)
    feedback: str = Field(min_length=8, max_length=2000)
    """≥ 20 字, 给具体改进建议(PRD §3.3)"""
    suggestions: Optional[str] = Field(default=None, max_length=2000)


class GradePaperResponse(BaseModel):
    paper_id: str
    results: list[GradeAnswerResult]
    usage: LlmUsage
