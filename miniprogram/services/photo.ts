/**
 * 拍照 / OCR 接口
 *
 * 03-API §5.2 - §6
 */

import { http } from './http';
import type { OcrTaskStatus, PhotoItem, PhotoRegion } from '../types/domain';
import type {
  BindPhotoRequest,
  BindPhotoResponse,
  OcrStatusResponse,
  PatchOcrRequest,
  ReorderPhotosRequest,
  StartOcrRequest,
  StartOcrResponse,
} from '../types/api';

/** POST /v1/photo-sets/from-pdf —— 由 PDF 直接建拍照集 */
export interface CreateSetFromPdfPayload {
  pdf_url: string;
  name?: string;
  max_pages?: number;
}

export interface CreateSetFromPdfResult {
  photo_set_id: string;
  total_pages: number;
  truncated: boolean;
  photos: PhotoItem[];
}

/** GET /v1/photo-sets/:id —— 拍照集 meta(用于反查 source_book_id 跳书阅读) */
export interface PhotoSetMeta {
  id: string;
  name: string | null;
  total_pages: number;
  ocr_status: OcrTaskStatus;
  source_kind: 'capture' | 'pdf' | 'book' | string;
  source_book_id: string | null;
  expires_at: string;
  created_at: string;
}

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

  /**
   * PATCH /v1/photos/:id —— 重拍 / 重裁(image_url)/ 校对(ocr_text) / 框选区域(regions)
   *
   * 三个字段可独立或组合使用:
   * - image_url 改变时,后端自动清空 ocr_text(语义:换图后旧 OCR 失效),
   *   调用方应紧接着调用 startOcr 让后端重跑(只跑空的那一张)
   * - ocr_text 显式传值时即使 image_url 也变, 也按校对处理, 不清空
   */
  updatePhoto(
    id: string,
    body: { image_url?: string; ocr_text?: string; regions?: PhotoRegion[] },
  ): Promise<{
    id: string;
    photo_set_id: string;
    order_no: number;
    image_url: string;
    ocr_text: string | null;
    ocr_corrected: number;
    regions: PhotoRegion[];
    created_at: string;
  }> {
    return http.patch(`/photos/${encodeURIComponent(id)}`, body);
  },

  /** 触发单 region 视觉识别(M8) */
  recognizeRegion(
    photoId: string,
    regionId: string,
  ): Promise<{
    id: string;
    photo_set_id: string;
    image_url: string;
    ocr_text: string | null;
    ocr_corrected: number;
    regions: PhotoRegion[];
    created_at: string;
    order_no: number;
  }> {
    return http.post(
      `/photos/${encodeURIComponent(photoId)}/regions/${encodeURIComponent(regionId)}/recognize`,
    );
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

  /**
   * PDF → 拍照集(M8 PR2.6)
   * 后端调 ai-service 拆图 + 上传 OSS, 单次 50 页内, 大约 30s 同步返回
   */
  createSetFromPdf(payload: CreateSetFromPdfPayload): Promise<CreateSetFromPdfResult> {
    return http.post<CreateSetFromPdfResult>('/photo-sets/from-pdf', payload, {
      timeout: 180_000,
    });
  },

  /** 拍照集 meta(M8 PR2.6, 用于反查源书) */
  getSetMeta(setId: string): Promise<PhotoSetMeta> {
    return http.get<PhotoSetMeta>(`/photo-sets/${encodeURIComponent(setId)}`);
  },
};
