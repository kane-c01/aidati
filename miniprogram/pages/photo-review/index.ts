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
import {
  ContentBlockedError,
  HttpError,
  bookService,
  photoService,
  uploadService,
} from '../../services/index';
import { paperStore } from '../../stores/paper';
import { photoStore } from '../../stores/photo';
import { confirm, hideLoading, showLoading, toast } from '../../utils/toast';
import { sleep } from '../../utils/time';
import { editRemote, isEditCancel } from '../../utils/image';
import { compressImage } from '../../utils/compress';
import { track } from '../../utils/tracker';
import type { OcrTaskStatus, PhotoItem } from '../../types/domain';

interface PhotoItemView extends PhotoItem {
  /** 序列化后的 regions, 用于在 wxml 里通过 data-* 传给框选页 */
  _regionsRaw: string;
  /** 本页是否被勾选「计入出题」(默认 true; 无 ocr_text 也可勾, 走 region OCR) */
  _selected: boolean;
}

interface PageData {
  setId: string;
  items: PhotoItemView[];
  ocrStatus: OcrTaskStatus | 'idle';
  /** 0-100, 优先用后端 progress(已识别页数占比), 兜底用时间推算 */
  progress: number;
  /** 已识别页数(用于副标题展示), 0 时不展示 */
  doneCount: number;
  totalCount: number;
  /** 主标题 / 副标题随时间推移变得「更耐心」, 减少用户焦虑 */
  loadingTitle: string;
  loadingHint: string;
  /** 当前被勾选要计入出题的 photo id 集合大小, 用 UI 文案 / 按钮禁用 */
  selectedCount: number;
  saving: boolean;
  convertingBook: boolean;
}

interface PageMethods {
  pollLoop: () => Promise<void>;
  ensurePolling: () => void;
  refreshOnce: () => Promise<void>;
  refreshLoadingCopy: (elapsedMs: number) => void;
  promptExtendOrFail: () => Promise<boolean>;
  onTextChange: (e: WechatMiniprogram.Input) => void;
  onOpenRegion: (e: WechatMiniprogram.BaseEvent) => void;
  onRecropPhoto: (e: WechatMiniprogram.BaseEvent) => Promise<void>;
  onToggleSelect: (e: WechatMiniprogram.BaseEvent) => void;
  onSelectAll: () => void;
  onInvertSelect: () => void;
  onContinue: () => Promise<void>;
  onSaveAsBook: () => Promise<void>;
  onBackPhoto: () => void;
}

/**
 * 同一 page 实例内的 polling generation 计数。
 * 每次主动启动新一轮 polling 时 ++; pollLoop 内每次循环检查 my === pollGen, 不等就退出。
 * 主要解决「重裁后再次 startOcr → 启动新 polling」与旧 polling 并发的问题。
 */
let pollGen = 0;

function withLabels(items: PhotoItem[], prevSelected?: Map<string, boolean>): PhotoItemView[] {
  return items.map((it) => ({
    ...it,
    _regionsRaw: encodeURIComponent(JSON.stringify(it.regions ?? [])),
    // 默认勾选;已经勾过 / 取消过的页保留用户的选择(增量轮询不要 reset)
    _selected: prevSelected?.has(it.id) ? (prevSelected.get(it.id) as boolean) : true,
  }));
}

function countSelected(items: PhotoItemView[]): number {
  return items.reduce((n, it) => n + (it._selected ? 1 : 0), 0);
}

Page<PageData, PageMethods>({
  data: {
    setId: '',
    items: [],
    ocrStatus: 'idle',
    progress: 0,
    doneCount: 0,
    totalCount: 0,
    loadingTitle: '正在识别文字...',
    loadingHint: '通常 10-30 秒, 复杂版面可能更久',
    selectedCount: 0,
    saving: false,
    convertingBook: false,
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
      .startOcr(setId, { mode: 'vision' })
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
    /** 软超时累计的「续等」次数, 防止无限弹窗 */
    let extendedRounds = 0;
    pollGen += 1;
    const myGen = pollGen;

    while (Date.now() - start < OCR_POLL.HARD_TIMEOUT_MS) {
      if (myGen !== pollGen) return; // 被新一轮 polling 取代
      const elapsed = Date.now() - start;
      try {
        const res = await photoService.getOcr(this.data.setId);
        photoStore.setOcrStatus(res.ocr_status, res.ocr_text);
        photoStore.setUploadedList(res.items ?? []);

        const items = res.items ?? [];
        const doneCount = items.filter((it) => (it.ocr_text ?? '').length > 0).length;
        // 优先用后端进度 (已识别 / 总数), 兜底用时间线性推算
        const serverProgress =
          typeof res.progress === 'number'
            ? Math.max(0, Math.min(100, Math.round(res.progress)))
            : items.length > 0
              ? Math.round((doneCount / items.length) * 100)
              : 0;
        const timeProgress = Math.min(
          95,
          Math.max(5, Math.floor((elapsed / OCR_POLL.SOFT_TIMEOUT_MS) * 100)),
        );
        const progress =
          res.ocr_status === 'done' ? 100 : Math.max(serverProgress, timeProgress);

        const prevSelected = new Map(this.data.items.map((it) => [it.id, it._selected]));
        const nextItems = withLabels(items, prevSelected);
        this.setData({
          items: nextItems,
          ocrStatus: res.ocr_status,
          progress,
          doneCount,
          totalCount: items.length,
          selectedCount: countSelected(nextItems),
        });
        this.refreshLoadingCopy(elapsed);

        if (res.ocr_status === 'done' || res.ocr_status === 'failed') {
          track('ocr_finish', {
            status: res.ocr_status,
            n: items.length,
            done: doneCount,
            elapsed_ms: elapsed,
          });
          return;
        }
      } catch (err) {
        console.warn('[ocr] poll error', err);
      }

      // 软超时: 弹窗问用户「再等等 / 用现有结果」, 不直接判定失败
      if (Date.now() - start >= OCR_POLL.SOFT_TIMEOUT_MS && extendedRounds === 0) {
        extendedRounds += 1;
        const keepWaiting = await this.promptExtendOrFail();
        if (!keepWaiting) {
          this.setData({ ocrStatus: 'failed' });
          track('ocr_soft_timeout', {
            n: this.data.totalCount,
            done: this.data.doneCount,
            elapsed_ms: Date.now() - start,
            action: 'stop',
          });
          return;
        }
        track('ocr_soft_timeout', {
          n: this.data.totalCount,
          done: this.data.doneCount,
          elapsed_ms: Date.now() - start,
          action: 'extend',
        });
      }

      await sleep(interval);
      interval = Math.min(interval + 200, OCR_POLL.MAX_INTERVAL_MS);
    }

    // 走到这里就是真·硬超时: 后端 4 分钟仍未给结果, 大概率卡死
    this.setData({ ocrStatus: 'failed' });
    toast('OCR 超时, 请检查网络后重试', 'error');
    track('ocr_hard_timeout', {
      n: this.data.totalCount,
      done: this.data.doneCount,
    });
  },

  /**
   * 根据已耗时切换加载文案,让用户感受「正在分阶段处理」
   * - <10s: 默认乐观
   * - 10-30s: 提示「正在识别每一页」
   * - >=30s: 提示「复杂版面/公式/表格需要更多时间」, 安抚预期
   */
  refreshLoadingCopy(elapsedMs: number) {
    const { ocrStatus, doneCount, totalCount } = this.data;
    if (ocrStatus !== 'pending' && ocrStatus !== 'processing') return;

    const tail =
      totalCount > 0 && doneCount > 0
        ? `已完成 ${doneCount}/${totalCount} 页`
        : totalCount > 0
          ? `共 ${totalCount} 页, 正在排队识别`
          : '';
    let title = '正在识别文字...';
    let hint = '通常 10-30 秒, 复杂版面可能更久';

    if (elapsedMs >= OCR_POLL.SOFT_HINT_AT_MS) {
      title = 'AI 正在仔细看每一页...';
      hint = tail
        ? `${tail}, 含公式/表格/图表的页面会稍慢, 请再等等`
        : '含公式/表格/图表的页面会稍慢, 请再等等';
    } else if (elapsedMs >= 10_000 && tail) {
      hint = tail;
    }

    if (this.data.loadingTitle !== title || this.data.loadingHint !== hint) {
      this.setData({ loadingTitle: title, loadingHint: hint });
    }
  },

  /**
   * 重裁完成或其它「需要重新轮询 OCR」的场景调这个,
   * 把页面切回 processing 并启动新一轮 pollLoop(老 loop 会因 myGen!==pollGen 自动退出)
   */
  ensurePolling() {
    this.setData({ ocrStatus: 'processing', progress: 5 });
    void this.pollLoop();
  },

  /**
   * 软超时弹窗: 用户可以选择继续等待或用现有结果(可能为空)
   * 返回 true 表示继续轮询
   */
  async promptExtendOrFail() {
    const { doneCount, totalCount } = this.data;
    const summary =
      totalCount > 0
        ? `已识别 ${doneCount}/${totalCount} 页`
        : '识别尚未完成';
    return confirm({
      title: '识别还在进行',
      content: `${summary}。AI 可能正在处理复杂版面, 是否再等 60 秒?`,
      confirmText: '再等 60 秒',
      cancelText: '不等了',
    });
  },

  /** 框选页返回时刷一次, 把改动同步进来(保留用户的勾选状态) */
  async refreshOnce() {
    if (!this.data.setId) return;
    try {
      const res = await photoService.getOcr(this.data.setId);
      photoStore.setUploadedList(res.items ?? []);
      const prevSelected = new Map(this.data.items.map((it) => [it.id, it._selected]));
      const nextItems = withLabels(res.items ?? [], prevSelected);
      this.setData({ items: nextItems, selectedCount: countSelected(nextItems) });
    } catch (err) {
      console.warn('[ocr] refresh error', err);
    }
  },

  onShow() {
    if (this.data.items.length > 0) void this.refreshOnce();
  },

  onTextChange(e) {
    const id = (e.currentTarget.dataset as { id: string }).id;
    const v = e.detail.value;
    const next = this.data.items.map((it) => (it.id === id ? { ...it, ocr_text: v } : it));
    this.setData({ items: next });
  },

  /** 单页勾选切换:点击 checkbox / 整行复用都走这里 */
  onToggleSelect(e) {
    const id = (e.currentTarget.dataset as { id?: string }).id ?? '';
    if (!id) return;
    const next = this.data.items.map((it) =>
      it.id === id ? { ...it, _selected: !it._selected } : it,
    );
    this.setData({ items: next, selectedCount: countSelected(next) });
  },

  onSelectAll() {
    const next = this.data.items.map((it) => ({ ...it, _selected: true }));
    this.setData({ items: next, selectedCount: next.length });
  },

  onInvertSelect() {
    const next = this.data.items.map((it) => ({ ...it, _selected: !it._selected }));
    this.setData({ items: next, selectedCount: countSelected(next) });
  },

  onOpenRegion(e) {
    const ds = e.currentTarget.dataset as {
      id?: string;
      image?: string;
      regions?: string;
    };
    const id = ds.id ?? '';
    const image = ds.image ?? '';
    const regionsRaw = ds.regions ?? encodeURIComponent('[]');
    if (!id || !image) {
      toast('图片信息缺失', 'error');
      return;
    }
    wx.navigateTo({
      url:
        `/pages/photo-region/index` +
        `?photoId=${encodeURIComponent(id)}` +
        `&imageUrl=${encodeURIComponent(image)}` +
        `&setId=${encodeURIComponent(this.data.setId)}` +
        `&regions=${regionsRaw}`,
    });
  },

  /**
   * 「重裁」当前已上传图:下载到本地 → wx.editImage → 重新上传 OSS → PATCH 换图 →
   * 后端 PATCH 检测到 image_url 变化自动清空 ocrText, 这里再调一次 startOcr 让 backend
   * 只重跑空的那一张, 最后启动新一轮 polling
   */
  async onRecropPhoto(e) {
    const id = (e.currentTarget.dataset as { id?: string }).id ?? '';
    if (!id) return;
    const photo = this.data.items.find((it) => it.id === id);
    if (!photo) return;

    let newLocalPath: string;
    try {
      newLocalPath = await editRemote(photo.image_url);
    } catch (err) {
      if (isEditCancel(err)) return;
      console.warn('[ocr] recrop edit failed', err);
      toast('裁剪失败, 请重试', 'error');
      return;
    }

    showLoading('保存裁剪…');
    try {
      const compressed = await compressImage(newLocalPath, { quality: 85 });
      const r = await uploadService.putWithPolicy(compressed.path, 'photo');
      await photoService.updatePhoto(id, { image_url: r.url });
      // 后端已经把这张 ocrText 清空 & set 改回 processing, 主动触发一次 OCR 让 backend 重跑
      await photoService
        .startOcr(this.data.setId, { mode: 'vision' })
        .catch((err) => console.warn('[ocr] restart after recrop', err));
      hideLoading();
      toast('已替换, 重新识别中', 'success');
      track('photo_recrop', { photoId: id, setId: this.data.setId });
      this.ensurePolling();
    } catch (err) {
      hideLoading();
      console.warn('[ocr] recrop upload failed', err);
      if (err instanceof ContentBlockedError) {
        void confirm({
          title: '内容被拦截',
          content: err.message,
          showCancel: false,
          confirmText: '我知道了',
        });
      } else if (err instanceof HttpError) {
        toast(err.message, 'error');
      } else {
        toast('裁剪重传失败', 'error');
      }
    }
  },

  async onContinue() {
    if (this.data.saving) return;
    const selectedItems = this.data.items.filter((it) => it._selected);
    if (selectedItems.length === 0) {
      toast('至少勾选 1 页才能出题', 'none');
      return;
    }
    this.setData({ saving: true });
    showLoading('保存校对');
    try {
      await photoService.patchOcr(this.data.setId, {
        items: this.data.items
          .filter((it) => typeof it.ocr_text === 'string')
          .map((it) => ({ photo_id: it.id, ocr_text: it.ocr_text ?? '' })),
      });
      // 若全选, 不传 selected_photo_ids (后端走原逻辑用 set.ocrText); 否则透传 id 列表
      const allSelected = selectedItems.length === this.data.items.length;
      paperStore.setPendingSource({
        source_type: 'photo_set',
        photo_set_id: this.data.setId,
        book_title: null,
        selected_photo_ids: allSelected ? undefined : selectedItems.map((it) => it.id),
      });
      hideLoading();
      this.setData({ saving: false });
      track('ocr_review_save', {
        n: this.data.items.length,
        selected: selectedItems.length,
        all_selected: allSelected,
      });
      wx.navigateTo({ url: '/pages/paper-config/index' });
    } catch (err) {
      hideLoading();
      this.setData({ saving: false });
      if (err instanceof HttpError) toast(err.message, 'error');
      else toast('保存失败,请重试', 'error');
    }
  },

  async onSaveAsBook() {
    if (!this.data.setId || this.data.convertingBook) return;
    if (!this.data.items.length) {
      toast('还没有识别到任何文字', 'error');
      return;
    }

    const titleRes = await new Promise<{ ok: boolean; title: string }>((resolve) => {
      wx.showModal({
        title: '保存为书',
        content: '为这本"自建书"起个名字, AI 会自动按章节切分',
        editable: true,
        placeholderText: '比如:数学 第三章 错题集',
        confirmText: '保存',
        cancelText: '取消',
        success: (r) => resolve({ ok: !!r.confirm, title: (r.content ?? '').trim() }),
        fail: () => resolve({ ok: false, title: '' }),
      });
    });
    if (!titleRes.ok) return;
    if (!titleRes.title) {
      toast('请填一个书名', 'error');
      return;
    }

    this.setData({ convertingBook: true });
    showLoading('提交中…');
    try {
      // 后端异步抽章, 提交即返回(几百毫秒)
      await bookService.fromPhotoSet({
        photo_set_id: this.data.setId,
        title: titleRes.title,
      });
      hideLoading();
      this.setData({ convertingBook: false });
      track('photo_to_book', { title: titleRes.title });
      toast('已提交,AI 整理中', 'success');
      wx.redirectTo({ url: '/pages/library/index' });
    } catch (err) {
      hideLoading();
      this.setData({ convertingBook: false });
      if (err instanceof HttpError) toast(err.message, 'error');
      else toast('整理失败,请重试', 'error');
    }
  },

  onBackPhoto() {
    wx.navigateBack();
  },
});
