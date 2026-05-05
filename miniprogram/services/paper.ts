/**
 * 试卷 / 出题 / 批改接口
 *
 * 03-API §7
 */

import { http } from './http';
import { uuid } from '../utils/uuid';
import type {
  CreatePaperRequest,
  CreatePaperResponse,
  PaperDetailResponse,
  PaperResultResponse,
  SaveDraftRequest,
  SubmitAnswersRequest,
  SubmitAnswersResponse,
} from '../types/api';

function buildIdempotencyKey(prefix: string): string {
  return `${prefix}-${uuid()}`;
}

export const paperService = {
  /**
   * 创建试卷, 返回 paper_id + status=generating;客户端轮询 detail 取 ready
   */
  create(body: CreatePaperRequest, userId?: string): Promise<CreatePaperResponse> {
    const tag = userId ?? 'anon';
    const idemKey = buildIdempotencyKey(`paper-${tag}`);
    return http.post<CreatePaperResponse>('/papers', body, { idempotencyKey: idemKey });
  },

  detail(id: string): Promise<PaperDetailResponse> {
    return http.get<PaperDetailResponse>(`/papers/${encodeURIComponent(id)}`);
  },

  cancel(id: string): Promise<{ ok: true }> {
    return http.post<{ ok: true }>(`/papers/${encodeURIComponent(id)}/cancel`);
  },

  saveDraft(id: string, body: SaveDraftRequest): Promise<{ ok: true }> {
    return http.post<{ ok: true }>(
      `/papers/${encodeURIComponent(id)}/draft`,
      body,
    );
  },

  getDraft(id: string): Promise<{ answers: SaveDraftRequest['answers'] }> {
    return http.get<{ answers: SaveDraftRequest['answers'] }>(
      `/papers/${encodeURIComponent(id)}/draft`,
    );
  },

  submit(id: string, body: SubmitAnswersRequest): Promise<SubmitAnswersResponse> {
    return http.post<SubmitAnswersResponse>(
      `/papers/${encodeURIComponent(id)}/submit`,
      body,
      { idempotencyKey: `paper-${id}-submit` },
    );
  },

  result(id: string): Promise<PaperResultResponse> {
    return http.get<PaperResultResponse>(`/papers/${encodeURIComponent(id)}/result`);
  },
};
