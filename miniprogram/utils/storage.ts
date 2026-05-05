/**
 * 本地存储封装(同步)
 *
 * 设计:
 * - 全部走 wx.setStorageSync / wx.getStorageSync, 自动 try/catch
 * - JSON 自动序列化
 * - 提供命名空间常量, 防止 key 漂移(参见 config/constants.ts)
 */

export function setStorage<T>(key: string, value: T): void {
  try {
    wx.setStorageSync(key, value);
  } catch (err) {
    console.error('[storage] set failed:', key, err);
  }
}

export function getStorage<T>(key: string, fallback: T): T {
  try {
    const v = wx.getStorageSync(key);
    if (v === '' || v === null || v === undefined) return fallback;
    return v as T;
  } catch (err) {
    console.error('[storage] get failed:', key, err);
    return fallback;
  }
}

export function removeStorage(key: string): void {
  try {
    wx.removeStorageSync(key);
  } catch (err) {
    console.error('[storage] remove failed:', key, err);
  }
}

export function clearStorageMatching(prefix: string): void {
  try {
    const info = wx.getStorageInfoSync();
    info.keys
      .filter((k) => k.startsWith(prefix))
      .forEach((k) => {
        wx.removeStorageSync(k);
      });
  } catch (err) {
    console.error('[storage] clear matching failed:', prefix, err);
  }
}
