import { Body, Controller, Get, HttpCode, HttpStatus, Param, Post, Query } from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { Roles } from '../../common/decorators/roles.decorator';
import type { JwtPayload } from '../../common/types/auth.types';

import { SetAdminCredentialDto } from '../auth/dto/admin-login.dto';

import { BanUserDto, ListAdminUsersQuery } from './dto/admin-user.dto';
import { AdminUserService } from './services/admin-user.service';

/**
 * 用户管理(admin)
 * 文档:03-API §12.4 / §12.5
 *
 * promote / demote 仅 super_admin 可用
 */
@Controller('admin/users')
@Roles('admin', 'super_admin')
export class AdminUserController {
  constructor(private readonly service: AdminUserService) {}

  @Get()
  async list(@Query() query: ListAdminUsersQuery) {
    return this.service.list(query);
  }

  @Get(':id')
  async detail(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.service.detail(id);
  }

  @Post(':id/ban')
  @HttpCode(HttpStatus.OK)
  async ban(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: BanUserDto,
  ) {
    return this.service.ban(BigInt(user.sub), id, dto);
  }

  @Post(':id/unban')
  @HttpCode(HttpStatus.OK)
  async unban(@CurrentUser() user: JwtPayload, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.service.unban(BigInt(user.sub), id);
  }

  @Post(':id/promote')
  @Roles('super_admin')
  @HttpCode(HttpStatus.OK)
  async promote(@CurrentUser() user: JwtPayload, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.service.promoteToAdmin(BigInt(user.sub), id);
  }

  @Post(':id/demote')
  @Roles('super_admin')
  @HttpCode(HttpStatus.OK)
  async demote(@CurrentUser() user: JwtPayload, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.service.demoteToUser(BigInt(user.sub), id);
  }

  /** 超管给某个 admin/super_admin 设置后台账号密码 */
  @Post(':id/credential')
  @Roles('super_admin')
  @HttpCode(HttpStatus.OK)
  async setCredential(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: SetAdminCredentialDto,
  ) {
    return this.service.setCredential(BigInt(user.sub), id, dto);
  }
}
