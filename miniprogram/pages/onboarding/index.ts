/**
 * U02 引导页(3 屏 swiper)
 *
 * 完成引导后写 storage[ONBOARDING_DONE]=true, 跳转 home
 */

import { STORAGE_KEYS } from '../../config/constants';
import { setStorage } from '../../utils/storage';
import { track } from '../../utils/tracker';

interface Slide {
  key: string;
  emoji: string;
  title: string;
  desc: string;
}

const SLIDES: Slide[] = [
  {
    key: 'photo',
    emoji: '📷',
    title: '随手一拍, AI 帮你出题',
    desc: '连拍最多 20 页, OCR 自动识别',
  },
  {
    key: 'library',
    emoji: '📚',
    title: '书库一搜, 即学即测',
    desc: '覆盖文学、考试、教材等常见品类',
  },
  {
    key: 'mistake',
    emoji: '🎯',
    title: 'AI 智能批改, 错题自动收录',
    desc: '不只对错, 告诉你为什么错',
  },
];

Page({
  data: {
    slides: SLIDES,
    current: 0,
  },

  onChange(e: WechatMiniprogram.SwiperChange) {
    this.setData({ current: e.detail.current });
  },

  onNext() {
    if (this.data.current < SLIDES.length - 1) {
      this.setData({ current: this.data.current + 1 });
    }
  },

  onSkip() {
    track('onboarding_skip', { from: this.data.current });
    this.finish();
  },

  onStart() {
    track('onboarding_finish');
    this.finish();
  },

  finish(): void {
    setStorage(STORAGE_KEYS.ONBOARDING_DONE, true);
    wx.reLaunch({ url: '/pages/home/index' });
  },
});
