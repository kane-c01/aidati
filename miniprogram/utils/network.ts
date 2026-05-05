/**
 * 网络状态监听
 *
 * 04-前端规范 §3.6: 全局监听网络断开, 顶部显示「网络异常」。
 * 此处只暴露 store-friendly 的 listener 接口, UI 渲染由调用方决定。
 */

type NetworkType = WechatMiniprogram.OnNetworkStatusChangeListenerResult['networkType'];

let isConnected = true;
let networkType: NetworkType = 'unknown';
const listeners = new Set<(c: { isConnected: boolean; networkType: NetworkType }) => void>();

export function initNetworkWatcher(): void {
  wx.getNetworkType({
    success: (res) => {
      networkType = res.networkType;
      isConnected = networkType !== 'none';
      emit();
    },
  });
  wx.onNetworkStatusChange((res) => {
    networkType = res.networkType;
    isConnected = res.isConnected;
    emit();
  });
}

function emit(): void {
  listeners.forEach((fn) => {
    try {
      fn({ isConnected, networkType });
    } catch (err) {
      console.error('[network] listener error', err);
    }
  });
}

export function onNetworkChange(
  fn: (c: { isConnected: boolean; networkType: NetworkType }) => void,
): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function getNetworkSnapshot(): { isConnected: boolean; networkType: NetworkType } {
  return { isConnected, networkType };
}
