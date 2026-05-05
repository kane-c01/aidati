/**
 * 错题本 store(浅缓存)
 */

import { observable, runInAction } from 'mobx-miniprogram';

import { mistakeService } from '../services';
import type { MistakeListQuery } from '../types/api';
import type { MistakeItem, MistakeStatus, MistakeSummary } from '../types/domain';

interface MistakeState {
  list: MistakeItem[];
  summary: MistakeSummary;
  filterStatus: MistakeStatus;
  filterBookId: string | undefined;
  page: number;
  pageSize: number;
  total: number;
  loading: boolean;
  hasMore: boolean;
}

interface MistakeActions {
  reset: () => void;
  setFilter: (s: Partial<Pick<MistakeState, 'filterStatus' | 'filterBookId'>>) => void;
  fetchFirst: () => Promise<void>;
  fetchNext: () => Promise<void>;
  patchItem: (id: string, patch: Partial<MistakeItem>) => void;
  removeItem: (id: string) => void;
}

export type MistakeStore = MistakeState & MistakeActions;

const initial = {
  list: [] as MistakeItem[],
  summary: { active: 0, mastered: 0 } as MistakeSummary,
  filterStatus: 'active' as MistakeStatus,
  filterBookId: undefined as string | undefined,
  page: 1,
  pageSize: 20,
  total: 0,
  loading: false,
  hasMore: true,

  reset(): void {
    const self = this as unknown as MistakeStore;
    runInAction(() => {
      self.list = [];
      self.summary = { active: 0, mastered: 0 };
      self.page = 1;
      self.total = 0;
      self.hasMore = true;
    });
  },
  setFilter(s: Partial<Pick<MistakeState, 'filterStatus' | 'filterBookId'>>): void {
    const self = this as unknown as MistakeStore;
    runInAction(() => {
      if (s.filterStatus !== undefined) self.filterStatus = s.filterStatus;
      if (s.filterBookId !== undefined) self.filterBookId = s.filterBookId;
    });
  },
  async fetchFirst(): Promise<void> {
    const self = this as unknown as MistakeStore;
    runInAction(() => {
      self.loading = true;
      self.page = 1;
      self.list = [];
    });
    await fetchPage(self);
  },
  async fetchNext(): Promise<void> {
    const self = this as unknown as MistakeStore;
    if (!self.hasMore || self.loading) return;
    runInAction(() => {
      self.loading = true;
      self.page += 1;
    });
    await fetchPage(self);
  },
  patchItem(id: string, patch: Partial<MistakeItem>): void {
    const self = this as unknown as MistakeStore;
    runInAction(() => {
      self.list = self.list.map((m) => (m.id === id ? { ...m, ...patch } : m));
    });
  },
  removeItem(id: string): void {
    const self = this as unknown as MistakeStore;
    runInAction(() => {
      self.list = self.list.filter((m) => m.id !== id);
      self.total = Math.max(0, self.total - 1);
    });
  },
};

export const mistakeStore = observable(initial) as MistakeStore;

async function fetchPage(store: MistakeStore): Promise<void> {
  try {
    const query: MistakeListQuery = {
      status: store.filterStatus,
      book_id: store.filterBookId,
      page: store.page,
      page_size: store.pageSize,
    };
    const res = await mistakeService.list(query);
    runInAction(() => {
      store.list = store.page === 1 ? res.list : [...store.list, ...res.list];
      store.total = res.pagination.total;
      store.summary = res.summary;
      store.hasMore = store.list.length < res.pagination.total;
    });
  } catch (err) {
    console.warn('[mistake] fetch failed', err);
  } finally {
    runInAction(() => {
      store.loading = false;
    });
  }
}
