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
 * 仅 develop 生效: 后端基础地址的主机部分(不含端口)。
 *
 * - 只在开发者工具里跑: `localhost`
 * - 真机扫「预览」二维码: **必须改成电脑的局域网 IPv4**(如 `192.168.1.8`), 扫完码点一次「编译」再试;
 *   手机里 `localhost` 指向手机自己, 请求不到你电脑上的 Nest。
 * - 电脑与手机需同一 Wi‑Fi; 本仓库后端默认 `HOST=0.0.0.0` 已可局域网访问。
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
    API_BASE: `http://${DEV_API_HOST}:3000/v1`,
    PRIVACY_VERSION: 'v1.0',
    CLIENT_VERSION: '1.0.0-dev',
    DEBUG: true,
  },
  trial: {
    // 体验版必须能验真实微信登录与真实合规审核, DEBUG=false → 不再走 mock-code 后门
    API_BASE: 'https://api-test.yourdomain.com/v1',
    PRIVACY_VERSION: 'v1.0',
    CLIENT_VERSION: '1.0.0-trial',
    DEBUG: false,
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
