/**
 * 反馈与建议(从 profile 进入)
 *
 * 03-API §3.4
 */

import { userService, HttpError } from '../../services/index';
import { hideLoading, showLoading, toast } from '../../utils/toast';
import { track } from '../../utils/tracker';

interface PageData {
  content: string;
  contact: string;
  submitting: boolean;
  canSubmit: boolean;
}

interface PageMethods {
  onInput: (e: WechatMiniprogram.Input) => void;
  onContactInput: (e: WechatMiniprogram.Input) => void;
  onSubmit: () => Promise<void>;
}

Page<PageData, PageMethods>({
  data: {
    content: '',
    contact: '',
    submitting: false,
    canSubmit: false,
  },

  onInput(e) {
    const v = e.detail.value;
    this.setData({ content: v, canSubmit: v.trim().length >= 10 });
  },

  onContactInput(e) {
    this.setData({ contact: e.detail.value });
  },

  async onSubmit() {
    if (!this.data.canSubmit || this.data.submitting) return;
    this.setData({ submitting: true });
    showLoading('提交中');
    try {
      await userService.feedback({
        content: this.data.content.trim(),
        contact: this.data.contact.trim() || undefined,
      });
      hideLoading();
      this.setData({ submitting: false });
      track('feedback_submit', { len: this.data.content.length });
      toast('已收到, 多谢!', 'success');
      setTimeout(() => wx.navigateBack(), 800);
    } catch (err) {
      hideLoading();
      this.setData({ submitting: false });
      if (err instanceof HttpError) toast(err.message, 'error');
      else toast('提交失败,请重试', 'error');
    }
  },
});
