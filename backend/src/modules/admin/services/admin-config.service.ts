import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';

import { NotFoundBusinessException } from '../../../common/exceptions/business.exception';
import { PrismaService } from '../../../infra/prisma/prisma.service';

import type { UpdateConfigDto } from '../dto/admin-config.dto';
import { AdminLogService } from './admin-log.service';

export interface SystemConfigView {
  key: string;
  value: unknown;
  description: string | null;
  updated_by: string | null;
  updated_at: string;
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
    return rows.map((c) => ({
      key: c.keyName,
      value: c.value,
      description: c.description,
      updated_by: c.updatedBy ? c.updatedBy.toString() : null,
      updated_at: c.updatedAt.toISOString(),
    }));
  }

  async update(adminId: bigint, keyName: string, dto: UpdateConfigDto): Promise<SystemConfigView> {
    const existing = await this.prisma.systemConfig.findUnique({ where: { keyName } });
    if (!existing) {
      throw new NotFoundBusinessException(`config[${keyName}] 不存在, 请先在 seed 中预置`);
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
      meta: { key: keyName, value: dto.value as Prisma.InputJsonValue },
    });
    return {
      key: updated.keyName,
      value: updated.value,
      description: updated.description,
      updated_by: updated.updatedBy ? updated.updatedBy.toString() : null,
      updated_at: updated.updatedAt.toISOString(),
    };
  }
}
