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

import { ListMistakesQuery } from './dto/list-mistakes.query';
import { PracticeMistakesDto } from './dto/practice-mistakes.dto';
import { MistakeService } from './mistake.service';

/**
 * 错题本控制器
 * 文档:03-API接口文档.md §八
 *
 * - GET    /v1/mistakes                列表(分页+过滤)
 * - POST   /v1/mistakes/:id/master     手动标记掌握(manual_mastered)
 * - POST   /v1/mistakes/:id/unmaster   取消掌握(回到 active)
 * - POST   /v1/mistakes/practice       错题重做生成临时试卷
 * - DELETE /v1/mistakes/:id            删除错题
 */
@Controller('mistakes')
export class MistakeController {
  constructor(private readonly service: MistakeService) {}

  @Get()
  async list(@CurrentUser() user: JwtPayload, @Query() query: ListMistakesQuery) {
    return this.service.listForUser(BigInt(user.sub), query);
  }

  @Post(':id/master')
  @HttpCode(HttpStatus.OK)
  async master(@CurrentUser() user: JwtPayload, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.service.markMastered(BigInt(user.sub), id);
  }

  @Post(':id/unmaster')
  @HttpCode(HttpStatus.OK)
  async unmaster(@CurrentUser() user: JwtPayload, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.service.unmarkMastered(BigInt(user.sub), id);
  }

  @Post('practice')
  @HttpCode(HttpStatus.CREATED)
  async practice(@CurrentUser() user: JwtPayload, @Body() dto: PracticeMistakesDto) {
    return this.service.createPracticePaper(BigInt(user.sub), dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  async remove(@CurrentUser() user: JwtPayload, @Param('id', ParseBigIntPipe) id: bigint) {
    return this.service.deleteOne(BigInt(user.sub), id);
  }
}
