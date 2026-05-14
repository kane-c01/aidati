import { IsIn, IsOptional } from 'class-validator';

export type OcrMode = 'wechat' | 'tencent' | 'mock' | 'vision';

/**
 * POST /v1/photo-sets/{id}/ocr
 *
 * mode=vision — 服务端调 VL 大模型识别每张图, 自动抽取文字/表格/公式(推荐)
 * mode=wechat — 客户端用微信 OCR 自行识别后 PATCH 回写
 * mode=tencent — 腾讯云 OCR(未实现)
 * mode=mock — 占位文本(调试用)
 */
export class StartOcrDto {
  @IsOptional()
  @IsIn(['wechat', 'tencent', 'mock', 'vision'])
  mode?: OcrMode;
}
