/**
 * 分享配置工具
 *
 * 03-API §11 / PRD §4.6.2: 小程序卡片转发, 标题 + 封面。
 * MVP 仅实现「转发好友/群」, 海报与邀请奖励 V2。
 */

export interface ShareConfig {
  title: string;
  path: string;
  imageUrl?: string;
}

export function buildPaperShare(opts: {
  paperId: string;
  bookTitle?: string | null;
  accuracy?: number;
}): ShareConfig {
  const acc = opts.accuracy != null ? `,正确率 ${Math.round(opts.accuracy * 100)}%` : '';
  const book = opts.bookTitle ? `《${opts.bookTitle}》` : '一本书';
  return {
    title: `我做完了${book}的 AI 测验${acc}`,
    path: `/pages/paper-result/index?paperId=${encodeURIComponent(opts.paperId)}&from=share`,
  };
}

export function buildBookShare(opts: { bookId: string; title: string }): ShareConfig {
  return {
    title: `${opts.title} - 考题魔盒`,
    path: `/pages/book-detail/index?bookId=${encodeURIComponent(opts.bookId)}&from=share`,
  };
}

export function defaultShare(): ShareConfig {
  return {
    title: '考题魔盒 · 让 AI 帮你出一套题',
    path: '/pages/home/index?from=share',
  };
}
