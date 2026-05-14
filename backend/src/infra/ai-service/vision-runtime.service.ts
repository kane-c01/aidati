import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import type { VisionRuntimeDto } from './ai-service.types';

const CONFIG_KEYS = [
  'vision_provider',
  'vision_model',
  'vision_api_key',
  'vision_base_url',
] as const;

/**
 * 从 system_config 组装发往 ai-service 的视觉模型运行时参数
 *
 * 落库 key:
 * - vision_provider:目前仅支持 'qwen_vl'
 * - vision_model:模型名,默认 qwen-vl-max
 * - vision_api_key:DashScope API Key(若空则 ai-service 端 fallback 到 settings.qwen_api_key)
 * - vision_base_url:覆盖 base_url(留空走默认 DashScope 兼容模式)
 */
@Injectable()
export class VisionRuntimeService {
  constructor(private readonly prisma: PrismaService) {}

  async buildForAiCall(): Promise<VisionRuntimeDto> {
    const rows = await this.prisma.systemConfig.findMany({
      where: { keyName: { in: [...CONFIG_KEYS] } },
    });
    const map = new Map(rows.map((r) => [r.keyName, r.value]));

    const str = (key: string): string | undefined => {
      const v = map.get(key);
      if (typeof v === 'string' && v.trim()) return v.trim();
      return undefined;
    };

    return {
      provider: str('vision_provider'),
      model: str('vision_model'),
      api_key: str('vision_api_key'),
      base_url: str('vision_base_url'),
    };
  }
}
