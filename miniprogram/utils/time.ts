/**
 * 时间工具
 *
 * 后端统一返回 ISO 8601 UTC 字符串, 前端在此处转 Asia/Shanghai 显示。
 */

const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

/**
 * 把 ISO 字符串格式化成「YYYY-MM-DD HH:mm」(Asia/Shanghai)
 */
export function formatDateTime(iso: string | undefined | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  // 统一拉到上海时区(UTC+8), 不依赖小程序运行时时区
  const local = new Date(d.getTime() + SHANGHAI_OFFSET_MS);
  const y = local.getUTCFullYear();
  const m = `${local.getUTCMonth() + 1}`.padStart(2, '0');
  const day = `${local.getUTCDate()}`.padStart(2, '0');
  const hh = `${local.getUTCHours()}`.padStart(2, '0');
  const mm = `${local.getUTCMinutes()}`.padStart(2, '0');
  return `${y}-${m}-${day} ${hh}:${mm}`;
}

/**
 * 相对时间(刚刚 / X 分钟前 / X 小时前 / 昨天 / YYYY-MM-DD)
 */
export function formatRelative(iso: string | undefined | null): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const diffMs = Date.now() - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  if (diffSec < 60) return '刚刚';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)} 分钟前`;
  if (diffSec < 86_400) return `${Math.floor(diffSec / 3600)} 小时前`;
  if (diffSec < 86_400 * 2) return '昨天';
  return formatDateTime(iso).slice(0, 10);
}

/** 「mm:ss」秒数格式化(用于答题计时 / 用时) */
export function formatDuration(totalSec: number): string {
  const s = Math.max(0, Math.floor(totalSec));
  const mm = Math.floor(s / 60);
  const ss = s % 60;
  if (mm < 60) {
    return `${mm}:${`${ss}`.padStart(2, '0')}`;
  }
  const hh = Math.floor(mm / 60);
  const m2 = mm % 60;
  return `${hh}:${`${m2}`.padStart(2, '0')}:${`${ss}`.padStart(2, '0')}`;
}

export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
