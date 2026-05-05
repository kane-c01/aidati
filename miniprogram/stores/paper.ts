/**
 * 试卷流转 store
 *
 * 跨页面共享: 配置 → 加载 → 答题 → 提交 → 结果
 */

import { observable, runInAction } from 'mobx-miniprogram';

import { STORAGE_KEYS, ANSWER_DRAFT_TTL_MS } from '../config/constants';
import { paperService } from '../services/index';
import { getStorage, removeStorage, setStorage } from '../utils/storage';
import type {
  AnswerItem,
  GenerateConfig,
  Paper,
  PaperResult,
  PaperSourceType,
} from '../types/domain';

type PendingSource = {
  source_type: PaperSourceType;
  book_id?: string;
  chapter_ids?: string[];
  photo_set_id?: string;
  book_title?: string | null;
} | null;

interface PaperState {
  draftConfig: GenerateConfig;
  pendingSource: PendingSource;
  currentPaper: Paper | null;
  answersDraft: Record<string, AnswerItem>;
  totalTimeSec: number;
  result: PaperResult | null;
}

interface PaperActions {
  setDraftConfig: (cfg: Partial<GenerateConfig>) => void;
  resetDraftConfig: () => void;
  setPendingSource: (s: PendingSource) => void;
  setCurrentPaper: (p: Paper | null) => void;
  fetchPaper: (id: string) => Promise<Paper>;
  setAnswer: (item: AnswerItem) => void;
  loadDraftFromLocal: (paperId: string) => void;
  saveDraftToLocal: (paperId: string) => void;
  clearDraft: (paperId?: string) => void;
  bumpTotalTime: (delta: number) => void;
  setResult: (r: PaperResult | null) => void;
}

export type PaperStore = PaperState & PaperActions;

const DEFAULT_CONFIG: GenerateConfig = {
  question_types: ['single', 'judge'],
  difficulty: 'medium',
  count: 10,
  custom_prompt: '',
};

const initial = {
  draftConfig: { ...DEFAULT_CONFIG } as GenerateConfig,
  pendingSource: null as PendingSource,
  currentPaper: null as Paper | null,
  answersDraft: {} as Record<string, AnswerItem>,
  totalTimeSec: 0,
  result: null as PaperResult | null,

  setDraftConfig(cfg: Partial<GenerateConfig>): void {
    const self = this as unknown as PaperStore;
    runInAction(() => {
      self.draftConfig = { ...self.draftConfig, ...cfg };
    });
  },
  resetDraftConfig(): void {
    const self = this as unknown as PaperStore;
    runInAction(() => {
      self.draftConfig = { ...DEFAULT_CONFIG };
    });
  },
  setPendingSource(s: PendingSource): void {
    const self = this as unknown as PaperStore;
    runInAction(() => {
      self.pendingSource = s;
    });
  },
  setCurrentPaper(p: Paper | null): void {
    const self = this as unknown as PaperStore;
    runInAction(() => {
      self.currentPaper = p;
      if (!p) self.answersDraft = {};
    });
  },
  async fetchPaper(id: string): Promise<Paper> {
    const self = this as unknown as PaperStore;
    const res = await paperService.detail(id);
    runInAction(() => {
      self.currentPaper = res.paper;
    });
    return res.paper;
  },
  setAnswer(item: AnswerItem): void {
    const self = this as unknown as PaperStore;
    runInAction(() => {
      self.answersDraft = { ...self.answersDraft, [item.question_id]: item };
    });
  },
  loadDraftFromLocal(paperId: string): void {
    const self = this as unknown as PaperStore;
    const key = `${STORAGE_KEYS.ANSWER_DRAFT_PREFIX}${paperId}`;
    const stored = getStorage<{
      ts: number;
      answers: AnswerItem[];
      totalTimeSec: number;
    } | null>(key, null);
    if (!stored) return;
    if (Date.now() - stored.ts > ANSWER_DRAFT_TTL_MS) {
      removeStorage(key);
      return;
    }
    const map: Record<string, AnswerItem> = {};
    stored.answers.forEach((a) => {
      map[a.question_id] = a;
    });
    runInAction(() => {
      self.answersDraft = map;
      self.totalTimeSec = stored.totalTimeSec ?? 0;
    });
  },
  saveDraftToLocal(paperId: string): void {
    const self = this as unknown as PaperStore;
    const key = `${STORAGE_KEYS.ANSWER_DRAFT_PREFIX}${paperId}`;
    setStorage(key, {
      ts: Date.now(),
      answers: Object.values(self.answersDraft),
      totalTimeSec: self.totalTimeSec,
    });
  },
  clearDraft(paperId?: string): void {
    const self = this as unknown as PaperStore;
    if (paperId) {
      removeStorage(`${STORAGE_KEYS.ANSWER_DRAFT_PREFIX}${paperId}`);
    }
    runInAction(() => {
      self.answersDraft = {};
      self.totalTimeSec = 0;
    });
  },
  bumpTotalTime(delta: number): void {
    const self = this as unknown as PaperStore;
    runInAction(() => {
      self.totalTimeSec += delta;
    });
  },
  setResult(r: PaperResult | null): void {
    const self = this as unknown as PaperStore;
    runInAction(() => {
      self.result = r;
    });
  },
};

export const paperStore = observable(initial) as PaperStore;
