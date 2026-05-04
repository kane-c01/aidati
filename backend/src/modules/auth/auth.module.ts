import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';

import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { TokenService } from './services/token.service';
import { WechatService } from './services/wechat.service';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
  imports: [
    ConfigModule,
    PassportModule,
    // JwtModule 仅用于注入 JwtService(签发与校验由 TokenService 自己控制 secret)
    JwtModule.register({}),
  ],
  controllers: [AuthController],
  providers: [AuthService, TokenService, WechatService, JwtStrategy],
  exports: [AuthService, TokenService],
})
export class AuthModule {}
