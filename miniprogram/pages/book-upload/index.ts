/**
 * 上传新书 / 编辑书籍信息(M8)
 *
 * 模式判断:?editId=xxx 时为编辑(只改 title/author/cover/description)
 * 普通模式:让用户上 PDF + 填信息 → POST /v1/books/upload(同步抽章, ~1-2 分钟)
 */

import { HttpError, bookService, uploadService } from '../../services/index';
import { hideLoading, showLoading, toast } from '../../utils/toast';

interface PageData {
  editing: boolean;
  editId: string;
  title: string;
  author: string;
  description: string;
  coverUrl: string;
  pdfUrl: string;
  pdfName: string;
  uploadingCover: boolean;
  uploadingPdf: boolean;
  submitting: boolean;
  canSubmit: boolean;
}

interface PageMethods {
  loadEditing: (id: string) => Promise<void>;
  onPickCover: () => void;
  onClearCover: () => void;
  onPickPdf: () => void;
  onTitleChange: (e: WechatMiniprogram.Input) => void;
  onAuthorChange: (e: WechatMiniprogram.Input) => void;
  onDescriptionChange: (e: WechatMiniprogram.Input) => void;
  onSubmit: () => Promise<void>;
  refreshCanSubmit: () => void;
}

Page<PageData, PageMethods>({
  data: {
    editing: false,
    editId: '',
    title: '',
    author: '',
    description: '',
    coverUrl: '',
    pdfUrl: '',
    pdfName: '',
    uploadingCover: false,
    uploadingPdf: false,
    submitting: false,
    canSubmit: false,
  },

  onLoad(options) {
    const editId = options?.editId ?? '';
    if (editId) {
      this.setData({ editing: true, editId });
      void this.loadEditing(editId);
    }
  },

  async loadEditing(id: string) {
    showLoading('加载中');
    try {
      const res = await bookService.detail(id);
      hideLoading();
      this.setData({
        title: res.book.title,
        author: res.book.author ?? '',
        description: res.book.description ?? '',
        coverUrl: res.book.cover_url ?? '',
      });
      this.refreshCanSubmit();
    } catch (err) {
      hideLoading();
      if (err instanceof HttpError) toast(err.message, 'error');
      else toast('加载失败', 'error');
      wx.navigateBack();
    }
  },

  onTitleChange(e) {
    this.setData({ title: e.detail.value });
    this.refreshCanSubmit();
  },
  onAuthorChange(e) {
    this.setData({ author: e.detail.value });
  },
  onDescriptionChange(e) {
    this.setData({ description: e.detail.value });
  },

  onPickCover() {
    wx.chooseMedia({
      count: 1,
      mediaType: ['image'],
      sourceType: ['album', 'camera'],
      sizeType: ['compressed'],
      success: async (res) => {
        const file = res.tempFiles?.[0];
        if (!file) return;
        this.setData({ uploadingCover: true });
        try {
          const r = await uploadService.putWithPolicy(file.tempFilePath, 'cover');
          this.setData({ coverUrl: r.url, uploadingCover: false });
        } catch (err) {
          this.setData({ uploadingCover: false });
          if (err instanceof HttpError) toast(err.message, 'error');
          else toast('封面上传失败', 'error');
        }
      },
      fail: () => {
        /* 用户取消, ignore */
      },
    });
  },

  onClearCover() {
    this.setData({ coverUrl: '' });
  },

  onPickPdf() {
    wx.chooseMessageFile({
      count: 1,
      type: 'file',
      extension: ['pdf'],
      success: async (res) => {
        const file = res.tempFiles?.[0];
        if (!file) return;
        if (!/\.pdf$/i.test(file.name)) {
          toast('请选择 PDF 文件', 'error');
          return;
        }
        const sizeMB = (file.size ?? 0) / (1024 * 1024);
        if (sizeMB > 50) {
          toast('PDF 不能超过 50 MB', 'error');
          return;
        }
        this.setData({ uploadingPdf: true });
        try {
          const r = await uploadService.putWithPolicy(file.path, 'pdf');
          this.setData({
            uploadingPdf: false,
            pdfUrl: r.url,
            pdfName: file.name,
          });
          this.refreshCanSubmit();
        } catch (err) {
          this.setData({ uploadingPdf: false });
          if (err instanceof HttpError) toast(err.message, 'error');
          else toast('PDF 上传失败', 'error');
        }
      },
      fail: () => {
        /* 用户取消, ignore */
      },
    });
  },

  refreshCanSubmit() {
    const titleOk = this.data.title.trim().length > 0;
    const pdfOk = this.data.editing ? true : !!this.data.pdfUrl;
    const busy = this.data.submitting || this.data.uploadingCover || this.data.uploadingPdf;
    this.setData({ canSubmit: titleOk && pdfOk && !busy });
  },

  async onSubmit() {
    if (!this.data.canSubmit) return;
    const title = this.data.title.trim();
    if (!title) {
      toast('请填写书名', 'error');
      return;
    }

    if (this.data.editing) {
      this.setData({ submitting: true });
      showLoading('保存中');
      try {
        await bookService.patchMine(this.data.editId, {
          title,
          author: this.data.author.trim() || undefined,
          description: this.data.description.trim() || undefined,
          cover_url: this.data.coverUrl || undefined,
        });
        hideLoading();
        this.setData({ submitting: false });
        toast('已保存', 'success');
        wx.navigateBack();
      } catch (err) {
        hideLoading();
        this.setData({ submitting: false });
        if (err instanceof HttpError) toast(err.message, 'error');
        else toast('保存失败', 'error');
      }
      return;
    }

    if (!this.data.pdfUrl) {
      toast('请先上传 PDF', 'error');
      return;
    }

    this.setData({ submitting: true });
    this.refreshCanSubmit();
    showLoading('提交中…');
    try {
      // 后端异步抽章, 接口立即返回(几百毫秒)
      await bookService.upload({
        title,
        author: this.data.author.trim() || undefined,
        description: this.data.description.trim() || undefined,
        cover_url: this.data.coverUrl || undefined,
        pdf_url: this.data.pdfUrl,
      });
      hideLoading();
      this.setData({ submitting: false });
      toast('已提交,AI 整理中', 'success');
      // 立即跳书库, 让用户看 "AI 正在抽取文字…" 进度卡
      wx.redirectTo({ url: '/pages/library/index' });
    } catch (err) {
      hideLoading();
      this.setData({ submitting: false });
      this.refreshCanSubmit();
      if (err instanceof HttpError) toast(err.message, 'error');
      else toast('上传失败,请重试', 'error');
    }
  },
});
