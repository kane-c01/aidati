import { coverToneClass } from '../../utils/cover';
import type { Book } from '../../types/domain';

Component({
  options: { addGlobalClass: true },
  properties: {
    book: {
      type: Object,
      value: null as Book | null,
    },
    /** 是否在封面右上展示收藏星, 默认 true */
    showFavorite: {
      type: Boolean,
      value: true,
    },
    /** 父级控制的"切换中"状态, 用于 disable 按钮 */
    favBusy: {
      type: Boolean,
      value: false,
    },
  },
  data: {
    tagList: [] as string[],
    coverToneClass: '',
  },
  observers: {
    book(book: Book | null) {
      if (!book) {
        this.setData({ tagList: [], coverToneClass: '' });
        return;
      }
      const list: string[] = [];
      if (book.is_recommended) list.push('推荐');
      if (book.tags && Array.isArray(book.tags)) list.push(...book.tags.slice(0, 2));
      this.setData({
        tagList: list,
        coverToneClass: coverToneClass(book.title),
      });
    },
  },
  methods: {
    onTap() {
      const book = this.properties.book as Book | null;
      if (!book) return;
      this.triggerEvent('tap', { id: book.id, book });
    },
    /**
     * 收藏/取消收藏 - 不修改 prop, 让父级根据 book.is_favorited 决定行为并回写
     */
    onFavoriteTap() {
      const book = this.properties.book as Book | null;
      if (!book) return;
      if (this.properties.favBusy) return;
      this.triggerEvent('favoriteTap', {
        id: book.id,
        book,
        currentFavorited: !!book.is_favorited,
      });
    },
  },
});
