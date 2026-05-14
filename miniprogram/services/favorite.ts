/**
 * 收藏接口
 *
 * 03-API §四-bis(M9 后追加)
 */

import { http } from './http';
import type {
  AddFavoriteRequest,
  AddFavoriteResponse,
  FavoriteListQuery,
  FavoriteListResponse,
} from '../types/api';

export const favoriteService = {
  list(query: FavoriteListQuery = {}): Promise<FavoriteListResponse> {
    return http.get<FavoriteListResponse>('/favorites', {
      page: query.page,
      page_size: query.page_size,
    });
  },

  add(bookId: string): Promise<AddFavoriteResponse> {
    const body: AddFavoriteRequest = { book_id: bookId };
    return http.post<AddFavoriteResponse>('/favorites', body);
  },

  remove(bookId: string): Promise<{ ok: true }> {
    return http.del<{ ok: true }>(`/favorites/${encodeURIComponent(bookId)}`);
  },
};
