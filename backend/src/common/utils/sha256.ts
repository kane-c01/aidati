import { createHash, createHmac } from 'node:crypto';

/**
 * SHA-256 摘要(16 进制)
 * 用于:openid 脱敏存日志、stem_hash 错题去重、内容审核 content_hash
 */
export function sha256(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/**
 * HMAC-SHA256(用于带盐的哈希,如审计日志的 PII 脱敏)
 */
export function hmacSha256(input: string, secret: string): string {
  return createHmac('sha256', secret).update(input).digest('hex');
}
