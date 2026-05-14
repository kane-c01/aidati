/**
 * 书名封面 (title-as-cover) 工具
 *
 * 不依赖图片, 用「书名 hash → tone index」让列表里同一类色不至于扎堆
 *
 * 与 app.wxss 里的 `.book-title-cover--tone-{0..5}` 一一对应
 */

const TONE_COUNT = 6;

/**
 * 把书名映射到 0..5 的色调索引
 *
 * 规则:对每个字符做 31 进制累加, 取绝对值再模 TONE_COUNT
 * 同一书名稳定返回同一调子, 列表刷新不变, 视觉记忆更稳
 */
export function coverToneIndex(title: string | null | undefined): number {
  const t = (title ?? '').trim();
  if (!t) return 0;
  let h = 0;
  for (let i = 0; i < t.length; i++) {
    h = (h * 31 + t.charCodeAt(i)) | 0;
  }
  return Math.abs(h) % TONE_COUNT;
}

/** 输出可直接拼到 class 里的字符串 */
export function coverToneClass(title: string | null | undefined): string {
  return `book-title-cover--tone-${coverToneIndex(title)}`;
}
