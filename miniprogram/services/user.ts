/**
 * 用户接口
 *
 * 03-API §3
 */

import { http } from './http';
import type { FeedbackRequest, MeResponse, UpdateProfileRequest } from '../types/api';

export const userService = {
  getMe(): Promise<MeResponse> {
    return http.get<MeResponse>('/user/me');
  },

  updateMe(body: UpdateProfileRequest): Promise<MeResponse> {
    return http.patch<MeResponse>('/user/me', body);
  },

  feedback(body: FeedbackRequest): Promise<{ id: string }> {
    return http.post<{ id: string }>('/feedback', body);
  },
};
