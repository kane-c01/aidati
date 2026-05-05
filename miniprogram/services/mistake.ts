/**
 * 错题本接口
 *
 * 03-API §8
 */

import { http } from './http';
import type {
  MistakeListQuery,
  MistakeListResponse,
  PracticeMistakeRequest,
  PracticeMistakeResponse,
} from '../types/api';

export const mistakeService = {
  list(query: MistakeListQuery = {}): Promise<MistakeListResponse> {
    return http.get<MistakeListResponse>('/mistakes', {
      status: query.status,
      book_id: query.book_id,
      page: query.page,
      page_size: query.page_size,
    });
  },

  master(id: string): Promise<{ ok: true }> {
    return http.post<{ ok: true }>(`/mistakes/${encodeURIComponent(id)}/master`);
  },

  unmaster(id: string): Promise<{ ok: true }> {
    return http.post<{ ok: true }>(`/mistakes/${encodeURIComponent(id)}/unmaster`);
  },

  remove(id: string): Promise<{ ok: true }> {
    return http.del<{ ok: true }>(`/mistakes/${encodeURIComponent(id)}`);
  },

  practice(body: PracticeMistakeRequest): Promise<PracticeMistakeResponse> {
    return http.post<PracticeMistakeResponse>('/mistakes/practice', body);
  },
};
