/**
 * PII 脱敏工具
 * 文档:开发文档/05-部署运维与安全.md §6.1, §7.3
 * 入日志前必须脱敏,避免泄露
 */

/**
 * 通用字符串掩码:保留首 2 + 末 2,中间用 ****
 * 如:`abcdef12345678` → `ab****78`
 */
export function maskString(input: string | undefined | null, keepHead = 2, keepTail = 2): string {
  if (!input) return '';
  if (input.length <= keepHead + keepTail) return '****';
  return `${input.slice(0, keepHead)}****${input.slice(-keepTail)}`;
}

/**
 * Bearer Token 脱敏:`Bearer abcdefxxxxx` → `Bearer ab****xx`
 */
export function maskToken(authHeader: string | undefined): string {
  if (!authHeader) return '';
  const match = authHeader.match(/^(\w+)\s+(.+)$/);
  if (!match) return maskString(authHeader);
  return `${match[1]} ${maskString(match[2], 4, 4)}`;
}

/**
 * 微信 openid 脱敏:`oXxxxxxxx_yyyyyyyy` → `oX****yy`
 */
export function maskOpenid(openid: string | undefined | null): string {
  return maskString(openid, 3, 3);
}

/**
 * 手机号脱敏(预留 V3 使用):`13812345678` → `138****5678`
 */
export function maskPhone(phone: string | undefined | null): string {
  if (!phone) return '';
  if (phone.length !== 11) return maskString(phone);
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}
