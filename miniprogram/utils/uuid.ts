/**
 * 简易 UUID v4(用作 X-Request-Id / Idempotency-Key)
 *
 * 不引入第三方库;crypto.randomUUID 在低版本基础库不可用,
 * 这里做 RFC 4122 规范的 fallback 实现。
 */

interface CryptoLike {
  randomUUID?: () => string;
}

export function uuid(): string {
  const c = (globalThis as { crypto?: CryptoLike }).crypto;
  if (c && typeof c.randomUUID === 'function') {
    try {
      return c.randomUUID();
    } catch {
      /* 某些低版本基础库下可能抛错, 回退到下方实现 */
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (ch) => {
    const r = (Math.random() * 16) | 0;
    const v = ch === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
