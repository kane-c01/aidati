/**
 * U05 拍照页(Tab 2)
 *
 * 流程:
 *  - 用户拍 / 选 → 本地路径入 photoStore.localQueue(暂不上传)
 *  - 「完成」按钮一次性上传所有, 每张走:
 *      1) GET /v1/upload/policy?scene=photo
 *      2) wx.uploadFile 直传 OSS
 *      3) POST /v1/photos 绑定 → 拿到 photo_set_id
 *  - 完成后跳 photo-review 触发 OCR
 *
 * 注意:wx.uploadFile 不能加 Authorization 头, 但 POST /photos 走 http 客户端正常带头。
 */

import { ContentBlockedError, HttpError, photoService, uploadService } from '../../services';
import { MAX_PHOTO_PAGES } from '../../config/constants';
import { confirm, hideLoading, showLoading, toast } from '../../utils/toast';
import { photoStore } from '../../stores/photo';
import { track } from '../../utils/tracker';

interface Thumb {
  key: string;
  path: string;
}

interface PageData {
  thumbs: Thumb[];
  totalCount: number;
  maxPages: number;
  submitting: boolean;
}

interface PageMethods {
  onChoose: () => void;
  onChooseCamera: () => void;
  onChooseAlbum: () => void;
  onLongPress: (e: WechatMiniprogram.BaseEvent) => void;
  onThumbTap: (e: WechatMiniprogram.BaseEvent) => void;
  onRemove: (e: WechatMiniprogram.BaseEvent) => void;
  onFinish: () => Promise<void>;
  syncFromStore: () => void;
  pickMedia: (sourceType: 'camera' | 'album') => Promise<string[]>;
  removeAt: (index: number) => void;
}

Page<PageData, PageMethods>({
  data: {
    thumbs: [],
    totalCount: 0,
    maxPages: MAX_PHOTO_PAGES,
    submitting: false,
  },

  onLoad() {
    this.syncFromStore();
  },

  onShow() {
    this.syncFromStore();
  },

  syncFromStore() {
    const local = photoStore.localQueue.map((p, i) => ({
      key: `local-${p.ts}-${i}`,
      path: p.tempFilePath,
    }));
    const uploaded = photoStore.uploaded.map((u, i) => ({
      key: `up-${u.id}-${i}`,
      path: u.image_url,
    }));
    const thumbs = [...uploaded, ...local];
    this.setData({ thumbs, totalCount: thumbs.length });
  },

  onChoose() {
    void this.pickMedia('album');
  },
  onChooseCamera() {
    void this.pickMedia('camera');
  },
  onChooseAlbum() {
    void this.pickMedia('album');
  },

  async pickMedia(sourceType) {
    const remain = this.data.maxPages - this.data.totalCount;
    if (remain <= 0) {
      toast(`最多 ${this.data.maxPages} 页`, 'none');
      return [];
    }
    try {
      const res = await chooseMedia(sourceType, sourceType === 'camera' ? 1 : Math.min(9, remain));
      const paths = res.tempFiles.map((f) => f.tempFilePath).slice(0, remain);
      photoStore.enqueueLocal(paths);
      this.syncFromStore();
      track('photo_pick', { source: sourceType, count: paths.length });
      return paths;
    } catch (err) {
      if (env_isUserCancel(err)) return [];
      toast('拍照 / 选图失败', 'error');
      return [];
    }
  },

  onLongPress(e) {
    const index = e.currentTarget.dataset.index as number;
    void confirm({
      title: '操作',
      content: `第 ${index + 1} 张?`,
      confirmText: '删除',
      cancelText: '取消',
    }).then((ok) => {
      if (!ok) return;
      this.removeAt(index);
    });
  },

  onThumbTap(e) {
    const path = (e.currentTarget.dataset.key as string) || '';
    void path;
    const urls = this.data.thumbs.map((t) => t.path);
    const idx = e.currentTarget.dataset.index as number;
    wx.previewImage({ urls, current: urls[idx] });
  },

  onRemove(e) {
    const index = e.currentTarget.dataset.index as number;
    this.removeAt(index);
  },

  removeAt(index: number) {
    const uploadedCount = photoStore.uploaded.length;
    if (index < uploadedCount) {
      const item = photoStore.uploaded[index];
      photoStore.removeUploaded(item.id);
      void photoService.remove(item.id).catch((err) => console.warn('[photo] del remote', err));
    } else {
      photoStore.removeLocalAt(index - uploadedCount);
    }
    this.syncFromStore();
  },

  async onFinish() {
    if (this.data.submitting) return;
    if (this.data.totalCount === 0) {
      toast('请先拍至少一张');
      return;
    }
    this.setData({ submitting: true });
    showLoading('上传中...');
    let setId = photoStore.photoSetId;
    let baseOrder = photoStore.uploaded.length;

    try {
      for (let i = 0; i < photoStore.localQueue.length; ) {
        const item = photoStore.localQueue[i];
        try {
          const { url } = await uploadService.putWithPolicy(item.tempFilePath, 'photo');
          baseOrder += 1;
          const bind = await photoService.bind({
            photo_set_id: setId,
            image_url: url,
            order_no: baseOrder,
          });
          if (!setId) setId = bind.photo_set_id;
          photoStore.setSetId(setId);
          photoStore.upsertUploaded({
            id: bind.photo_id,
            image_url: url,
            order_no: baseOrder,
          });
          // 一张上传完移出本地队列, 下次重试只剩失败的
          photoStore.removeLocalAt(0);
        } catch (perItemErr) {
          console.error('[photo] upload one failed', perItemErr);
          if (perItemErr instanceof ContentBlockedError) {
            hideLoading();
            void confirm({
              title: '内容被拦截',
              content: perItemErr.message,
              showCancel: false,
              confirmText: '我知道了',
            });
            this.setData({ submitting: false });
            this.syncFromStore();
            return;
          }
          // 单张失败 → 跳过这张, 继续后面
          baseOrder -= 1;
          photoStore.removeLocalAt(0);
        }
      }
      hideLoading();
      this.setData({ submitting: false });
      this.syncFromStore();
      track('photo_upload_done', { total: photoStore.uploaded.length });
      if (!photoStore.photoSetId || photoStore.uploaded.length === 0) {
        toast('全部上传失败,请检查网络', 'error');
        return;
      }
      wx.navigateTo({
        url: `/pages/photo-review/index?setId=${encodeURIComponent(photoStore.photoSetId)}`,
      });
    } catch (err) {
      hideLoading();
      this.setData({ submitting: false });
      this.syncFromStore();
      if (err instanceof HttpError) {
        toast(err.message, 'error');
      } else {
        toast('上传不顺,请重试', 'error');
      }
    }
  },
});

function chooseMedia(
  sourceType: 'camera' | 'album',
  count: number,
): Promise<WechatMiniprogram.ChooseMediaSuccessCallbackResult> {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count,
      mediaType: ['image'],
      sourceType: [sourceType],
      sizeType: ['compressed'],
      camera: 'back',
      success: resolve,
      fail: reject,
    });
  });
}

function env_isUserCancel(err: unknown): boolean {
  const m = (err as { errMsg?: string })?.errMsg ?? '';
  return /cancel/i.test(m);
}
