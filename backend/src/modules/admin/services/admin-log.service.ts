import { Injectable } from '@nestjs/common';
import { type Prisma } from '@prisma/client';

import { PrismaService } from '../../../infra/prisma/prisma.service';

export interface AdminLogInput {
  adminId: bigint;
  action: string;
  targetType: string;
  targetId?: bigint | null;
  meta?: Prisma.InputJsonValue | null;
  ip?: string | null;
}

/**
 * 管理员操作流水
 * 文档:02-数据库 §3.12 / 03-API §1.7(审计)
 *
 * 所有「写动作」(book.publish / user.ban / config.update 等)都必须落库, 便于回溯
 */
@Injectable()
export class AdminLogService {
  constructor(private readonly prisma: PrismaService) {}

  async record(args: AdminLogInput): Promise<void> {
    await this.prisma.adminLog.create({
      data: {
        adminId: args.adminId,
        action: args.action,
        targetType: args.targetType,
        targetId: args.targetId ?? null,
        meta: args.meta ?? undefined,
        ip: args.ip ?? null,
      },
    });
  }
}
