import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError, type AxiosInstance } from 'axios';

import { ERROR_CODES } from '../../common/constants/error-codes';
import { BusinessException } from '../../common/exceptions/business.exception';

import type {
  GeneratePaperRequestDto,
  GeneratePaperResponseDto,
  GradePaperRequestDto,
  GradePaperResponseDto,
} from './ai-service.types';

/**
 * AI 编排服务客户端
 * 文档:01-技术架构 §3.2 / 03-API §七
 *
 * 业务后端 → ai-service 之间走内部网络 + X-Internal-Token 头鉴权;
 * 生产环境上述应放在 K8s Service / 内网 ALB 后面
 */
@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private readonly http: AxiosInstance;
  private readonly internalToken: string;

  constructor(config: ConfigService) {
    const baseURL = config.getOrThrow<string>('AI_SERVICE_BASE_URL');
    this.internalToken = config.getOrThrow<string>('AI_SERVICE_INTERNAL_TOKEN');
    this.http = axios.create({
      baseURL,
      timeout: 90_000,
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': this.internalToken,
      },
    });
    this.logger.log(`AiService client baseURL=${baseURL}`);
  }

  async generatePaper(req: GeneratePaperRequestDto): Promise<GeneratePaperResponseDto> {
    return this.call<GeneratePaperResponseDto>('/generate-paper', req);
  }

  async gradePaper(req: GradePaperRequestDto): Promise<GradePaperResponseDto> {
    return this.call<GradePaperResponseDto>('/grade-paper', req);
  }

  async health(): Promise<boolean> {
    try {
      const r = await this.http.get('/healthz', { timeout: 3000 });
      return r.status === 200;
    } catch {
      return false;
    }
  }

  // ===== 内部 =====

  private async call<T>(path: string, body: unknown): Promise<T> {
    try {
      const r = await this.http.post<T>(path, body);
      return r.data;
    } catch (err) {
      const ax = err as AxiosError<{ detail?: { code?: number; message?: string } | string }>;
      const status = ax.response?.status;
      const detail = ax.response?.data?.detail;

      // ai-service 返回 503 + code=30002(LLM 全失败)→ 业务侧透传
      if (
        status === 503 &&
        typeof detail === 'object' &&
        detail !== null &&
        detail.code === 30002
      ) {
        throw new BusinessException(ERROR_CODES.LLM_UNAVAILABLE, detail.message ?? 'AI 服务繁忙');
      }

      this.logger.error(
        `ai-service ${path} 调用失败 status=${status} detail=${JSON.stringify(detail)}`,
        ax.stack,
      );
      throw new BusinessException(ERROR_CODES.LLM_UNAVAILABLE, `AI 服务异常: ${ax.message}`);
    }
  }
}
