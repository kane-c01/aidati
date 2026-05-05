/**
 * U09 答题页(一题一屏)
 *
 * 功能:
 *  - 拉 paperStore.currentPaper / fetch detail
 *  - 进入即开始计时(每秒 +1, 调用 paperStore.bumpTotalTime)
 *  - 切题时把当前 question_id 答案写进 paperStore.answersDraft
 *  - 暂存退出(调 saveDraft + 写本地)
 *  - 最后一题: 提交 → 跳 paper-result
 *  - 返回拦截: 弹 Modal「暂存退出后, 7 天内可继续」
 */

import { paperService, HttpError } from '../../services/index';
import { paperStore } from '../../stores/paper';
import { confirm, hideLoading, showLoading, toast } from '../../utils/toast';
import { formatDuration } from '../../utils/time';
import { track } from '../../utils/tracker';
import type { AnswerItem, Paper, Question } from '../../types/domain';

interface PageData {
  paperId: string;
  paper: Paper | null;
  questions: Question[];
  currentIndex: number;
  currentQuestion: Question | null;
  currentAnswer: unknown;
  progressPercent: number;
  isLast: boolean;
  timerLabel: string;
  submitting: boolean;
  errorMsg: string;
  // 拦截标志: 用户在 onSaveExit 后已经显式确认离开, 后续 navigateBack 不再拦截
  exitAllowed: boolean;
}

interface PageMethods {
  fetchPaper: () => Promise<void>;
  goTo: (index: number) => void;
  onAnswerChange: (e: WechatMiniprogram.CustomEvent<{ value: unknown }>) => void;
  onPrev: () => void;
  onNext: () => void;
  onSubmit: () => Promise<void>;
  onSaveExit: () => Promise<void>;
  onRetry: () => void;
  startTimer: () => void;
  stopTimer: () => void;
  saveCurrentAnswerToStore: () => void;
  buildAnswerList: () => AnswerItem[];
}

let timerHandle: ReturnType<typeof setInterval> | null = null;

Page<PageData, PageMethods>({
  data: {
    paperId: '',
    paper: null,
    questions: [],
    currentIndex: 0,
    currentQuestion: null,
    currentAnswer: null,
    progressPercent: 0,
    isLast: false,
    timerLabel: '00:00',
    submitting: false,
    errorMsg: '',
    exitAllowed: false,
  },

  onLoad(options) {
    const id = options?.paperId ?? paperStore.currentPaper?.id ?? '';
    if (!id) {
      this.setData({ errorMsg: '缺少 paperId' });
      return;
    }
    this.setData({ paperId: id });
    paperStore.loadDraftFromLocal(id);
    void this.fetchPaper();
  },

  onUnload() {
    this.stopTimer();
    if (this.data.paperId) paperStore.saveDraftToLocal(this.data.paperId);
  },

  onHide() {
    this.stopTimer();
    if (this.data.paperId) paperStore.saveDraftToLocal(this.data.paperId);
  },

  onShow() {
    if (this.data.paper) this.startTimer();
  },

  async fetchPaper() {
    showLoading('加载试卷');
    try {
      const paper = paperStore.currentPaper ?? (await paperStore.fetchPaper(this.data.paperId));
      const questions = paper.questions ?? [];
      hideLoading();
      if (questions.length === 0) {
        this.setData({ errorMsg: '试卷尚未生成完毕' });
        return;
      }
      const idx = 0;
      this.setData({
        paper,
        questions,
        currentIndex: idx,
        currentQuestion: questions[idx],
        currentAnswer: paperStore.answersDraft[questions[idx].id]?.user_answer ?? null,
        progressPercent: Math.round(((idx + 1) / questions.length) * 100),
        isLast: idx === questions.length - 1,
        timerLabel: formatDuration(paperStore.totalTimeSec),
      });
      this.startTimer();
      track('paper_answer_open', { paper_id: paper.id, n: questions.length });
    } catch (err) {
      hideLoading();
      this.setData({ errorMsg: err instanceof HttpError ? err.message : '加载失败' });
    }
  },

  onRetry() {
    this.setData({ errorMsg: '' });
    void this.fetchPaper();
  },

  startTimer() {
    if (timerHandle) return;
    timerHandle = setInterval(() => {
      paperStore.bumpTotalTime(1);
      this.setData({ timerLabel: formatDuration(paperStore.totalTimeSec) });
    }, 1000);
  },

  stopTimer() {
    if (timerHandle) {
      clearInterval(timerHandle);
      timerHandle = null;
    }
  },

  saveCurrentAnswerToStore() {
    const q = this.data.currentQuestion;
    if (!q) return;
    paperStore.setAnswer({
      question_id: q.id,
      user_answer: this.data.currentAnswer,
      time_spent_sec: undefined,
    });
  },

  goTo(index) {
    const list = this.data.questions;
    if (index < 0 || index >= list.length) return;
    this.saveCurrentAnswerToStore();
    const q = list[index];
    const ans = paperStore.answersDraft[q.id]?.user_answer ?? null;
    this.setData({
      currentIndex: index,
      currentQuestion: q,
      currentAnswer: ans,
      progressPercent: Math.round(((index + 1) / list.length) * 100),
      isLast: index === list.length - 1,
    });
  },

  onAnswerChange(e) {
    this.setData({ currentAnswer: e.detail.value });
    // 即时保存到 store, 不等切题
    this.saveCurrentAnswerToStore();
  },

  onPrev() {
    this.goTo(this.data.currentIndex - 1);
  },

  onNext() {
    this.goTo(this.data.currentIndex + 1);
  },

  buildAnswerList() {
    return this.data.questions.map<AnswerItem>((q) => ({
      question_id: q.id,
      user_answer: paperStore.answersDraft[q.id]?.user_answer ?? null,
    }));
  },

  async onSubmit() {
    if (this.data.submitting) return;
    this.saveCurrentAnswerToStore();
    const answers = this.buildAnswerList();
    const blanks = answers.filter((a) => a.user_answer === null || a.user_answer === undefined || a.user_answer === '' || (Array.isArray(a.user_answer) && a.user_answer.length === 0));
    if (blanks.length > 0) {
      const ok = await confirm({
        title: '确认提交?',
        content: `还有 ${blanks.length} 道题未作答, 提交后未答题目计 0 分`,
        confirmText: '确认提交',
        cancelText: '继续答',
      });
      if (!ok) return;
    } else {
      const ok = await confirm({
        title: '确认提交?',
        content: '提交后将无法修改',
        confirmText: '确认提交',
        cancelText: '再看看',
      });
      if (!ok) return;
    }
    this.setData({ submitting: true });
    showLoading('提交答卷');
    try {
      await paperService.submit(this.data.paperId, {
        answers,
        total_time_sec: paperStore.totalTimeSec,
      });
      paperStore.clearDraft(this.data.paperId);
      hideLoading();
      this.setData({ submitting: false, exitAllowed: true });
      this.stopTimer();
      track('paper_submit', { paper_id: this.data.paperId, n: answers.length });
      wx.redirectTo({
        url: `/pages/paper-result/index?paperId=${encodeURIComponent(this.data.paperId)}`,
      });
    } catch (err) {
      hideLoading();
      this.setData({ submitting: false });
      if (err instanceof HttpError) toast(err.message, 'error');
      else toast('提交失败,请稍后', 'error');
    }
  },

  async onSaveExit() {
    this.saveCurrentAnswerToStore();
    paperStore.saveDraftToLocal(this.data.paperId);
    const ok = await confirm({
      title: '暂存退出?',
      content: '暂存退出后, 7 天内可在「我的-历史试卷」继续 (V2),目前请记住试卷 ID',
      confirmText: '暂存退出',
    });
    if (!ok) return;
    try {
      await paperService.saveDraft(this.data.paperId, {
        answers: this.buildAnswerList().filter((a) => a.user_answer !== null),
      });
    } catch (err) {
      console.warn('[paper-answer] saveDraft failed', err);
    }
    this.setData({ exitAllowed: true });
    wx.navigateBack();
  },
});
