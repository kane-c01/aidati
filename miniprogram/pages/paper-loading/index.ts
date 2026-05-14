/**
 * U08 出题加载页(指数退避轮询 + 阶段文案 + 30s 内可取消)
 *
 * 04-前端规范 §3.5
 *
 * 边界态修复(2026-05):
 * - 后端在用户点取消的瞬间可能刚把 paper 推到 ready, cancel 接口会抛
 *   "仅在 generating 状态可取消, 当前 ready"。前端识别这条信息后, 直接
 *   按"已经出好题"处理, 跳答题页, 不再 toast 报错给用户。
 * - 轮询节奏更紧(见 constants.PAPER_POLL), ready/failed 一旦发生立刻反应。
 * - onShow 兜底一次 detail, 应对前后台切换 / 被聊天遮挡导致 setTimeout 卡顿。
 */

import { PAPER_POLL } from '../../config/constants';
import { HttpError, paperService } from '../../services/index';
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
  goAnswer: (paperId: string) => void;
  refreshOnce: () => Promise<boolean>;
}

interface PageInternal {
  _stopped: boolean;
  _started: number;
}

const STAGE_TEXTS: { upTo: number; title: string }[] = [
  { upTo: 10_000, title: '正在阅读章节内容...' },
  { upTo: 20_000, title: '正在挑选知识点...' },
  { upTo: 35_000, title: '正在拟题...' },
  { upTo: 60_000, title: '正在做最后检查...' },
  { upTo: 90_000, title: '题量较多, AI 还在思考...' },
  { upTo: Infinity, title: '快了, 再耐心等 10 秒...' },
];

/** 后端在 paper 状态不再是 generating 时返回的提示文案前缀 */
const BACKEND_STATE_HINT = '当前 ';

/**
 * 从后端业务异常信息里抽出 paper 终态(若有)
 *
 * 后端: `仅在 generating 状态可取消, 当前 ready`  → 'ready'
 * 兼容: `当前 graded` / `当前 submitted` / `当前 failed`
 */
function extractPaperStateFromError(msg: string | undefined): string | null {
  if (!msg) return null;
  const idx = msg.indexOf(BACKEND_STATE_HINT);
  if (idx < 0) return null;
  const tail = msg.slice(idx + BACKEND_STATE_HINT.length).trim();
  const state = tail.split(/[\s,，。.!]/)[0];
  return state || null;
}

Page<PageData, PageMethods & PageInternal>({
  data: {
    paperId: '',
    state: 'loading',
    progress: 5,
    stageTitle: STAGE_TEXTS[0].title,
    canCancel: true,
    failMsg: '',
  },

  _stopped: false,
  _started: 0,

  onLoad(options) {
    const id = options?.paperId ?? '';
    if (!id) {
      this.setData({ state: 'failed', failMsg: '缺少 paperId' });
      return;
    }
    this.setData({ paperId: id });
    this._started = Date.now();
    this._stopped = false;
    void this.pollLoop();
  },

  onShow() {
    // 用户切前台 / 关闭聊天遮罩回到本页时, 立刻刷一次状态, 而不是等当前 sleep 走完
    if (!this.data.paperId) return;
    if (this.data.state !== 'loading') return;
    void this.refreshOnce();
  },

  onUnload() {
    this._stopped = true;
  },

  computeStage(elapsedMs) {
    const stage = STAGE_TEXTS.find((s) => elapsedMs < s.upTo) ?? STAGE_TEXTS[STAGE_TEXTS.length - 1];
    // 进度按 BAR_FULL_MS 推到 95%, 60s 之后涨幅放缓, 不让进度条卡在 100% 给用户"已完成却没跳"的错觉
    const pct = Math.min(95, Math.round((elapsedMs / PAPER_POLL.BAR_FULL_MS) * 95));
    return { title: stage.title, progress: pct };
  },

  goAnswer(paperId: string) {
    if (this._stopped) return;
    this._stopped = true;
    wx.redirectTo({
      url: `/pages/paper-answer/index?paperId=${encodeURIComponent(paperId)}`,
    });
  },

  /**
   * 主动 detail 一次, 命中终态就跳页;返回 true 表示已经处理完(终态), 调用方可以停止后续操作。
   */
  async refreshOnce(): Promise<boolean> {
    if (this._stopped) return true;
    try {
      const { paper } = await paperService.detail(this.data.paperId);
      paperStore.setCurrentPaper(paper);
      const elapsed = Date.now() - this._started;
      const stage = this.computeStage(elapsed);
      const isReady = paper.status === 'ready' || paper.status === 'submitted' || paper.status === 'graded';
      this.setData({
        stageTitle: stage.title,
        progress: isReady ? 100 : stage.progress,
        canCancel: elapsed < PAPER_POLL.CANCEL_WINDOW_MS,
      });
      if (isReady) {
        track('paper_loading_ready', { paper_id: this.data.paperId, ms: elapsed });
        this.goAnswer(paper.id);
        return true;
      }
      if (paper.status === 'failed') {
        this._stopped = true;
        this.setData({ state: 'failed', failMsg: 'AI 繁忙, 请稍后再试' });
        toast('AI 繁忙, 请稍后再试', 'error');
        track('paper_loading_failed', { paper_id: this.data.paperId });
        return true;
      }
    } catch (err) {
      // HttpError(401/超时/业务码)只是日志一下继续轮询;
      // 其它 Error(比如解构失败 / 数据契约不对)必须显式 console.error,
      // 否则会出现"detail 200 但前端死轮询"的诡异现象(2026-05 真实线上事故就是这样发生的)。
      if (err instanceof HttpError) {
        console.warn('[paper-loading] poll http err', err);
      } else {
        console.error('[paper-loading] unexpected err in poll', err);
      }
    }
    return false;
  },

  async pollLoop() {
    let interval: number = PAPER_POLL.INITIAL_INTERVAL_MS;
    track('paper_loading_start', { paper_id: this.data.paperId });
    while (!this._stopped && Date.now() - this._started < PAPER_POLL.TIMEOUT_MS) {
      const done = await this.refreshOnce();
      if (done) return;
      await sleep(interval);
      interval = Math.min(interval + PAPER_POLL.STEP_MS, PAPER_POLL.MAX_INTERVAL_MS);
    }
    if (this._stopped) return;
    this.setData({
      state: 'failed',
      failMsg: 'AI 服务似乎太忙了, 稍后再试, 这次不会扣次数。',
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
      this._stopped = true;
      this.setData({ state: 'cancelled' });
    } catch (err) {
      // 如果后端告知 paper 已经离开 generating 态(比如刚 ready), 直接按终态处理而不是报错
      if (err instanceof HttpError) {
        const finalState = extractPaperStateFromError(err.message);
        if (finalState === 'ready' || finalState === 'submitted' || finalState === 'graded') {
          console.info('[paper-loading] cancel ignored: paper already', finalState);
          track('paper_loading_cancel_too_late', {
            paper_id: this.data.paperId,
            final_state: finalState,
          });
          this.goAnswer(this.data.paperId);
          return;
        }
        if (finalState === 'failed') {
          this._stopped = true;
          this.setData({ state: 'failed', failMsg: 'AI 繁忙, 请稍后再试' });
          toast('AI 繁忙, 请稍后再试', 'error');
          return;
        }
      }
      console.warn('[paper-loading] cancel failed', err);
      toast('取消失败, 请稍后', 'error');
    }
  },

  onBackToConfig() {
    wx.navigateBack();
  },
});
