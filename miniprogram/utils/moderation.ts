/**
 * 客户端敏感词前置过滤
 *
 * 设计:
 * - 仅做「明显不合适」的拦截, 减少后端压力(04-前端规范 §3.9)
 * - 真正的内容安全要走后端 / 微信内容安全 API
 * - 词典极简, 留接口位以便后续从远程 system_config 拉取
 */

const MIN_LIST: string[] = [
  // 占位:正式上线前需补充常见违禁词;敏感词不出现在仓库源码里更合规,
  // 建议改为发版时从后端 /v1/system/sensitive-words 拉取后落本地缓存。
];

let cached: string[] = MIN_LIST;

export function setSensitiveWords(words: string[]): void {
  cached = [...MIN_LIST, ...words.map((w) => w.trim()).filter(Boolean)];
}

export function checkSensitive(text: string): { ok: boolean; hit?: string } {
  if (!text) return { ok: true };
  for (const w of cached) {
    if (w && text.includes(w)) {
      return { ok: false, hit: w };
    }
  }
  return { ok: true };
}
