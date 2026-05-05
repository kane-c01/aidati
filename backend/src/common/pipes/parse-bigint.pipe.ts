import { type ArgumentMetadata, Injectable, type PipeTransform } from '@nestjs/common';

import { BusinessException } from '../exceptions/business.exception';
import { ERROR_CODES } from '../constants/error-codes';

/**
 * 把路径/查询参数中的字符串安全转换成 bigint
 * 配合 03-API §1.6:业务 ID 是 BigInt 字符串
 *
 * 用法:`@Param('id', ParseBigIntPipe) id: bigint`
 */
@Injectable()
export class ParseBigIntPipe implements PipeTransform<string, bigint> {
  transform(value: string, _meta: ArgumentMetadata): bigint {
    if (typeof value !== 'string' || !/^\d+$/.test(value)) {
      throw new BusinessException(
        ERROR_CODES.PARAM_INVALID,
        `参数必须是非负整数字符串, 当前值: ${value}`,
      );
    }
    return BigInt(value);
  }
}
