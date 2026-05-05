/**
 * U06 OCR 校对页
 *
 * 流程:
 *  1) 进入页面: 取 photoSetId, POST /v1/photo-sets/:id/ocr 触发 OCR(默认 mode='wechat')
 *  2) 1.5s 一次轮询 GET /v1/photo-sets/:id/ocr 直至 done/failed/超时
 *  3) 用户编辑后点「下一步」: PATCH /v1/photo-sets/:id/ocr 写回 → 跳 paper-config
 *
 * 关于「客户端微信 OCR」:
 *  - 后端 mode='wechat' 时表示由客户端调 wx.basicOcr → 写回
 *  - MVP 简化为后端兜底/腾讯云;客户端调用部分可在后续接入(需 OCR 插件), 目前只做 PATCH 写回
 */

import { OCR_POLL } from '../../config/constants';
import { HttpError, photoService } from '../../services';
import { paperStore } from '../../stores/paper';
import { photoStore } from '../../stores/photo';
import { hideLoading, showLoading, toast } from '../../utils/toast';
import { sleep } from '../../utils/time';
import { track } from '../../utils/tracker';
import type { OcrTaskStatus, PhotoItem } from '../../types/domain';

interface PageData {
  setId: string;
  items: PhotoItem[];
  ocrStatus: OcrTaskStatus | 'idle';
  progress: number;
  saving: boolean;
}

interface PageMethods {
  pollLoop: () => Promise<void>;
  onTextChange: (e: WechatMiniprogram.Input) => void;
  onContinue: () => Promise<void>;
  onBackPhoto: () => void;
}

Page<PageData, PageMethods>({
  data: {
    setId: '',
    items: [],
    ocrStatus: 'idle',
    progress: 0,
    saving: false,
  },

  onLoad(options) {
    const setId = options?.setId ?? photoStore.photoSetId ?? '';
    if (!setId) {
      toast('缺少拍照集 ID', 'error');
      wx.navigateBack();
      return;
    }
    this.setData({ setId, ocrStatus: 'pending', progress: 5 });
    void photoService
      .startOcr(setId, { mode: 'wechat' })
      .catch((err) => {
        // 后端可能已自动触发, 重复调容错
        console.warn('[ocr] start failed (可能已在进行)', err);
      })
      .finally(() => {
        void this.pollLoop();
      });
  },

  async pollLoop() {
    const start = Date.now();
    let interval: number = OCR_POLL.INITIAL_INTERVAL_MS;
    while (Date.now() - start < OCR_POLL.TIMEOUT_MS) {
      try {
        const res = await photoService.getOcr(this.data.setId);
        photoStore.setOcrStatus(res.ocr_status, res.ocr_text);
        photoStore.setUploadedList(res.items ?? []);
        this.setData({
          items: res.items ?? [],
          ocrStatus: res.ocr_status,
          progress:
            res.ocr_status === 'done'
              ? 100
              : Math.min(95, Math.max(5, Math.floor((Date.now() - start) / OCR_POLL.TIMEOUT_MS * 100))),
        });
        if (res.ocr_status === 'done' || res.ocr_status === 'failed') {
          track('ocr_finish', { status: res.ocr_status, n: (res.items ?? []).length });
          return;
        }
      } catch (err) {
        console.warn('[ocr] poll error', err);
      }
      await sleep(interval);
      interval = Math.min(interval + 200, OCR_POLL.MAX_INTERVAL_MS);
    }
    this.setData({ ocrStatus: 'failed' });
    toast('OCR 超时', 'error');
  },

  onTextChange(e) {
    const id = (e.currentTarget.dataset as { id: string }).id;
    const v = e.detail.value;
    const next = this.data.items.map((it) => (it.id === id ? { ...it, ocr_text: v } : it));
    this.setData({ items: next });
  },

  async onContinue() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    showLoading('保存校对');
    try {
      await photoService.patchOcr(this.data.setId, {
        items: this.data.items
          .filter((it) => typeof it.ocr_text === 'string')
          .map((it) => ({ photo_id: it.id, ocr_text: it.ocr_text ?? '' })),
      });
      // 进 paperStore 的 pendingSource, 让 paper-config 直接走 photo_set 路径
      paperStore.setPendingSource({
        source_type: 'photo_set',
        photo_set_id: this.data.setId,
        book_title: null,
      });
      hideLoading();
      this.setData({ saving: false });
      track('ocr_review_save', { n: this.data.items.length });
      wx.navigateTo({ url: '/pages/paper-config/index' });
    } catch (err) {
      hideLoading();
      this.setData({ saving: false });
      if (err instanceof HttpError) toast(err.message, 'error');
      else toast('保存失败,请重试', 'error');
    }
  },

  onBackPhoto() {
    wx.navigateBack();
  },
});
