import { Injectable } from '@nestjs/common';
import { type Prisma, type User, UserRole } from '@prisma/client';

import {
  BusinessException,
  NotFoundBusinessException,
} from '../../../common/exceptions/business.exception';
import { ERROR_CODES } from '../../../common/constants/error-codes';
import { maskOpenid } from '../../../common/utils/mask';
import { hashPassword } from '../../../common/utils/password';
import { PrismaService } from '../../../infra/prisma/prisma.service';

import type { SetAdminCredentialDto } from '../../auth/dto/admin-login.dto';
import type { BanUserDto, ListAdminUsersQuery } from '../dto/admin-user.dto';

import { AdminLogService } from './admin-log.service';

export interface AdminUserView {
  id: string;
  openid_masked: string;
  nickname: string | null;
  avatar_url: string | null;
  role: UserRole;
  status: number;
  is_minor: number;
  minor_mode_enabled: number;
  privacy_version: string | null;
  privacy_agreed_at: string | null;
  last_login_at: string | null;
  created_at: string;
  deleted_at: string | null;
}

@Injectable()
export class AdminUserService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly adminLog: AdminLogService,
  ) {}

  async list(query: ListAdminUsersQuery): Promise<{
    list: AdminUserView[];
    pagination: { page: number; page_size: number; total: number };
  }> {
    const where: Prisma.UserWhereInput = {};
    if (query.status === undefined || query.status === 'all') {
      // 默认含正常 + 封禁, 不含已注销
      where.status = { in: [0, 1] };
    } else {
      where.status = parseInt(query.status, 10);
    }
    if (query.role && query.role !== 'all') where.role = query.role;
    if (query.keyword && query.keyword.trim().length > 0) {
      const kw = query.keyword.trim();
      where.OR = [
        { nickname: { contains: kw } },
        { openid: { contains: kw } },
        { unionid: { contains: kw } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.user.count({ where }),
      this.prisma.user.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (query.page - 1) * query.page_size,
        take: query.page_size,
      }),
    ]);

    return {
      list: rows.map((u) => this.toView(u)),
      pagination: { page: query.page, page_size: query.page_size, total },
    };
  }

  async detail(userId: bigint): Promise<
    AdminUserView & {
      stats: {
        papers: number;
        answers: number;
        mistakes_active: number;
        last_paper_at: string | null;
      };
    }
  > {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundBusinessException('用户不存在');

    const [papers, answers, mistakesActive, lastPaper] = await this.prisma.$transaction([
      this.prisma.paper.count({ where: { userId } }),
      this.prisma.answer.count({ where: { userId } }),
      this.prisma.mistake.count({ where: { userId, status: 'active' } }),
      this.prisma.paper.findFirst({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      }),
    ]);

    return {
      ...this.toView(user),
      stats: {
        papers,
        answers,
        mistakes_active: mistakesActive,
        last_paper_at: lastPaper ? lastPaper.createdAt.toISOString() : null,
      },
    };
  }

  async ban(adminId: bigint, userId: bigint, dto: BanUserDto): Promise<AdminUserView> {
    const user = await this.findOrThrow(userId);
    if (user.role !== UserRole.user) {
      throw new BusinessException(ERROR_CODES.PARAM_INVALID, '不能直接封禁管理员账户, 请先 demote');
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status: 0 },
    });
    await this.adminLog.record({
      adminId,
      action: 'user.ban',
      targetType: 'user',
      targetId: userId,
      meta: { reason: dto.reason ?? null, duration_days: dto.duration_days ?? 0 },
    });
    return this.toView(updated);
  }

  async unban(adminId: bigint, userId: bigint): Promise<AdminUserView> {
    await this.findOrThrow(userId);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { status: 1 },
    });
    await this.adminLog.record({
      adminId,
      action: 'user.unban',
      targetType: 'user',
      targetId: userId,
    });
    return this.toView(updated);
  }

  async promoteToAdmin(adminId: bigint, userId: bigint): Promise<AdminUserView> {
    await this.findOrThrow(userId);
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role: UserRole.admin },
    });
    await this.adminLog.record({
      adminId,
      action: 'user.promote',
      targetType: 'user',
      targetId: userId,
    });
    return this.toView(updated);
  }

  async demoteToUser(adminId: bigint, userId: bigint): Promise<AdminUserView> {
    const user = await this.findOrThrow(userId);
    if (user.role === UserRole.super_admin) {
      throw new BusinessException(ERROR_CODES.PARAM_INVALID, '不能 demote super_admin');
    }
    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: { role: UserRole.user },
    });
    await this.adminLog.record({
      adminId,
      action: 'user.demote',
      targetType: 'user',
      targetId: userId,
    });
    return this.toView(updated);
  }

  /**
   * super_admin 给某个 admin / super_admin 账号设置(或重置)用户名密码
   * - 仅能给 admin / super_admin 设;普通用户不能开后台账号
   * - 目标账号必须存在且 status=1
   * - username 唯一
   */
  async setCredential(
    operatorId: bigint,
    userId: bigint,
    dto: SetAdminCredentialDto,
  ): Promise<AdminUserView> {
    const target = await this.findOrThrow(userId);
    if (target.role !== UserRole.admin && target.role !== UserRole.super_admin) {
      throw new BusinessException(
        ERROR_CODES.PARAM_INVALID,
        '只能给 admin / super_admin 设置后台账号密码;请先 promote',
      );
    }
    if (target.status !== 1) {
      throw new BusinessException(ERROR_CODES.USER_BANNED, '该账号当前不可用');
    }

    const username = dto.username.trim();
    if (!/^[A-Za-z0-9_-]{2,64}$/.test(username)) {
      throw new BusinessException(
        ERROR_CODES.PARAM_INVALID,
        '账号仅支持字母 / 数字 / _ / -, 长度 2~64',
      );
    }

    // 同名占位检查
    const dup = await this.prisma.user.findUnique({ where: { username } });
    if (dup && dup.id !== target.id) {
      throw new BusinessException(ERROR_CODES.PARAM_INVALID, `账号 ${username} 已被占用`);
    }

    const updated = await this.prisma.user.update({
      where: { id: target.id },
      data: {
        username,
        passwordHash: hashPassword(dto.password),
      },
    });

    await this.adminLog.record({
      adminId: operatorId,
      action: 'user.set_credential',
      targetType: 'user',
      targetId: userId,
      meta: { username },
    });

    return this.toView(updated);
  }

  // ===== 内部 =====

  private async findOrThrow(userId: bigint): Promise<User> {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundBusinessException('用户不存在');
    return user;
  }

  private toView(u: User): AdminUserView {
    return {
      id: u.id.toString(),
      openid_masked: maskOpenid(u.openid),
      nickname: u.nickname,
      avatar_url: u.avatarUrl,
      role: u.role,
      status: u.status,
      is_minor: u.isMinor,
      minor_mode_enabled: u.minorModeEnabled,
      privacy_version: u.privacyVersion,
      privacy_agreed_at: u.privacyAgreedAt ? u.privacyAgreedAt.toISOString() : null,
      last_login_at: u.lastLoginAt ? u.lastLoginAt.toISOString() : null,
      created_at: u.createdAt.toISOString(),
      deleted_at: u.deletedAt ? u.deletedAt.toISOString() : null,
    };
  }
}
