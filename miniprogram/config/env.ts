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

/**
 * develop 是否直连线上 API（与 trial/release 同域）。
 * - `true` : 开发者工具 / 预览 / 真机调试都请求 `https://dati.orolink.cn/v1`（需在小程序后台配置 request 合法域名）
 * - `false`: 使用下方 `DEV_API_HOST` 的本地 Nest（如 `http://192.168.x.x:3000/v1`）
 */
const DEVELOP_USE_ONLINE_API = true;

/**
 * 仅 develop 且 `DEVELOP_USE_ONLINE_API === false` 时生效: 本机后端主机(不含端口)。
 * 真机预览勿用 `localhost`，应填电脑局域网 IPv4。
 */
const DEV_API_HOST = 'localhost';

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
    API_BASE: DEVELOP_USE_ONLINE_API
      ? 'https://dati.orolink.cn/v1'
      : `http://${DEV_API_HOST}:3000/v1`,
    PRIVACY_VERSION: 'v1.0',
    CLIENT_VERSION: '1.0.0-dev',
    DEBUG: true,
  },
  trial: {
    // 体验版必须能验真实微信登录与真实合规审核, DEBUG=false → 不再走 mock-code 后门
    // 与线上同域 Nginx 反代 `/v1`；若有独立测试域可改用 https://xxx/v1
    API_BASE: 'https://dati.orolink.cn/v1',
    PRIVACY_VERSION: 'v1.0',
    CLIENT_VERSION: '1.0.0-trial',
    DEBUG: false,
  },
  release: {
    API_BASE: 'https://dati.orolink.cn/v1',
    PRIVACY_VERSION: 'v1.0',
    CLIENT_VERSION: '1.0.0',
    DEBUG: false,
  },
};

export const env: EnvConfig = ENVS[ENV_VERSION];

export const ENV_VERSION_LABEL: typeof ENV_VERSION = ENV_VERSION;
