import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import { Roles } from '../../common/decorators/roles.decorator';
import type { JwtPayload } from '../../common/types/auth.types';

import {
  CreateBookDto,
  ImportChaptersDto,
  ListAdminBooksQuery,
  UpdateBookDto,
} from './dto/admin-book.dto';
import { AdminBookService } from './services/admin-book.service';

@Controller('admin/books')
@Roles('admin', 'super_admin')
export class AdminBookController {
  constructor(private readonly service: AdminBookService) {}

  @Get()
  async list(@Query() query: ListAdminBooksQuery) {
    return this.service.list(query);
  }

  @Get(':id')
  async detail(@Param('id', ParseBigIntPipe) id: bigint) {
    return this.service.detail(id);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async create(@CurrentUser() user: JwtPayload, @Body() dto: CreateBookDto) {
    return this.service.create(BigInt(user.sub), dto);
  }

  @Patch(':id')
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: UpdateBookDto,
  ) {
    return this.service.update(BigInt(user.sub), id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@CurrentUser() user: JwtPayload, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.service.softDelete(BigInt(user.sub), id);
  }

  @Post(':id/recommend')
  @HttpCode(HttpStatus.OK)
  async recommend(@CurrentUser() user: JwtPayload, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.service.setRecommend(BigInt(user.sub), id, true);
  }

  @Post(':id/unrecommend')
  @HttpCode(HttpStatus.OK)
  async unrecommend(@CurrentUser() user: JwtPayload, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.service.setRecommend(BigInt(user.sub), id, false);
  }

  @Post(':id/online')
  @HttpCode(HttpStatus.OK)
  async online(@CurrentUser() user: JwtPayload, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.service.setStatus(BigInt(user.sub), id, 1);
  }

  @Post(':id/offline')
  @HttpCode(HttpStatus.OK)
  async offline(@CurrentUser() user: JwtPayload, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.service.setStatus(BigInt(user.sub), id, 0);
  }

  @Post(':id/chapters')
  @HttpCode(HttpStatus.CREATED)
  async importChapters(
    @CurrentUser() user: JwtPayload,
    @Param('id', ParseBigIntPipe) id: bigint,
    @Body() dto: ImportChaptersDto,
  ) {
    return this.service.importChapters(BigInt(user.sub), id, dto);
  }
}
