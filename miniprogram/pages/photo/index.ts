/**
 * U05 拍照页(Tab 2)— "扫描出题"统一入口
 *
 * 来源:
 *  - 拍照 / 相册图(原有, wx.chooseMedia)
 *  - 文件(M8 PR2.6 新增, wx.chooseMessageFile):
 *      • 本地或微信聊天里的 PDF → 上传 OSS → POST /v1/photo-sets/from-pdf
 *      • 微信聊天里的图片 → 走原有"图片绑定"链路
 *
 * 上传流程:
 *  - 拍 / 选图: 本地路径入 photoStore.localQueue(暂不上传)
 *    点「完成」时一次性上传:
 *      1) GET /v1/upload/policy?scene=photo
 *      2) wx.uploadFile 直传 OSS
 *      3) POST /v1/photos 绑定 → 拿到 photo_set_id
 *  - 选 PDF: 立即上传 PDF → 后端拆图建集, 直接进入 photo-review
 *
 * 视觉:Quietly Smart 设计语言, 拍照三按钮 + 顶部"导入文件"卡片
 */

import {
  ContentBlockedError,
  HttpError,
  photoService,
  uploadService,
} from '../../services/index';
import { MAX_PHOTO_PAGES } from '../../config/constants';
import { confirm, hideLoading, showLoading, toast } from '../../utils/toast';
import { photoStore } from '../../stores/photo';
import { track } from '../../utils/tracker';
import { editLocal, isEditCancel } from '../../utils/image';
import { compressImage } from '../../utils/compress';

interface Thumb {
  key: string;
  path: string;
}

interface PageData {
  thumbs: Thumb[];
  totalCount: number;
  maxPages: number;
  submitting: boolean;

  /** 派生 UI 字段 */
  headerSub: string;
  progressPercent: number;
  tipText: string;
  submitText: string;
  estTime: string;
  disabledAlbum: boolean;
}

interface PageMethods {
  onChoose: () => void;
  onChooseCamera: () => void;
  onChooseAlbum: () => void;
  onChooseFile: () => void;
  onPreviewLatest: () => void;
  onLongPress: (e: WechatMiniprogram.BaseEvent) => void;
  onThumbTap: (e: WechatMiniprogram.BaseEvent) => void;
  onRemove: (e: WechatMiniprogram.BaseEvent) => void;
  onCellCrop: (e: WechatMiniprogram.BaseEvent) => void;
  onFinish: () => Promise<void>;
  syncFromStore: () => void;
  refreshDerived: () => void;
  pickMedia: (sourceType: 'camera' | 'album') => Promise<string[]>;
  removeAt: (index: number) => void;
  cropAt: (index: number) => Promise<void>;
  pickFromMessageFile: () => Promise<void>;
  importPdf: (file: WechatMiniprogram.ChooseFile) => Promise<void>;
  importMessageImage: (file: WechatMiniprogram.ChooseFile) => Promise<void>;
}

/** 智能切换 tip 文案, 给用户实时反馈 */
function pickTip(total: number, max: number): string {
  if (total === 0) return '把书页平铺, 避免反光阴影; 一次最多 ' + max + ' 页';
  if (total === 1) return '建议同一书的连续页一起拍, AI 会自动按顺序合并';
  if (total < 5) return '光线均匀且字迹完整, 通常能拿到 90% 以上准确率';
  if (total < max) return '继续添加到合适数量, 太长会拖慢出题';
  return '已达上限 ' + max + ' 页, 先完成本次出题再继续';
}

/** 估算上传 + OCR 出题时长 (粗略, 用户不是要精确秒数) */
function estimateTime(total: number): string {
  if (total === 0) return '约 30 秒';
  if (total <= 3) return '约 30 秒';
  if (total <= 8) return '约 1 分钟';
  if (total <= 14) return '约 1.5 分钟';
  return '约 2 分钟';
}

Page<PageData, PageMethods>({
  data: {
    thumbs: [],
    totalCount: 0,
    maxPages: MAX_PHOTO_PAGES,
    submitting: false,

    headerSub: '一次最多 20 页, AI 自动整理',
    progressPercent: 0,
    tipText: '把书页平铺, 避免反光阴影; 一次最多 20 页',
    submitText: '上传并出题',
    estTime: '约 30 秒',
    disabledAlbum: false,
  },

  onLoad() {
    this.syncFromStore();
  },

  onShow() {
    if (typeof wx.hideHomeButton === 'function') {
      wx.hideHomeButton({ fail: () => undefined });
    }
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
    this.refreshDerived();
  },

  refreshDerived() {
    const { totalCount, maxPages, submitting } = this.data;
    const percent = Math.min(100, Math.round((totalCount / maxPages) * 100));
    let submitText = '上传并出题';
    if (submitting) submitText = '正在上传…';
    else if (totalCount === 0) submitText = '请先拍至少一张';
    else submitText = `上传 ${totalCount} 张并出题`;

    let headerSub = '';
    if (totalCount === 0) headerSub = `一次最多 ${maxPages} 页, AI 自动整理`;
    else if (totalCount < maxPages) headerSub = `已采集 ${totalCount} 页, 还可继续添加`;
    else headerSub = '已达上限, 先完成本次出题';

    this.setData({
      progressPercent: percent,
      submitText,
      estTime: estimateTime(totalCount),
      tipText: pickTip(totalCount, maxPages),
      headerSub,
      disabledAlbum: totalCount >= maxPages,
    });
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

  /**
   * 文件入口:从微信聊天 / 本地选 PDF 或图片
   * 注:小程序无法直接弹"系统文件管理器", chooseMessageFile 是唯一通道,
   *    用户需要先把 PDF 转发给好友/文件传输助手, 再从聊天记录里选。
   */
  onChooseFile() {
    void this.pickFromMessageFile();
  },

  onPreviewLatest() {
    if (this.data.totalCount === 0) {
      toast('还没有拍照');
      return;
    }
    const urls = this.data.thumbs.map((t) => t.path);
    wx.previewImage({ urls, current: urls[urls.length - 1] });
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

  /**
   * 长按缩略图弹「裁剪 / 删除」action sheet。
   * - 裁剪只对未上传的本地图直接生效(wx.editImage)
   * - 已上传图(只能在 photo-review 页改, 这里仅 toast 引导, 不阻塞)
   */
  onLongPress(e) {
    const index = e.currentTarget.dataset.index as number;
    wx.showActionSheet({
      itemList: ['裁剪 / 旋转', '删除这张'],
      success: (res) => {
        if (res.tapIndex === 0) void this.cropAt(index);
        else if (res.tapIndex === 1) this.removeAt(index);
      },
      fail: () => undefined,
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

  /** 缩略图右下角「✂」直接触发, 不依赖长按手势 */
  onCellCrop(e) {
    const index = e.currentTarget.dataset.index as number;
    void this.cropAt(index);
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

  /**
   * 裁剪某张缩略图:
   * - 已上传:不在此页操作(避免重传 + 重跑 OCR 的复杂度), 引导到 photo-review
   * - 本地队列:wx.editImage 弹原生裁剪 → 替换 localQueue 对应项
   */
  async cropAt(index: number) {
    const uploadedCount = photoStore.uploaded.length;
    if (index < uploadedCount) {
      toast('已上传图请到「校对识别结果」页裁剪', 'none');
      return;
    }
    const localIndex = index - uploadedCount;
    const local = photoStore.localQueue[localIndex];
    if (!local) return;
    try {
      const newPath = await editLocal(local.tempFilePath);
      photoStore.replaceLocalAt(localIndex, newPath);
      this.syncFromStore();
      track('photo_crop', { stage: 'local', index: localIndex });
    } catch (err) {
      if (isEditCancel(err)) return;
      console.warn('[photo] crop failed', err);
      toast('裁剪失败', 'error');
    }
  },

  /**
   * 拉起 wx.chooseMessageFile, 同时允许图片 + PDF
   * - 单个 PDF → 走 importPdf
   * - 单个图片 → 走 importMessageImage(并入本地队列, 用户决定何时上传)
   * - 多选图片 → 全部并入本地队列
   * - 选了不支持的扩展(比如 docx) → toast 报错
   */
  async pickFromMessageFile() {
    if (this.data.submitting) return;
    if (this.data.totalCount >= this.data.maxPages) {
      toast(`最多 ${this.data.maxPages} 页`, 'none');
      return;
    }
    let res: WechatMiniprogram.ChooseMessageFileSuccessCallbackResult;
    try {
      res = await chooseMessageFile({
        count: 9,
        type: 'all',
        extension: ['pdf', 'jpg', 'jpeg', 'png', 'webp'],
      });
    } catch (err) {
      if (env_isUserCancel(err)) return;
      toast('选文件失败,请重试', 'error');
      return;
    }
    const files = res.tempFiles ?? [];
    if (!files.length) return;

    const pdfs = files.filter((f) => /\.pdf$/i.test(f.name));
    const images = files.filter((f) => /\.(jpe?g|png|webp)$/i.test(f.name));
    const others = files.length - pdfs.length - images.length;
    if (others > 0) {
      toast('暂不支持 Word/Excel 等格式,请先转 PDF', 'none');
    }

    // PDF 一次只允许处理一个(避免 backend 并发渲染压力)
    if (pdfs.length > 0) {
      if (pdfs.length > 1) {
        toast('一次只能导入一个 PDF', 'none');
      }
      await this.importPdf(pdfs[0]);
      return;
    }

    for (const img of images) {
      await this.importMessageImage(img);
    }
  },

  /**
   * PDF 导入:上传 OSS → 调后端 from-pdf → 跳 photo-review
   * 这是"完成态"流程, 不会和拍照本地队列混用(PDF 自带页序)
   */
  async importPdf(file: WechatMiniprogram.ChooseFile) {
    const sizeMB = (file.size ?? 0) / (1024 * 1024);
    if (sizeMB > 50) {
      toast('PDF 不能超过 50 MB', 'error');
      return;
    }
    if (photoStore.localQueue.length || photoStore.uploaded.length) {
      const ok = await confirm({
        title: '导入 PDF',
        content: '当前已有拍照内容, 导入 PDF 会另起一组拍照集, 是否继续?',
        confirmText: '继续',
        cancelText: '取消',
      });
      if (!ok) return;
      photoStore.reset();
      this.syncFromStore();
    }

    showLoading('上传 PDF…');
    try {
      const r = await uploadService.putWithPolicy(file.path, 'pdf');
      hideLoading();
      showLoading('AI 拆页中…');
      const set = await photoService.createSetFromPdf({
        pdf_url: r.url,
        name: file.name?.replace(/\.pdf$/i, '') || undefined,
      });
      hideLoading();
      photoStore.setSetId(set.photo_set_id);
      photoStore.setUploadedList(set.photos);
      this.syncFromStore();
      track('photo_pdf_import', { pages: set.photos.length, truncated: set.truncated });
      if (set.truncated) {
        toast(`已导入前 ${set.photos.length} 页`, 'none');
      }
      wx.navigateTo({
        url: `/pages/photo-review/index?setId=${encodeURIComponent(set.photo_set_id)}`,
      });
    } catch (err) {
      hideLoading();
      console.error('[photo] importPdf failed', err);
      if (err instanceof ContentBlockedError) {
        void confirm({
          title: '内容被拦截',
          content: err.message,
          showCancel: false,
          confirmText: '我知道了',
        });
        return;
      }
      if (err instanceof HttpError) {
        toast(err.message, 'error');
      } else {
        toast('PDF 处理失败,请重试', 'error');
      }
    }
  },

  /** 微信聊天里选的图:本地路径直接入队列, 等用户点完成统一上传 */
  async importMessageImage(file: WechatMiniprogram.ChooseFile) {
    const remain = this.data.maxPages - this.data.totalCount;
    if (remain <= 0) {
      toast(`最多 ${this.data.maxPages} 页`, 'none');
      return;
    }
    photoStore.enqueueLocal([file.path]);
    this.syncFromStore();
    track('photo_pick', { source: 'message_file', count: 1 });
  },

  async onFinish() {
    if (this.data.submitting) return;
    if (this.data.totalCount === 0) {
      toast('请先拍至少一张');
      return;
    }
    this.setData({ submitting: true });
    this.refreshDerived();
    showLoading('上传中...');
    let setId = photoStore.photoSetId;
    let baseOrder = photoStore.uploaded.length;

    try {
      for (let i = 0; i < photoStore.localQueue.length; ) {
        const item = photoStore.localQueue[i];
        try {
          // 上传前本地压缩(1600px / JPEG q85), 通常单张从 1-3MB 压到 100-300KB
          // OCR 模型对清晰度的需求阈值在 1600px, 再大不会提升识别率
          const compressed = await compressImage(item.tempFilePath, { quality: 85 });
          const { url } = await uploadService.putWithPolicy(compressed.path, 'photo');
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

function chooseMessageFile(options: {
  count: number;
  type: 'all' | 'video' | 'image' | 'file';
  extension?: string[];
}): Promise<WechatMiniprogram.ChooseMessageFileSuccessCallbackResult> {
  return new Promise((resolve, reject) => {
    wx.chooseMessageFile({
      count: options.count,
      type: options.type,
      extension: options.extension,
      success: resolve,
      fail: reject,
    });
  });
}

function env_isUserCancel(err: unknown): boolean {
  const m = (err as { errMsg?: string })?.errMsg ?? '';
  return /cancel/i.test(m);
}
