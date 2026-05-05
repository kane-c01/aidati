/**
 * 自定义 TabBar
 *
 * 注:本项目没有走 app.json 的原生 tabBar(避免引入 PNG 资产),
 * 由各「Tab 页」自己 include <custom-tab-bar />, 路由用 wx.reLaunch。
 *
 * 上线前如需切回原生 TabBar:
 *  1) 准备 6 张 PNG 图标(普通 + 高亮 × 3 tab)
 *  2) 在 app.json 加 "tabBar": { custom: false, list: [...] }
 *  3) 删除各 tab 页的 <custom-tab-bar />, 改用 wx.switchTab
 */

import { TAB_PATHS } from '../../config/constants';

type TabKey = 'home' | 'photo' | 'profile';

const KEY_TO_PATH: Record<TabKey, string> = {
  home: TAB_PATHS.HOME,
  photo: TAB_PATHS.PHOTO,
  profile: TAB_PATHS.PROFILE,
};

Component({
  options: { addGlobalClass: true },
  properties: {
    active: {
      type: String,
      value: 'home',
    },
  },
  methods: {
    onTap(e: WechatMiniprogram.BaseEvent) {
      const key = e.currentTarget.dataset.key as TabKey;
      if (key === this.data.active) return;
      const path = KEY_TO_PATH[key];
      if (!path) return;
      wx.reLaunch({ url: path });
    },
  },
});
