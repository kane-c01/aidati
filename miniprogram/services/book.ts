/**
 * 书籍接口
 *
 * 03-API §4 + M8 用户上传书
 */

import { http } from './http';
import type {
  BookDetailResponse,
  BookListQuery,
  BookListResponse,
  PaginatedData,
} from '../types/api';
import type { Book } from '../types/domain';

export interface MyBookListItem extends Book {
  chapters_count: number;
  pdf_url: string | null;
  created_at: string;
}

export interface ChapterFull {
  id: string;
  book_id: string;
  book_title: string;
  order_no: number;
  title: string;
  content_full: string;
  content_summary: string | null;
}

export interface UploadBookPayload {
  title: string;
  author?: string;
  description?: string;
  cover_url?: string;
  pdf_url: string;
  max_chapters?: number;
}

export interface PatchBookPayload {
  title?: string;
  author?: string;
  description?: string;
  cover_url?: string;
}

export const bookService = {
  list(query: BookListQuery = {}): Promise<BookListResponse> {
    return http.get<BookListResponse>('/books', {
      keyword: query.keyword,
      page: query.page,
      page_size: query.page_size,
      sort: query.sort,
    });
  },

  detail(id: string): Promise<BookDetailResponse> {
    return http.get<BookDetailResponse>(`/books/${encodeURIComponent(id)}`);
  },

  // ===== 我的书库(M8) =====

  listMine(page = 1, page_size = 20): Promise<PaginatedData<MyBookListItem>> {
    return http.get('/books/mine', { page, page_size });
  },

  /** 上传 PDF 自建书 — 同步抽章, 客户端 timeout 调到 180s */
  upload(body: UploadBookPayload): Promise<BookDetailResponse> {
    return http.post('/books/upload', body, { timeout: 180_000 });
  },

  patchMine(id: string, body: PatchBookPayload): Promise<BookDetailResponse> {
    return http.patch(`/books/${encodeURIComponent(id)}`, body);
  },

  deleteMine(id: string): Promise<{ ok: true }> {
    return http.del(`/books/${encodeURIComponent(id)}`);
  },

  /** 在线阅读:章节正文 */
  chapterFull(chapterId: string): Promise<ChapterFull> {
    return http.get<ChapterFull>(`/chapters/${encodeURIComponent(chapterId)}/full`);
  },

  /** 把拍照集整理成一本"我的书"(M8 PR2.5)*/
  fromPhotoSet(body: {
    photo_set_id: string;
    title: string;
    author?: string;
    description?: string;
    cover_url?: string;
  }): Promise<BookDetailResponse> {
    return http.post('/books/from-photo-set', body, { timeout: 180_000 });
  },
};
