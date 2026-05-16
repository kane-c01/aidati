import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError, type AxiosInstance } from 'axios';

import { ERROR_CODES } from '../../common/constants/error-codes';
import { BusinessException } from '../../common/exceptions/business.exception';

import type {
  ExtractDocumentReqDto,
  ExtractDocumentResDto,
  GeneratePaperRequestDto,
  GeneratePaperResponseDto,
  GradePaperRequestDto,
  GradePaperResponseDto,
  PdfToImagesReqDto,
  PdfToImagesResDto,
  RecognizeRegionReqDto,
  RecognizeRegionResDto,
  SplitChaptersReqDto,
  SplitChaptersResDto,
} from './ai-service.types';
import { LlmRuntimeService } from './llm-runtime.service';
import { VisionRuntimeService } from './vision-runtime.service';

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

  constructor(
    config: ConfigService,
    private readonly llmRuntime: LlmRuntimeService,
    private readonly visionRuntime: VisionRuntimeService,
  ) {
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
    const llm_runtime = await this.llmRuntime.buildForAiCall();
    return this.call<GeneratePaperResponseDto>('/generate-paper', { ...req, llm_runtime });
  }

  async gradePaper(req: GradePaperRequestDto): Promise<GradePaperResponseDto> {
    const llm_runtime = await this.llmRuntime.buildForAiCall();
    return this.call<GradePaperResponseDto>('/grade-paper', { ...req, llm_runtime });
  }

  /** 整图 / PDF 单页 → Markdown(M8) */
  async extractDocument(req: ExtractDocumentReqDto): Promise<ExtractDocumentResDto> {
    const vision_runtime = await this.visionRuntime.buildForAiCall();
    return this.call<ExtractDocumentResDto>('/v1/extract/document', {
      ...req,
      vision_runtime,
    });
  }

  /** 单区域识别(框选 OCR / 公式 / 表格 / 图表)(M8) */
  async recognizeRegion(req: RecognizeRegionReqDto): Promise<RecognizeRegionResDto> {
    const vision_runtime = await this.visionRuntime.buildForAiCall();
    return this.call<RecognizeRegionResDto>('/v1/extract/region', {
      ...req,
      vision_runtime,
    });
  }

  /** 整篇 markdown → 结构化章节(M8,LLM 切章) */
  async splitChapters(req: SplitChaptersReqDto): Promise<SplitChaptersResDto> {
    const llm_runtime = await this.llmRuntime.buildForAiCall();
    return this.call<SplitChaptersResDto>('/v1/extract/split-chapters', {
      ...req,
      llm_runtime,
    });
  }

  /**
   * PDF → 多页 PNG(M8 PR2.6,纯本地 fitz, 不调 LLM)
   *
   * 注:返回包内每页都是 base64-PNG, 50 页 ~25MB → 调用方应注意:
   *  - 单进程内存占用约 50-80MB
   *  - axios 默认 maxContentLength=∞, 这里用 200MB 安全闸
   *  - timeout 拉到 5 分钟(扫描版 200 页约 2 分钟)
   */
  async pdfToImages(req: PdfToImagesReqDto): Promise<PdfToImagesResDto> {
    return this.call<PdfToImagesResDto>('/v1/extract/pdf-to-images', req, {
      timeout: 300_000,
      maxContentLength: 200 * 1024 * 1024,
      maxBodyLength: 200 * 1024 * 1024,
    });
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

  private async call<T>(
    path: string,
    body: unknown,
    overrides?: { timeout?: number; maxContentLength?: number; maxBodyLength?: number },
  ): Promise<T> {
    try {
      const r = await this.http.post<T>(path, body, overrides);
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
