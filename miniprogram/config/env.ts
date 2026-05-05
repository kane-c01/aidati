/**
 * 环境配置
 *
 * 小程序原生不支持 .env, 这里按 envVersion 切换:
 * - develop:  开发版(微信开发者工具点「编译」时)
 * - trial:    体验版(上传后微信后台开通)
 * - release:  正式版(线上)
 *
 * 实际域名走真实备案后填回此处, **业务域名 / Web 业务域名** 还要在小程序后台白名单。
 */

const ACCOUNT = wx.getAccountInfoSync();
const ENV_VERSION = ACCOUNT.miniProgram.envVersion;

interface EnvConfig {
  /** API 基础 URL, 不带末尾斜杠 */
  API_BASE: string;
  /** 当前隐私协议版本(同后端 system_config[privacy_version]) */
  PRIVACY_VERSION: string;
  /** 客户端版本(随发版手动 bump, 用于灰度) */
  CLIENT_VERSION: string;
  /** 是否调试模式(开发版强制 true) */
  DEBUG: boolean;
}

const ENVS: Record<typeof ENV_VERSION, EnvConfig> = {
  develop: {
    API_BASE: 'http://localhost:3000/v1',
    PRIVACY_VERSION: 'v1.0',
    CLIENT_VERSION: '1.0.0-dev',
    DEBUG: true,
  },
  trial: {
    API_BASE: 'https://api-test.yourdomain.com/v1',
    PRIVACY_VERSION: 'v1.0',
    CLIENT_VERSION: '1.0.0-trial',
    DEBUG: true,
  },
  release: {
    API_BASE: 'https://api.yourdomain.com/v1',
    PRIVACY_VERSION: 'v1.0',
    CLIENT_VERSION: '1.0.0',
    DEBUG: false,
  },
};

export const env: EnvConfig = ENVS[ENV_VERSION];

export const ENV_VERSION_LABEL: typeof ENV_VERSION = ENV_VERSION;
