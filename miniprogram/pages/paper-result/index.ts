/**
 * U11 结果报告页
 *
 * 提交后 redirect 进来:
 *  - 主观题异步批改, 后端 graded 之前 GET 会返回 grading 状态
 *  - 我们指数退避轮询 1.5s → 3s, 最多 60s; 仍失败则展示「批改超时」
 *
 * 默认展开错题, 折叠正确题
 */

import { paperService } from '../../services';
import { HttpError } from '../../services';
import { paperStore } from '../../stores/paper';
import { sleep, formatDuration } from '../../utils/time';
import { track } from '../../utils/tracker';
import { buildPaperShare } from '../../utils/share';
import { AI_LOW_CONFIDENCE_THRESHOLD, QUESTION_TYPE_LABEL } from '../../config/constants';
import type { PaperResult, PaperResultQuestion } from '../../types/domain';

interface ResultViewQuestion extends PaperResultQuestion {
  typeLabel: string;
  correctAnswerText: string;
  confidenceLowLabel: string;
}

interface PageData {
  paperId: string;
  state: 'loading' | 'graded' | 'failed';
  progress: number;
  result: PaperResult | null;
  viewQuestions: ResultViewQuestion[];
  expandedMap: Record<string, boolean>;
  failMsg: string;
  accuracyLabel: string;
  rankLabel: string;
  durationLabel: string;
}

interface PageMethods {
  fetchLoop: () => Promise<void>;
  onRetry: () => void;
  onToggle: (e: WechatMiniprogram.BaseEvent) => void;
  onGoMistake: () => void;
  onGoConfig: () => void;
  buildView: (r: PaperResult) => ResultViewQuestion[];
}

const TIMEOUT_MS = 60_000;

Page<PageData, PageMethods>({
  data: {
    paperId: '',
    state: 'loading',
    progress: 5,
    result: null,
    viewQuestions: [],
    expandedMap: {},
    failMsg: '',
    accuracyLabel: '',
    rankLabel: '',
    durationLabel: '',
  },

  onLoad(options) {
    const id = options?.paperId ?? '';
    if (!id) {
      this.setData({ state: 'failed', failMsg: '缺少 paperId' });
      return;
    }
    this.setData({ paperId: id });
    void this.fetchLoop();
  },

  onShareAppMessage() {
    if (!this.data.result) return { title: 'AI 智能出题学习', path: '/pages/home/index' };
    return buildPaperShare({
      paperId: this.data.paperId,
      bookTitle: paperStore.currentPaper?.book_id ? '试卷' : null,
      accuracy: this.data.result.summary.accuracy,
    });
  },

  buildView(r) {
    return (r.questions ?? []).map<ResultViewQuestion>((q) => ({
      ...q,
      typeLabel: QUESTION_TYPE_LABEL[q.type] ?? q.type,
      correctAnswerText: formatAnswer(q.correct_answer),
      confidenceLowLabel:
        typeof q.ai_confidence === 'number' && q.ai_confidence < AI_LOW_CONFIDENCE_THRESHOLD
          ? `⚠ AI 评分置信度 ${Math.round(q.ai_confidence * 100)}%, 建议自行判断`
          : '',
    }));
  },

  async fetchLoop() {
    const start = Date.now();
    let interval = 1500;
    while (Date.now() - start < TIMEOUT_MS) {
      try {
        const res = await paperService.result(this.data.paperId);
        if (res.status === 'graded') {
          paperStore.setResult(res);
          const view = this.buildView(res);
          const map: Record<string, boolean> = {};
          view.forEach((q) => {
            if (!q.is_correct) map[q.id] = true;
          });
          this.setData({
            state: 'graded',
            result: res,
            viewQuestions: view,
            progress: 100,
            expandedMap: map,
            accuracyLabel: `${Math.round(res.summary.accuracy * 100)}%`,
            rankLabel:
              res.summary.rank_percentile != null
                ? `${Math.round(res.summary.rank_percentile * 100)}%`
                : '',
            durationLabel: formatDuration(res.summary.time_spent_sec),
          });
          track('paper_result_view', { paper_id: this.data.paperId });
          return;
        }
      } catch (err) {
        if (err instanceof HttpError && err.statusCode !== 404) {
          this.setData({ state: 'failed', failMsg: err.message });
          return;
        }
      }
      this.setData({
        progress: Math.min(95, Math.round(((Date.now() - start) / TIMEOUT_MS) * 100)),
      });
      await sleep(interval);
      interval = Math.min(interval + 200, 3000);
    }
    this.setData({ state: 'failed', failMsg: '批改超时, 请稍后再来查看' });
  },

  onRetry() {
    this.setData({ state: 'loading', progress: 5, failMsg: '' });
    void this.fetchLoop();
  },

  onToggle(e) {
    const id = e.currentTarget.dataset.id as string;
    const map = { ...this.data.expandedMap };
    map[id] = !map[id];
    this.setData({ expandedMap: map });
  },

  onGoMistake() {
    track('paper_result_to_mistake');
    wx.reLaunch({ url: '/pages/mistake/index' });
  },

  onGoConfig() {
    track('paper_result_again');
    wx.reLaunch({ url: '/pages/home/index' });
  },
});

function formatAnswer(v: unknown): string {
  if (v === null || v === undefined) return '(无答案)';
  if (typeof v === 'boolean') return v ? '对' : '错';
  if (Array.isArray(v)) return v.join(' / ');
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}
