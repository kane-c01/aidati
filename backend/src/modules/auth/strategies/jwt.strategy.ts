import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

import { UnauthorizedBusinessException } from '../../../common/exceptions/business.exception';
import type { JwtPayload } from '../../../common/types/auth.types';
import { TokenService } from '../services/token.service';

/**
 * JWT 策略 - 解析 Authorization: Bearer <token>
 * 失败抛 UnauthorizedBusinessException, 由 JwtAuthGuard 转 401 + 20001
 *
 * 校验链:
 * 1. 签名 + 过期(由 passport-jwt 完成)
 * 2. type === 'access'(本策略只接 access_token)
 * 3. jti 未被撤销(Redis 黑名单)
 */
@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy, 'jwt') {
  constructor(
    config: ConfigService,
    private readonly tokenService: TokenService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: config.getOrThrow<string>('JWT_SECRET'),
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    if (payload.type !== 'access') {
      throw new UnauthorizedBusinessException('token 类型不匹配');
    }
    const revoked = await this.tokenService.isAccessRevoked(payload.jti);
    if (revoked) {
      throw new UnauthorizedBusinessException('token 已被撤销');
    }
    return payload;
  }
}
