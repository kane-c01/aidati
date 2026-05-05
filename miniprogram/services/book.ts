/**
 * 书籍接口
 *
 * 03-API §4
 */

import { http } from './http';
import type {
  BookDetailResponse,
  BookListQuery,
  BookListResponse,
} from '../types/api';

export const bookService = {
  list(query: BookListQuery = {}): Promise<BookListResponse> {
    return http.get<BookListResponse>('/books', {
      keyword: query.keyword,
      category: query.category,
      page: query.page,
      page_size: query.page_size,
      sort: query.sort,
    });
  },

  detail(id: string): Promise<BookDetailResponse> {
    return http.get<BookDetailResponse>(`/books/${encodeURIComponent(id)}`);
  },
};
