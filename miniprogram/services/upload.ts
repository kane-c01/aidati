/**
 * 上传接口 + 直传 OSS 编排
 *
 * 03-API §5 + 04-前端规范 §3.4
 *
 * 流程:
 *  1) 客户端拿凭证: GET /upload/policy?scene=photo
 *  2) wx.uploadFile 直传 OSS(用 policy.put_url 或 cos-wx-sdk + STS)
 *  3) 拿到对象 URL 后调 POST /photos 绑定
 *
 * 注:本服务只负责 1) + 2);  3) 在 photo.ts 里。
 */

import { http, uploadToOss } from './http';
import type { UploadPolicyResponse, UploadScene } from '../types/api';

export const uploadService = {
  getPolicy(scene: UploadScene): Promise<UploadPolicyResponse> {
    return http.get<UploadPolicyResponse>('/upload/policy', { scene });
  },

  /**
   * 一站式: 拿凭证 + 直传 + 拼回 OSS URL
   * 不带「绑定」步骤, 调用方自己根据 scene 决定如何绑定。
   *
   * 简化策略:
   * - 后端必须下发 put_url(预签 URL)和 image_url(返回最终公网/CDN 地址)
   * - 没有 put_url 时, 此 MVP 直接抛错(让 issue 暴露在调用方, 而不是默默切走 STS SDK)
   */
  async putWithPolicy(filePath: string, scene: UploadScene): Promise<{ url: string }> {
    const policy = await uploadService.getPolicy(scene);
    if (!policy.put_url) {
      throw new Error('当前后端 policy 未下发 put_url(STS SDK 直传待 V2 实现)');
    }
    const result = await uploadToOss({ filePath, putUrl: policy.put_url });
    if (!result.ok) {
      throw new Error(`上传失败 (HTTP ${result.statusCode}): ${result.message ?? ''}`);
    }
    // OSS 直传: PUT 成功后, 由 policy.put_url 中的预签部分剥离 query 即为最终对象 URL
    const url = policy.put_url.split('?')[0];
    return { url };
  },
};
