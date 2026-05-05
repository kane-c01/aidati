import type { Book } from '../../types/domain';

Component({
  options: { addGlobalClass: true },
  properties: {
    book: {
      type: Object,
      value: null as Book | null,
    },
  },
  data: {
    tagList: [] as string[],
  },
  observers: {
    book(book: Book | null) {
      if (!book) {
        this.setData({ tagList: [] });
        return;
      }
      const list: string[] = [];
      if (book.is_recommended) list.push('推荐');
      if (book.tags && Array.isArray(book.tags)) list.push(...book.tags.slice(0, 2));
      this.setData({ tagList: list });
    },
  },
  methods: {
    onTap() {
      const book = this.properties.book as Book | null;
      if (!book) return;
      this.triggerEvent('tap', { id: book.id, book });
    },
  },
});
