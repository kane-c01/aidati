/**
 * 隐私政策页(独立页面, 满足《个人信息保护法》对"明示、完整、易读"的要求)
 *
 * 当前版本: v1.0
 * 上线前请由法务/律师审定下方正文; 任何文字修改都需同时升 backend system_config.privacy_version
 * 否则用户不会被强制重新弹窗确认。
 */
import { env } from '../../../config/env';

Page({
  data: {
    version: env.PRIVACY_VERSION,
    updatedAt: '2026-05-16',
  },
});
