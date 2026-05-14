import { Injectable } from '@nestjs/common';

import { PrismaService } from '../prisma/prisma.service';

import type { LlmRuntimeDto } from './ai-service.types';

const CONFIG_KEYS = [
  'current_llm_primary',
  'current_llm_backup',
  'llm_deepseek_api_key',
  'llm_qwen_api_key',
  'llm_glm_api_key',
  'llm_deepseek_base_url',
  'llm_qwen_base_url',
  'llm_glm_base_url',
] as const;

/**
 * 从 system_config 组装发往 ai-service 的 LLM 运行时参数(API Key 可明文存库,与 .env 互补)
 */
@Injectable()
export class LlmRuntimeService {
  constructor(private readonly prisma: PrismaService) {}

  async buildForAiCall(): Promise<LlmRuntimeDto> {
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
      primary_model: str('current_llm_primary') ?? 'deepseek-chat',
      backup_model: str('current_llm_backup') ?? 'qwen-plus',
      deepseek_api_key: str('llm_deepseek_api_key'),
      qwen_api_key: str('llm_qwen_api_key'),
      glm_api_key: str('llm_glm_api_key'),
      deepseek_base_url: str('llm_deepseek_base_url'),
      qwen_base_url: str('llm_qwen_base_url'),
      glm_base_url: str('llm_glm_base_url'),
    };
  }
}
