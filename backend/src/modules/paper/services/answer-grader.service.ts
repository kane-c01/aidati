import { Injectable, Logger } from '@nestjs/common';
import { GradedBy, type Question, QuestionType } from '@prisma/client';

import { sha256 } from '../../../common/utils/sha256';

export interface ObjectiveGradeOutcome {
  question_id: string;
  is_correct: boolean | null; // null = 主观题待 AI 批
  score: number;
  graded_by: GradedBy | null;
  needs_ai: boolean;
  user_answer_serialized: unknown;
}

/**
 * 题干哈希(用于错题去重 + 题干变化检测)
 * 02 文档 §3.7 字段 stem_hash
 */
export function buildStemHash(stem: string, type: QuestionType): string {
  const normalized = stem.replace(/\s+/g, '').trim();
  return sha256(`${type}:${normalized}`);
}

/**
 * 客观题本地批改器
 * 文档:01-技术架构 §4.2 / 03-API §7.6
 *
 * 五种题型:
 * - single   选项 ID 数组完全相等
 * - multiple 选项 ID 集合完全相等(乱序也算对)
 * - judge    bool 相等
 * - fill     标准答案多个用「/」分隔, 命中任一即对(忽略大小写/首尾空白)
 * - short_answer 不在此处批改, 标记 needs_ai=true 由 ai-service 评分
 */
@Injectable()
export class AnswerGraderService {
  private readonly logger = new Logger(AnswerGraderService.name);

  /**
   * 对一道题做客观批改, 返回结果
   */
  grade(question: Question, rawUserAnswer: unknown): ObjectiveGradeOutcome {
    const baseId = question.id.toString();
    const fullScore = question.score;
    const correct = question.correctAnswer as unknown;

    if (question.type === QuestionType.short_answer) {
      return {
        question_id: baseId,
        is_correct: null,
        score: 0,
        graded_by: null,
        needs_ai: true,
        user_answer_serialized: this.serialize(rawUserAnswer),
      };
    }

    let isCorrect = false;
    switch (question.type) {
      case QuestionType.single:
      case QuestionType.multiple:
        isCorrect = this.compareOptionSet(correct, rawUserAnswer);
        break;
      case QuestionType.judge:
        isCorrect = this.compareJudge(correct, rawUserAnswer);
        break;
      case QuestionType.fill:
        isCorrect = this.compareFill(correct, rawUserAnswer);
        break;
      default:
        this.logger.warn(`未知题型 ${question.type}, 默认判错`);
        isCorrect = false;
    }

    return {
      question_id: baseId,
      is_correct: isCorrect,
      score: isCorrect ? fullScore : 0,
      graded_by: GradedBy.local,
      needs_ai: false,
      user_answer_serialized: this.serialize(rawUserAnswer),
    };
  }

  /** 把 user_answer 转成可写入 Json 列的安全形式 */
  serialize(raw: unknown): unknown {
    if (raw === undefined) return null;
    return raw;
  }

  // ===== 内部:各题型比对 =====

  private compareOptionSet(correct: unknown, user: unknown): boolean {
    const c = this.normalizeStringArray(correct);
    const u = this.normalizeStringArray(user);
    if (c.length === 0 || u.length === 0) return false;
    if (c.length !== u.length) return false;
    const cs = new Set(c);
    return u.every((x) => cs.has(x));
  }

  private compareJudge(correct: unknown, user: unknown): boolean {
    const c = this.toBool(correct);
    const u = this.toBool(user);
    if (c === null || u === null) return false;
    return c === u;
  }

  private compareFill(correct: unknown, user: unknown): boolean {
    const c = this.toFillString(correct);
    const u = this.toFillString(user);
    if (!c || !u) return false;
    const candidates = c
      .split('/')
      .map((x) => this.normalizeText(x))
      .filter(Boolean);
    const userText = this.normalizeText(u);
    return candidates.some((cand) => cand === userText);
  }

  private normalizeStringArray(value: unknown): string[] {
    if (Array.isArray(value)) return value.map((v) => String(v).trim().toUpperCase());
    if (typeof value === 'string') return [value.trim().toUpperCase()];
    return [];
  }

  private toBool(value: unknown): boolean | null {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'number') return value !== 0;
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      if (['true', 't', 'yes', 'y', '1', '对', '正确'].includes(v)) return true;
      if (['false', 'f', 'no', 'n', '0', '错', '错误'].includes(v)) return false;
    }
    if (Array.isArray(value) && value.length === 1) {
      return this.toBool(value[0]);
    }
    return null;
  }

  private toFillString(value: unknown): string | null {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) return value.map(String).join('/');
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    return null;
  }

  private normalizeText(text: string): string {
    return text.replace(/\s+/g, '').toLowerCase();
  }
}
