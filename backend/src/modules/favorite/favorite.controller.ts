import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
} from '@nestjs/common';

import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { ParseBigIntPipe } from '../../common/pipes/parse-bigint.pipe';
import type { JwtPayload } from '../../common/types/auth.types';

import { AddFavoriteDto } from './dto/add-favorite.dto';
import { ListFavoritesQuery } from './dto/list-favorites.query';
import { FavoriteService } from './favorite.service';

/**
 * 收藏(用户 → 书)
 *
 * 接口:
 *  - GET    /v1/favorites               列表(分页)
 *  - POST   /v1/favorites                添加(幂等, body.book_id)
 *  - DELETE /v1/favorites/:bookId        取消(幂等, 不存在也返回 ok)
 */
@Controller('favorites')
export class FavoriteController {
  constructor(private readonly favoriteService: FavoriteService) {}

  @Get()
  async list(@CurrentUser() user: JwtPayload, @Query() query: ListFavoritesQuery) {
    return this.favoriteService.list(BigInt(user.sub), query);
  }

  @Post()
  @HttpCode(HttpStatus.OK)
  async add(@CurrentUser() user: JwtPayload, @Body() dto: AddFavoriteDto) {
    return this.favoriteService.add(BigInt(user.sub), BigInt(dto.book_id));
  }

  @Delete(':bookId')
  @HttpCode(HttpStatus.OK)
  async remove(@CurrentUser() user: JwtPayload, @Param('bookId', ParseBigIntPipe) bookId: bigint) {
    return this.favoriteService.remove(BigInt(user.sub), bookId);
  }
}
