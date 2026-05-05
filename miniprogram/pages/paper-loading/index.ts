/**
 * U08 出题加载页(指数退避轮询 + 阶段文案 + 30s 内可取消)
 *
 * 04-前端规范 §3.5
 */

import { PAPER_POLL } from '../../config/constants';
import { HttpError, paperService } from '../../services';
import { paperStore } from '../../stores/paper';
import { confirm, toast } from '../../utils/toast';
import { sleep } from '../../utils/time';
import { track } from '../../utils/tracker';

interface PageData {
  paperId: string;
  state: 'loading' | 'failed' | 'cancelled';
  progress: number;
  stageTitle: string;
  canCancel: boolean;
  failMsg: string;
}

interface PageMethods {
  pollLoop: () => Promise<void>;
  onCancel: () => Promise<void>;
  onBackToConfig: () => void;
  computeStage: (elapsedMs: number) => { title: string; progress: number };
}

const STAGE_TEXTS: { upTo: number; title: string }[] = [
  { upTo: 10_000, title: '正在阅读章节内容...' },
  { upTo: 20_000, title: '正在挑选知识点...' },
  { upTo: 30_000, title: '正在拟题...' },
  { upTo: 60_000, title: '正在做最后检查...' },
  { upTo: Infinity, title: '还在加紧思考, 马上就好...' },
];

Page<PageData, PageMethods>({
  data: {
    paperId: '',
    state: 'loading',
    progress: 5,
    stageTitle: STAGE_TEXTS[0].title,
    canCancel: true,
    failMsg: '',
  },

  onLoad(options) {
    const id = options?.paperId ?? '';
    if (!id) {
      this.setData({ state: 'failed', failMsg: '缺少 paperId' });
      return;
    }
    this.setData({ paperId: id });
    void this.pollLoop();
  },

  computeStage(elapsedMs) {
    const stage = STAGE_TEXTS.find((s) => elapsedMs < s.upTo) ?? STAGE_TEXTS[STAGE_TEXTS.length - 1];
    const pct = Math.min(95, Math.round((elapsedMs / PAPER_POLL.TIMEOUT_MS) * 100));
    return { title: stage.title, progress: pct };
  },

  async pollLoop() {
    const start = Date.now();
    let interval: number = PAPER_POLL.INITIAL_INTERVAL_MS;
    track('paper_loading_start', { paper_id: this.data.paperId });
    while (Date.now() - start < PAPER_POLL.TIMEOUT_MS) {
      try {
        const { paper } = await paperService.detail(this.data.paperId);
        paperStore.setCurrentPaper(paper);
        const elapsed = Date.now() - start;
        const stage = this.computeStage(elapsed);
        this.setData({
          stageTitle: stage.title,
          progress: paper.status === 'ready' ? 100 : stage.progress,
          canCancel: elapsed < PAPER_POLL.CANCEL_WINDOW_MS,
        });
        if (paper.status === 'ready') {
          track('paper_loading_ready', { paper_id: this.data.paperId, ms: elapsed });
          // 跳答题
          wx.redirectTo({
            url: `/pages/paper-answer/index?paperId=${encodeURIComponent(paper.id)}`,
          });
          return;
        }
        if (paper.status === 'failed') {
          this.setData({ state: 'failed', failMsg: '稍后再试一次吧' });
          track('paper_loading_failed', { paper_id: this.data.paperId });
          return;
        }
      } catch (err) {
        if (err instanceof HttpError) {
          // 401 等已被 http 自动处理过, 这里只对其它错日志
          console.warn('[paper-loading] poll http err', err);
        }
      }
      await sleep(interval);
      interval = Math.min(interval + PAPER_POLL.STEP_MS, PAPER_POLL.MAX_INTERVAL_MS);
    }
    this.setData({
      state: 'failed',
      failMsg: 'AI 思考超时了, 这次不计入次数, 要再试一次吗?',
    });
    track('paper_loading_timeout', { paper_id: this.data.paperId });
  },

  async onCancel() {
    if (!this.data.canCancel) return;
    const ok = await confirm({
      title: '取消出题?',
      content: '30 秒内取消不扣次数;之后取消已开始的请求, 仍可能扣次数。',
      confirmText: '取消出题',
      cancelText: '继续等待',
    });
    if (!ok) return;
    try {
      await paperService.cancel(this.data.paperId);
      track('paper_loading_cancel', { paper_id: this.data.paperId });
      this.setData({ state: 'cancelled' });
    } catch (err) {
      console.warn('[paper-loading] cancel failed', err);
      toast('取消失败, 请稍后', 'error');
    }
  },

  onBackToConfig() {
    wx.navigateBack();
  },
});
