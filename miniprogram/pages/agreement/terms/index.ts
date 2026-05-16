/**
 * 用户服务协议页(独立页面)
 *
 * 当前版本: v1.0
 * 任何条款修改都需同时升 backend system_config.terms_version, 否则用户不会被强制重新弹窗确认。
 */
import { env } from '../../../config/env';

Page({
  data: {
    version: env.PRIVACY_VERSION,
    updatedAt: '2026-05-16',
  },
});
