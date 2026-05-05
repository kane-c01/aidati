/**
 * 拍照 / OCR 接口
 *
 * 03-API §5.2 - §6
 */

import { http } from './http';
import type {
  BindPhotoRequest,
  BindPhotoResponse,
  OcrStatusResponse,
  PatchOcrRequest,
  ReorderPhotosRequest,
  StartOcrRequest,
  StartOcrResponse,
} from '../types/api';

export const photoService = {
  bind(body: BindPhotoRequest): Promise<BindPhotoResponse> {
    return http.post<BindPhotoResponse>('/photos', body);
  },

  remove(id: string): Promise<{ ok: true }> {
    return http.del<{ ok: true }>(`/photos/${encodeURIComponent(id)}`);
  },

  retake(id: string, image_url: string): Promise<{ ok: true }> {
    return http.patch<{ ok: true }>(`/photos/${encodeURIComponent(id)}`, { image_url });
  },

  reorder(setId: string, body: ReorderPhotosRequest): Promise<{ ok: true }> {
    return http.patch<{ ok: true }>(
      `/photo-sets/${encodeURIComponent(setId)}/reorder`,
      body,
    );
  },

  startOcr(setId: string, body: StartOcrRequest = {}): Promise<StartOcrResponse> {
    return http.post<StartOcrResponse>(
      `/photo-sets/${encodeURIComponent(setId)}/ocr`,
      body,
    );
  },

  getOcr(setId: string): Promise<OcrStatusResponse> {
    return http.get<OcrStatusResponse>(`/photo-sets/${encodeURIComponent(setId)}/ocr`);
  },

  patchOcr(setId: string, body: PatchOcrRequest): Promise<{ ok: true }> {
    return http.patch<{ ok: true }>(
      `/photo-sets/${encodeURIComponent(setId)}/ocr`,
      body,
    );
  },
};
