import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { type AxiosInstance } from 'axios';

import { sha256 } from '../../../common/utils/sha256';

/**
 * 微信开放平台调用封装
 * 当前 M1 仅实现 jscode2session, 后续 M6 内容安全 / V2 订阅消息扩展
 *
 * Mock 策略(开发环境):
 * - code 以 "mock-" 开头时, 直接返回 mock-openid, 不发真实请求
 *   方便没有真实 AppID 的本地调试
 * - 其他情况一律调真实 API
 */

interface JsCodeSessionResponse {
  openid: string;
  unionid?: string;
  session_key: string;
}

interface WeChatErrorResponse {
  errcode: number;
  errmsg: string;
}

@Injectable()
export class WechatService {
  private readonly logger = new Logger(WechatService.name);
  private readonly appId: string;
  private readonly appSecret: string;
  private readonly isProd: boolean;
  private readonly http: AxiosInstance;

  private readonly devMockEnabled: boolean;

  constructor(private readonly configService: ConfigService) {
    this.appId = configService.get<string>('WECHAT_APPID', '');
    this.appSecret = configService.get<string>('WECHAT_SECRET', '');
    this.isProd = configService.get<string>('NODE_ENV') === 'production';
    // 与 auth.service.deriveDevRole 双开关保持一致:
    // 必须显式 ENABLE_DEV_MOCK=true 且非 production 才走 mock 路径,
    // 防止 staging/preview 漏掉 NODE_ENV 时被任意人 mock 登录。
    this.devMockEnabled = !this.isProd && configService.get<string>('ENABLE_DEV_MOCK') === 'true';

    this.http = axios.create({
      baseURL: 'https://api.weixin.qq.com',
      timeout: 8000,
    });
  }

  /**
   * 用临时 code 换 openid + unionid + session_key
   * 文档:https://developers.weixin.qq.com/miniprogram/dev/api-backend/open-api/login/auth.code2Session.html
   *
   * @returns 成功返回 openid 等信息;失败抛 Error
   */
  async code2session(code: string): Promise<JsCodeSessionResponse> {
    if (this.devMockEnabled && code.startsWith('mock-')) {
      return this.mockResponse(code);
    }

    if (!this.appId || !this.appSecret) {
      throw new Error('微信 AppID/Secret 未配置, 无法调用 jscode2session');
    }

    const { data } = await this.http.get<JsCodeSessionResponse | WeChatErrorResponse>(
      '/sns/jscode2session',
      {
        params: {
          appid: this.appId,
          secret: this.appSecret,
          js_code: code,
          grant_type: 'authorization_code',
        },
      },
    );

    if ('errcode' in data && data.errcode !== 0) {
      this.logger.warn(`jscode2session 失败 errcode=${data.errcode} errmsg=${data.errmsg}`);
      throw new Error(`微信登录失败: ${data.errmsg}`);
    }

    const ok = data as JsCodeSessionResponse;
    if (!ok.openid) {
      throw new Error('微信返回数据缺少 openid');
    }

    return ok;
  }

  /**
   * 开发模式 mock 响应
   * 同一个 code 始终返回同一个 openid(基于 hash), 方便测试用户复登
   */
  private mockResponse(code: string): JsCodeSessionResponse {
    const tail = sha256(code).slice(0, 24);
    return {
      openid: `mock-openid-${tail}`,
      unionid: undefined,
      session_key: `mock-sk-${tail}`,
    };
  }
}
