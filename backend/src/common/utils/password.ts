import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

/**
 * 密码哈希工具
 * 用 Node 原生 scrypt:无外部依赖, 防彩虹表(随机 salt), 抗时序攻击(timingSafeEqual)
 *
 * 存储格式:`scrypt$<salt-hex>$<hash-hex>`(单字段定长 vbarchar 即可)
 */

const SCRYPT_N = 16384; // CPU/memory cost; 默认即可
const SCRYPT_KEYLEN = 64;
const SALT_BYTES = 16;

export function hashPassword(plain: string): string {
  if (!plain || plain.length < 6) {
    throw new Error('密码至少 6 位');
  }
  const salt = randomBytes(SALT_BYTES).toString('hex');
  const hash = scryptSync(plain, salt, SCRYPT_KEYLEN, { N: SCRYPT_N }).toString('hex');
  return `scrypt$${salt}$${hash}`;
}

export function verifyPassword(plain: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const [scheme, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !salt || !hash) return false;
  try {
    const candidate = scryptSync(plain, salt, SCRYPT_KEYLEN, { N: SCRYPT_N });
    const stored_buf = Buffer.from(hash, 'hex');
    if (stored_buf.length !== candidate.length) return false;
    return timingSafeEqual(stored_buf, candidate);
  } catch {
    return false;
  }
}
