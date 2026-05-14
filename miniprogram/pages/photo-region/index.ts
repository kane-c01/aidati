/**
 * U06b 框选识别区域
 *
 * 入参:?photoId=xxx&imageUrl=xxx[&setId=xxx]
 *
 * 流程:
 *  - 加载图片 → 取舞台尺寸(以 widthFix 后的 image 视觉宽高为准)
 *  - touch 拖框 → 归一化 bbox 入 regions
 *  - 每条 region 可改 kind / 填 ocr_text
 *  - 「保存」→ PATCH /photos/:id { regions, ocr_text? }
 *
 * 注:本页只做"用户框选 + 手填"。真实「框选区 OCR」/「图表识别」由 M3 接入
 *    服务端 (LLM 视觉 / 腾讯图表 OCR) 后,在此处加一个"识别选中区"按钮即可。
 */

import { HttpError, photoService } from '../../services/index';
import type { PhotoRegion, PhotoRegionKind } from '../../types/domain';
import { hideLoading, showLoading, toast } from '../../utils/toast';

interface DrawingState {
  live: boolean;
  startX: number;
  startY: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

interface RegionView extends PhotoRegion {
  _label: string;
  _chartSummary?: string;
}

interface PageData {
  photoId: string;
  setId: string;
  imageUrl: string;
  stageW: number;
  stageH: number;
  regions: RegionView[];
  activeId: string;
  drawing: DrawingState;
  saving: boolean;
  recognizingId: string;
  kinds: Array<{ value: PhotoRegionKind; label: string }>;
}

type ImgLoadEvent = WechatMiniprogram.CustomEvent<{ width: number; height: number }>;

interface PageMethods {
  onImgLoad: (e: ImgLoadEvent) => void;
  onStart: (e: WechatMiniprogram.TouchEvent) => void;
  onMove: (e: WechatMiniprogram.TouchEvent) => void;
  onEnd: () => void;
  onPickRegion: (e: WechatMiniprogram.BaseEvent) => void;
  onChangeKind: (e: WechatMiniprogram.BaseEvent) => void;
  onChangeText: (e: WechatMiniprogram.Input) => void;
  onRemoveRegion: (e: WechatMiniprogram.BaseEvent) => void;
  onClear: () => void;
  onSave: () => Promise<void>;
  onRecognize: (e: WechatMiniprogram.BaseEvent) => Promise<void>;
  saveRegionsRemote: () => Promise<void>;
  syncLabels: (rs: PhotoRegion[]) => RegionView[];
  buildId: () => string;
}

const KINDS: PageData['kinds'] = [
  { value: 'text', label: '文字' },
  { value: 'formula', label: '公式' },
  { value: 'table', label: '表格' },
  { value: 'chart', label: '图表' },
];

const KIND_LABELS: Record<PhotoRegionKind, string> = {
  text: '文字',
  chart: '图表',
  formula: '公式',
  table: '表格',
};

/** 与 picker 容器左上角的偏移量(touch 事件相对于画布) */
let stageOffsetX = 0;
let stageOffsetY = 0;

Page<PageData, PageMethods>({
  data: {
    photoId: '',
    setId: '',
    imageUrl: '',
    stageW: 1,
    stageH: 1,
    regions: [],
    activeId: '',
    drawing: { live: false, startX: 0, startY: 0, x: 0, y: 0, w: 0, h: 0 },
    saving: false,
    recognizingId: '',
    kinds: KINDS,
  },

  onLoad(options) {
    const photoId = options?.photoId ?? '';
    const imageUrl = decodeURIComponent(options?.imageUrl ?? '');
    const setId = options?.setId ?? '';
    if (!photoId || !imageUrl) {
      toast('参数缺失', 'error');
      wx.navigateBack();
      return;
    }
    let initial: PhotoRegion[] = [];
    try {
      const raw = options?.regions ? decodeURIComponent(options.regions) : '';
      if (raw) initial = JSON.parse(raw) as PhotoRegion[];
    } catch (err) {
      console.warn('[photo-region] 解析初始 regions 失败', err);
    }
    this.setData({
      photoId,
      setId,
      imageUrl,
      regions: this.syncLabels(initial),
    });
  },

  onImgLoad(e) {
    const w = e.detail?.width ?? 1;
    const h = e.detail?.height ?? 1;
    // widthFix 模式下 image 元素实际宽 = stage 宽; 高度按比例。
    // 取页面视觉宽: 减去左右 padding(--space-lg ≈ 24rpx)
    const sysWidth = wx.getSystemInfoSync().windowWidth;
    const padding = 32; // 与 wxss .region 的 padding 大致一致(单位 px 估算)
    const stageW = Math.max(0, sysWidth - padding);
    const stageH = (stageW * h) / w;
    this.setData({ stageW, stageH });

    wx.createSelectorQuery()
      .select('.region__canvas')
      .boundingClientRect()
      .exec((res) => {
        const r = res?.[0] as { left?: number; top?: number } | undefined;
        if (r) {
          stageOffsetX = r.left ?? 0;
          stageOffsetY = r.top ?? 0;
        }
      });
  },

  onStart(e) {
    const t = e.touches?.[0];
    if (!t) return;
    const x = Math.max(0, t.clientX - stageOffsetX);
    const y = Math.max(0, t.clientY - stageOffsetY);
    this.setData({
      drawing: { live: true, startX: x, startY: y, x, y, w: 0, h: 0 },
    });
  },

  onMove(e) {
    if (!this.data.drawing.live) return;
    const t = e.touches?.[0];
    if (!t) return;
    const sx = this.data.drawing.startX;
    const sy = this.data.drawing.startY;
    const cx = Math.max(0, Math.min(this.data.stageW, t.clientX - stageOffsetX));
    const cy = Math.max(0, Math.min(this.data.stageH, t.clientY - stageOffsetY));
    const x = Math.min(sx, cx);
    const y = Math.min(sy, cy);
    const w = Math.abs(cx - sx);
    const h = Math.abs(cy - sy);
    this.setData({
      drawing: { live: true, startX: sx, startY: sy, x, y, w, h },
    });
  },

  onEnd() {
    const d = this.data.drawing;
    this.setData({
      drawing: { live: false, startX: 0, startY: 0, x: 0, y: 0, w: 0, h: 0 },
    });
    if (!d.live) return;
    // 太小的框忽略
    const MIN = 24;
    if (d.w < MIN || d.h < MIN) return;
    const stageW = this.data.stageW || 1;
    const stageH = this.data.stageH || 1;
    const region: PhotoRegion = {
      id: this.buildId(),
      bbox: [d.x / stageW, d.y / stageH, d.w / stageW, d.h / stageH],
      coord: 'normalized',
      kind: 'text',
      ocr_text: '',
      corrected: 0,
    };
    const next = [...this.data.regions, { ...region, _label: KIND_LABELS[region.kind] }];
    this.setData({ regions: next, activeId: region.id });
  },

  onPickRegion(e) {
    const id = (e.currentTarget.dataset as { id?: string }).id ?? '';
    this.setData({ activeId: id });
  },

  onChangeKind(e) {
    const ds = e.currentTarget.dataset as { id?: string; kind?: PhotoRegionKind };
    const id = ds.id ?? '';
    const kind = ds.kind ?? 'text';
    const next = this.data.regions.map((r) =>
      r.id === id ? { ...r, kind, _label: KIND_LABELS[kind] } : r,
    );
    this.setData({ regions: next, activeId: id });
  },

  onChangeText(e) {
    const id = (e.currentTarget.dataset as { id?: string }).id ?? '';
    const v = e.detail.value;
    const next = this.data.regions.map((r) =>
      r.id === id ? { ...r, ocr_text: v, corrected: 1 } : r,
    );
    this.setData({ regions: next });
  },

  onRemoveRegion(e) {
    const id = (e.currentTarget.dataset as { id?: string }).id ?? '';
    const next = this.data.regions.filter((r) => r.id !== id);
    this.setData({ regions: next, activeId: this.data.activeId === id ? '' : this.data.activeId });
  },

  onClear() {
    if (!this.data.regions.length) return;
    wx.showModal({
      title: '清空确认',
      content: '清空后无法恢复, 仍要继续?',
      success: (res) => {
        if (res.confirm) this.setData({ regions: [], activeId: '' });
      },
    });
  },

  async onSave() {
    if (this.data.saving) return;
    this.setData({ saving: true });
    showLoading('保存中');
    try {
      await this.saveRegionsRemote();
      hideLoading();
      this.setData({ saving: false });
      toast('已保存', 'success');
      wx.navigateBack();
    } catch (err) {
      hideLoading();
      this.setData({ saving: false });
      if (err instanceof HttpError) toast(err.message, 'error');
      else toast('保存失败,请重试', 'error');
    }
  },

  /**
   * 触发当前 region 的 AI 识别
   * 流程:先把 regions 整体保存(让后端有这条 id)→ POST recognize → 用回包 regions 替换
   */
  async onRecognize(e) {
    const id = (e.currentTarget.dataset as { id?: string }).id ?? '';
    if (!id || this.data.recognizingId) return;
    this.setData({ recognizingId: id, activeId: id });
    showLoading('识别中…');
    try {
      // 先把当前 regions 保存到服务器,确保 region.id 存在
      await this.saveRegionsRemote();
      const fresh = await photoService.recognizeRegion(this.data.photoId, id);
      const next = (fresh.regions ?? []).map((r) => {
        const summary = (r.chart_data as Record<string, unknown> | null | undefined)?.summary;
        return {
          ...r,
          _label: KIND_LABELS[r.kind] ?? '区域',
          _chartSummary: typeof summary === 'string' ? summary : undefined,
        } as RegionView;
      });
      hideLoading();
      this.setData({ regions: next, recognizingId: '' });
      toast('已识别', 'success');
    } catch (err) {
      hideLoading();
      this.setData({ recognizingId: '' });
      if (err instanceof HttpError) toast(err.message, 'error');
      else toast('识别失败', 'error');
    }
  },

  async saveRegionsRemote() {
    const payload: PhotoRegion[] = this.data.regions.map((r) => ({
      id: r.id,
      bbox: r.bbox,
      coord: r.coord,
      kind: r.kind,
      ocr_text: r.ocr_text ?? '',
      corrected: r.corrected ?? 0,
    }));
    await photoService.updatePhoto(this.data.photoId, { regions: payload });
  },

  syncLabels(rs) {
    return rs.map((r) => ({ ...r, _label: KIND_LABELS[r.kind] ?? '区域' }));
  },

  buildId() {
    return `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
  },
});
