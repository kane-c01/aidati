/**
 * BullMQ 队列名称常量
 * 文档:01-技术架构 §3.3
 *
 * 单一来源, 业务侧 Inject + Processor 装饰器都从这里取, 防止字符串漂移
 */

export const QUEUE_PAPER_GENERATE = 'paper-generate';
export const QUEUE_PAPER_GRADE = 'paper-grade';

export interface PaperGenerateJobData {
  paper_id: string;
  user_id: string;
}

export interface PaperGradeJobData {
  paper_id: string;
  user_id: string;
}
