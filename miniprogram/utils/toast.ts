/**
 * Toast / Modal 二次封装(基于微信原生 API, 避免组件耦合)
 *
 * 为什么不用 TDesign t-toast: 全局调用更顺手, 也能在 service 层用;
 * UI 上 t-toast 仅用作页面内强反馈。
 */

export type ToastIcon = 'success' | 'error' | 'loading' | 'none';

export function toast(title: string, icon: ToastIcon = 'none', duration = 1800): void {
  wx.showToast({
    title: title.length > 14 ? `${title.slice(0, 14)}...` : title,
    icon,
    duration,
    mask: icon === 'loading',
  });
}

export function hideToast(): void {
  wx.hideToast();
}

export function showLoading(title = '加载中', mask = true): void {
  wx.showLoading({ title, mask });
}

export function hideLoading(): void {
  wx.hideLoading();
}

export interface ConfirmOptions {
  title?: string;
  content: string;
  confirmText?: string;
  cancelText?: string;
  showCancel?: boolean;
  confirmColor?: string;
}

export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    wx.showModal({
      title: opts.title ?? '提示',
      content: opts.content,
      confirmText: opts.confirmText ?? '确认',
      cancelText: opts.cancelText ?? '取消',
      showCancel: opts.showCancel ?? true,
      confirmColor: opts.confirmColor ?? '#5B5BD6',
      success: (res) => resolve(res.confirm),
      fail: () => resolve(false),
    });
  });
}
