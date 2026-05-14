/**
 * 拍照 store
 */

import { observable, runInAction } from 'mobx-miniprogram';

import type { OcrTaskStatus, PhotoItem } from '../types/domain';

interface LocalPhoto {
  tempFilePath: string;
  ts: number;
}

interface UploadedPhoto {
  id: string;
  image_url: string;
  order_no: number;
  ocr_text?: string | null;
  ocr_status?: OcrTaskStatus;
}

type OcrUiStatus = OcrTaskStatus | 'idle';

interface PhotoState {
  photoSetId: string | null;
  localQueue: LocalPhoto[];
  uploaded: UploadedPhoto[];
  ocrStatus: OcrUiStatus;
  ocrText: string;
  uploadingCount: number;
}

interface PhotoActions {
  reset: () => void;
  setSetId: (id: string | null) => void;
  enqueueLocal: (paths: string[]) => void;
  removeLocalAt: (index: number) => void;
  replaceLocalAt: (index: number, newPath: string) => void;
  upsertUploaded: (item: UploadedPhoto) => void;
  removeUploaded: (id: string) => void;
  setUploadedList: (items: PhotoItem[]) => void;
  setOcrStatus: (s: OcrUiStatus, text?: string) => void;
  bumpUploading: (delta: number) => void;
}

export type PhotoStore = PhotoState & PhotoActions;

const initial = {
  photoSetId: null as string | null,
  localQueue: [] as LocalPhoto[],
  uploaded: [] as UploadedPhoto[],
  ocrStatus: 'idle' as OcrUiStatus,
  ocrText: '',
  uploadingCount: 0,

  reset(): void {
    const self = this as unknown as PhotoStore;
    runInAction(() => {
      self.photoSetId = null;
      self.localQueue = [];
      self.uploaded = [];
      self.ocrStatus = 'idle';
      self.ocrText = '';
      self.uploadingCount = 0;
    });
  },
  setSetId(id: string | null): void {
    const self = this as unknown as PhotoStore;
    runInAction(() => {
      self.photoSetId = id;
    });
  },
  enqueueLocal(paths: string[]): void {
    const self = this as unknown as PhotoStore;
    const items: LocalPhoto[] = paths.map((p) => ({ tempFilePath: p, ts: Date.now() }));
    runInAction(() => {
      self.localQueue = [...self.localQueue, ...items];
    });
  },
  removeLocalAt(index: number): void {
    const self = this as unknown as PhotoStore;
    runInAction(() => {
      self.localQueue = self.localQueue.filter((_, i) => i !== index);
    });
  },
  replaceLocalAt(index: number, newPath: string): void {
    const self = this as unknown as PhotoStore;
    runInAction(() => {
      if (index < 0 || index >= self.localQueue.length) return;
      const next = [...self.localQueue];
      next[index] = { tempFilePath: newPath, ts: Date.now() };
      self.localQueue = next;
    });
  },
  upsertUploaded(item: UploadedPhoto): void {
    const self = this as unknown as PhotoStore;
    runInAction(() => {
      const exist = self.uploaded.findIndex((u) => u.id === item.id);
      if (exist >= 0) {
        const next = [...self.uploaded];
        next[exist] = item;
        self.uploaded = next;
      } else {
        self.uploaded = [...self.uploaded, item].sort((a, b) => a.order_no - b.order_no);
      }
    });
  },
  removeUploaded(id: string): void {
    const self = this as unknown as PhotoStore;
    runInAction(() => {
      self.uploaded = self.uploaded.filter((u) => u.id !== id);
    });
  },
  setUploadedList(items: PhotoItem[]): void {
    const self = this as unknown as PhotoStore;
    const mapped: UploadedPhoto[] = items.map((it) => ({
      id: it.id,
      image_url: it.image_url,
      order_no: it.order_no,
      ocr_text: it.ocr_text ?? null,
      ocr_status: it.ocr_status,
    }));
    runInAction(() => {
      self.uploaded = mapped.sort((a, b) => a.order_no - b.order_no);
    });
  },
  setOcrStatus(s: OcrUiStatus, text?: string): void {
    const self = this as unknown as PhotoStore;
    runInAction(() => {
      self.ocrStatus = s;
      if (text !== undefined) self.ocrText = text;
    });
  },
  bumpUploading(delta: number): void {
    const self = this as unknown as PhotoStore;
    runInAction(() => {
      self.uploadingCount = Math.max(0, self.uploadingCount + delta);
    });
  },
};

export const photoStore = observable(initial) as PhotoStore;
