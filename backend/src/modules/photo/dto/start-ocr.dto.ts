import { IsIn, IsOptional } from 'class-validator';

export type OcrMode = 'wechat' | 'tencent' | 'mock';

/**
 * POST /v1/photo-sets/{id}/ocr
 *
 * MVP 主路径:`mode=wechat` — 客户端用微信 OCR 自行识别每张图, 然后用
 *   PATCH /v1/photo-sets/{id}/ocr 把结果回写给后端
 *
 * 服务端兜底:`mode=tencent` — 走 ai-service / 腾讯云 OCR(M2 后期或 M3 接)
 *
 * 调试便利:`mode=mock` — 直接把 ocr_text 设为占位文本, 立刻把 photo_set 状态置 done
 */
export class StartOcrDto {
  @IsOptional()
  @IsIn(['wechat', 'tencent', 'mock'])
  mode?: OcrMode;
}
