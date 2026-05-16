import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';

import {
  BusinessException,
  NotFoundBusinessException,
} from '../../../common/exceptions/business.exception';
import { ERROR_CODES } from '../../../common/constants/error-codes';
import { PrismaService } from '../../../infra/prisma/prisma.service';

import type { UpdateConfigDto } from '../dto/admin-config.dto';
import { AdminLogService } from './admin-log.service';

export interface SystemConfigView {
  key: string;
  value: unknown;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
  /** 是否敏感字段(被脱敏);前端用于隐藏明文 */
  is_secret?: boolean;
}

/**
 * 判定一个配置 key 是否属于敏感凭证(API Key / Secret / Token / Password)。
 * 命中后:
 *  - listAll 返回时把 value 替换成 `••••••••<last4>`(留尾 4 位辅助分辨)
 *  - update 时若传入的 value 全部为 `•` 或与脱敏字串等同, 视为"未修改", 不覆盖 DB
 *  - adminLog meta 永远写 `[redacted]`
 */
function isSecretKey(keyName: string): boolean {
  const k = keyName.toLowerCase();
  return (
    k.includes('api_key') ||
    k.includes('apikey') ||
    k.includes('_secret') ||
    k.includes('password') ||
    k.endsWith('_token')
  );
}

const MASK_BULLET = '•';

function maskSecret(value: unknown): string {
  if (typeof value !== 'string' || value.length === 0) return '';
  const last4 = value.length >= 4 ? value.slice(-4) : '';
  return `${MASK_BULLET.repeat(8)}${last4}`;
}

/**
 * 判断传入值是否是脱敏占位(全 `•` 或前 8 个 `•` 加 ≤ 4 位明文尾)。
 * 命中说明前端只是把"已有的脱敏值"原样回传, 不应覆盖 DB。
 */
function looksLikeMaskedValue(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (value.length === 0) return false;
  if (!value.startsWith(MASK_BULLET)) return false;
  // 全 • 或 ••••••••+尾巴
  return /^•+[a-zA-Z0-9\-_=+/]{0,8}$/.test(value);
}

@Injectable()
export class AdminConfigService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminLog: AdminLogService,
  ) {}

  async listAll(): Promise<SystemConfigView[]> {
    const rows = await this.prisma.systemConfig.findMany({
      orderBy: { keyName: 'asc' },
    });
    return rows.map((c) => {
      const secret = isSecretKey(c.keyName);
      return {
        key: c.keyName,
        // 敏感字段一律返回脱敏字符串, 即使 DB 里是 object 类型也强制 mask
        value: secret ? maskSecret(c.value as unknown) : c.value,
        description: c.description,
        updated_by: c.updatedBy ? c.updatedBy.toString() : null,
        updated_at: c.updatedAt.toISOString(),
        is_secret: secret,
      };
    });
  }

  async update(adminId: bigint, keyName: string, dto: UpdateConfigDto): Promise<SystemConfigView> {
    const existing = await this.prisma.systemConfig.findUnique({ where: { keyName } });
    if (!existing) {
      throw new NotFoundBusinessException(`config[${keyName}] 不存在, 请先在 seed 中预置`);
    }

    const secret = isSecretKey(keyName);

    // 敏感字段保护:前端回传的"脱敏占位"不允许写库, 避免把真 Key 覆盖成 ••••••••xxxx
    if (secret && looksLikeMaskedValue(dto.value)) {
      throw new BusinessException(
        ERROR_CODES.PARAM_INVALID,
        `${keyName} 收到脱敏占位值, 已拒绝覆盖. 请输入完整的新值或留空清除`,
      );
    }

    const updated = await this.prisma.systemConfig.update({
      where: { keyName },
      data: {
        value: dto.value as Prisma.InputJsonValue,
        description: dto.description ?? existing.description,
        updatedBy: adminId,
      },
    });

    await this.adminLog.record({
      adminId,
      action: 'config.update',
      targetType: 'system_config',
      targetId: null,
      meta: secret
        ? { key: keyName, value: '[redacted]' }
        : { key: keyName, value: dto.value as Prisma.InputJsonValue },
    });

    return {
      key: updated.keyName,
      value: secret ? maskSecret(updated.value as unknown) : updated.value,
      description: updated.description,
      updated_by: updated.updatedBy ? updated.updatedBy.toString() : null,
      updated_at: updated.updatedAt.toISOString(),
      is_secret: secret,
    };
  }
}
