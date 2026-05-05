/**
 * 与 ai-service(FastAPI)RPC 数据契约
 * 必须与 ai-service/app/models/ 严格对齐
 */

export type QuestionType = 'single' | 'multiple' | 'judge' | 'fill' | 'short_answer';
export type DifficultyLevel = 'easy' | 'medium' | 'hard';
export type SourceType = 'book' | 'chapter' | 'photo_set';

export interface GenerateConfigDto {
  question_types: QuestionType[];
  difficulty: DifficultyLevel;
  count: number;
  custom_prompt?: string | null;
}

export interface GeneratePaperRequestDto {
  paper_id: string;
  user_id: string;
  source_type: SourceType;
  config: GenerateConfigDto;
  context_text: string;
  book_title?: string | null;
  chapter_titles?: string[] | null;
}

export interface QuestionOption {
  id: string;
  text: string;
}

export interface GeneratedQuestion {
  order_no: number;
  type: QuestionType;
  difficulty: DifficultyLevel;
  stem: string;
  options?: QuestionOption[] | null;
  correct_answer: unknown;
  explanation: string;
  knowledge_points: string[];
  score: number;
}

export interface LlmUsage {
  model: string;
  tokens_input: number;
  tokens_output: number;
  cost_yuan: number;
  provider: string;
}

export interface GeneratePaperResponseDto {
  paper_id: string;
  questions: GeneratedQuestion[];
  usage: LlmUsage;
}

export interface GradeAnswerItemDto {
  question_id: string;
  stem: string;
  reference_answer: string;
  knowledge_points: string[];
  user_answer: string;
  full_score: number;
}

export interface GradePaperRequestDto {
  paper_id: string;
  user_id: string;
  items: GradeAnswerItemDto[];
}

export interface GradeAnswerResultDto {
  question_id: string;
  score: number;
  is_correct: boolean;
  confidence: number;
  feedback: string;
  suggestions?: string | null;
}

export interface GradePaperResponseDto {
  paper_id: string;
  results: GradeAnswerResultDto[];
  usage: LlmUsage;
}
