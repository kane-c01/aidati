import { Injectable, Logger } from '@nestjs/common';
import { ModerationScene, type Photo, type PhotoSet, OcrStatus, Prisma } from '@prisma/client';

import { ERROR_CODES } from '../../common/constants/error-codes';
import {
  BusinessException,
  NotFoundBusinessException,
} from '../../common/exceptions/business.exception';
import { AiService } from '../../infra/ai-service/ai-service.service';
import { StorageService } from '../../infra/storage/storage.service';
import { PrismaService } from '../../infra/prisma/prisma.service';
import { ModerationService } from '../moderation/moderation.service';

import type { BindPhotoDto } from './dto/bind-photo.dto';
import type { CreatePhotoSetFromPdfDto } from './dto/create-set-from-pdf.dto';
import type { OcrMode } from './dto/start-ocr.dto';
import type { UpdateOcrDto } from './dto/update-ocr.dto';
import type { UpdatePhotoDto } from './dto/update-photo.dto';
import type { ReorderPhotosDto } from './dto/reorder-photos.dto';

/** photo_set 默认 7 天 TTL,见 02-数据库设计 §3.4 */
const PHOTO_SET_TTL_MS = 7 * 24 * 3600 * 1000;
const DEFAULT_MAX_PHOTOS = 20;
/** 与自建书绑定的 photo_set, expires_at 推到 +50 年, 不被定时清理任务命中 */
const PHOTO_SET_BOOK_TTL_MS = 50 * 365 * 24 * 3600 * 1000;
/**
 * runVisionOcr 单批并发数。
 * - DashScope qwen-vl QPS 较保守,单租户 RPM ~30,4 路并发 ≈ 24 RPM 在阈下
 * - 单张 5-15s, 4 路并发可把 5 张图从 ~50s 降到 ~15s, 10 张从 ~120s 降到 ~30s
 * - 若以后切换更大的配额(或自建推理)可上调
 */
const VISION_OCR_CONCURRENCY = 4;

export interface PhotoRegionView {
  id: string;
  bbox: [number, number, number, number];
  coord: 'normalized' | 'pixel';
  kind: 'text' | 'chart' | 'formula' | 'table';
  ocr_text?: string | null;
  chart_data?: Record<string, unknown> | null;
  corrected: number;
  note?: string | null;
}

export interface PhotoView {
  id: string;
  photo_set_id: string;
  order_no: number;
  image_url: string;
  ocr_text: string | null;
  ocr_corrected: number;
  regions: PhotoRegionView[];
  created_at: string;
}

export interface PhotoSetView {
  id: string;
  user_id: string;
  name: string | null;
  ocr_status: OcrStatus;
  total_pages: number;
  ocr_text: string | null;
  expires_at: string;
  created_at: string;
  photos: PhotoView[];
}

export interface OcrSnapshot {
  status: OcrStatus;
  /** 0–100, 已完成识别的图片占比 */
  progress: number;
  /** 合并后的全集文本 */
  ocr_text: string | null;
  items: Array<{
    photo_id: string;
    /** 与小程序 PhotoItem.id 对齐(向后兼容) */
    id: string;
    order_no: number;
    image_url: string;
    ocr_text: string | null;
    regions: PhotoRegionView[];
  }>;
}

@Injectable()
export class PhotoService {
  private readonly logger = new Logger(PhotoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly moderation: ModerationService,
    private readonly aiService: AiService,
  ) {}

  // ===== Photo / PhotoSet CRUD =====

  /**
   * POST /v1/photos —— 直传后绑定
   */
  async bindPhoto(
    userId: bigint,
    dto: BindPhotoDto,
  ): Promise<PhotoView & { photo_set_id: string }> {
    const key = this.assertOwnedKey(dto.image_url);
    await this.assertObjectExists(key);

    // 内容安全:图像入库前 imgSecCheck(M6)
    await this.moderation.checkOrThrow({
      scene: ModerationScene.photo,
      userId,
      imageUrl: dto.image_url,
    });

    const maxPhotos = await this.getMaxPhotoPages();

    return this.prisma.$transaction(async (tx) => {
      let photoSet: PhotoSet;

      if (dto.photo_set_id) {
        const setIdBig = BigInt(dto.photo_set_id);
        const found = await tx.photoSet.findUnique({ where: { id: setIdBig } });
        if (!found || found.userId !== userId) {
          throw new NotFoundBusinessException('拍照集不存在');
        }
        if (found.expiresAt.getTime() < Date.now()) {
          throw new BusinessException(ERROR_CODES.RESOURCE_NOT_FOUND, '拍照集已过期(7 天)');
        }
        if (found.totalPages >= maxPhotos) {
          throw new BusinessException(ERROR_CODES.PARAM_INVALID, `单次拍照集最多 ${maxPhotos} 张`);
        }
        photoSet = found;
      } else {
        photoSet = await tx.photoSet.create({
          data: {
            userId,
            name: dto.name ?? null,
            ocrStatus: OcrStatus.pending,
            totalPages: 0,
            expiresAt: new Date(Date.now() + PHOTO_SET_TTL_MS),
          },
        });
      }

      const photo = await tx.photo.create({
        data: {
          photoSetId: photoSet.id,
          orderNo: dto.order_no,
          imageUrl: dto.image_url,
        },
      });

      const updatedSet = await tx.photoSet.update({
        where: { id: photoSet.id },
        data: { totalPages: { increment: 1 } },
      });

      this.logger.log(
        `bindPhoto user=${userId} set=${updatedSet.id} photo=${photo.id} order=${dto.order_no}`,
      );

      return {
        ...this.toPhotoView(photo),
        photo_set_id: updatedSet.id.toString(),
      };
    });
  }

  /**
   * POST /v1/photo-sets/from-pdf —— 把 PDF 拆成多页图片建一个 photo_set(M8 PR2.6)
   *
   * 让用户在「拍照」入口能直接选 PDF / 微信聊天记录里的 PDF, 而不必走"自建书"流程。
   * 同步执行(50 页 ≈ 30s); 失败抛 LLM_UNAVAILABLE 让前端 toast。
   *
   * 流程:
   *   1) 校验 pdf_url 属于本系统 OSS, content-type=application/pdf
   *   2) 调 ai-service.pdfToImages 拿到逐页 PNG(base64)
   *   3) 创建 photo_set
   *   4) 把每页 PNG 通过 storage.putObject 写到 photo/ 目录
   *   5) createMany Photo 绑定
   *   6) 内容安全:每张图后台调 imgSecCheck(不阻塞主流程, 失败仅写审计)
   *   7) 返回 photoSetId + photos
   */
  async createSetFromPdf(
    userId: bigint,
    dto: CreatePhotoSetFromPdfDto,
    options: { sourceKind?: 'pdf' | 'book'; sourceBookId?: bigint } = {},
  ): Promise<{
    photo_set_id: string;
    total_pages: number;
    truncated: boolean;
    photos: PhotoView[];
  }> {
    const sourceKind = options.sourceKind ?? 'pdf';
    this.assertOwnedKey(dto.pdf_url);
    // 校验 PDF 真的存在 + content-type
    {
      const key = this.storage.resolveKeyFromUrl(dto.pdf_url);
      if (!key) {
        throw new BusinessException(ERROR_CODES.PARAM_INVALID, 'pdf_url 必须指向本系统对象存储');
      }
      const stat = await this.storage.statObject(key);
      if (!stat) {
        throw new BusinessException(ERROR_CODES.PARAM_INVALID, 'PDF 对象不存在, 请先完成直传');
      }
      if (!/^application\/pdf/i.test(stat.contentType)) {
        throw new BusinessException(
          ERROR_CODES.PARAM_INVALID,
          `非法 content-type: ${stat.contentType}, 期望 application/pdf`,
        );
      }
    }

    const maxPagesAllowed = await this.getMaxPhotoPages();
    const requested = Math.min(dto.max_pages ?? 50, 50, Math.max(maxPagesAllowed, 50));

    // 调 ai-service 拆图
    const ai = await this.aiService.pdfToImages({
      url: dto.pdf_url,
      max_pages: requested,
      dpi: 150,
      max_side: 1600,
    });
    if (!ai.pages.length) {
      throw new BusinessException(ERROR_CODES.LLM_UNAVAILABLE, 'PDF 拆图失败, 请稍后重试');
    }
    if (ai.pages.length > maxPagesAllowed) {
      this.logger.warn(
        `createSetFromPdf 已渲染 ${ai.pages.length} 页, 超过 max_photo_pages=${maxPagesAllowed}, 截断`,
      );
    }
    const pagesToBind = ai.pages.slice(0, Math.min(ai.pages.length, maxPagesAllowed));

    // 同步上传 OSS(每页一个 PutObject)。50 页 ~25 秒
    const uploaded: Array<{ url: string; pageNo: number }> = [];
    for (const p of pagesToBind) {
      const buf = Buffer.from(p.png_b64, 'base64');
      const r = await this.storage.putObject('photo', userId, buf, 'image/png');
      uploaded.push({ url: r.url, pageNo: p.page_no });
    }
    this.logger.log(`createSetFromPdf user=${userId} uploaded ${uploaded.length} pages from PDF`);

    // 建 photo_set + photos
    const expiresAt =
      sourceKind === 'book'
        ? new Date(Date.now() + PHOTO_SET_BOOK_TTL_MS)
        : new Date(Date.now() + PHOTO_SET_TTL_MS);
    const result = await this.prisma.$transaction(async (tx) => {
      const set = await tx.photoSet.create({
        data: {
          userId,
          name: dto.name?.trim() || `PDF 导入 · ${pagesToBind.length} 页`,
          ocrStatus: OcrStatus.pending,
          totalPages: pagesToBind.length,
          sourceKind,
          sourceBookId: options.sourceBookId ?? null,
          expiresAt,
        },
      });
      await tx.photo.createMany({
        data: uploaded.map((u) => ({
          photoSetId: set.id,
          orderNo: u.pageNo,
          imageUrl: u.url,
        })),
      });
      const photos = await tx.photo.findMany({
        where: { photoSetId: set.id },
        orderBy: { orderNo: 'asc' },
      });
      return { set, photos };
    });

    // 异步触发内容安全:不阻塞主流程, 命中只记审计 + 在 OCR 时把那张图的文本拦掉
    void Promise.allSettled(
      uploaded.map((u) =>
        this.moderation.checkOrThrow({
          scene: ModerationScene.photo,
          userId,
          imageUrl: u.url,
        }),
      ),
    ).then((results) => {
      const failed = results.filter((r) => r.status === 'rejected').length;
      if (failed) {
        this.logger.warn(
          `createSetFromPdf user=${userId} set=${result.set.id} 内容审核 ${failed}/${results.length} 张失败`,
        );
      }
    });

    return {
      photo_set_id: result.set.id.toString(),
      total_pages: ai.total_pages,
      truncated: ai.truncated || ai.pages.length > maxPagesAllowed,
      photos: result.photos.map((p) => this.toPhotoView(p)),
    };
  }

  /**
   * PATCH /v1/photos/{id} —— 重拍 / 替换图 / 校对 / 框选区域回写
   *
   * 「换图」语义(M9):
   * - 当 dto.image_url 与旧值不同(且调用方未显式传 ocr_text), 视为「重裁/重拍」,
   *   后端自动 ocrText=null + ocrCorrected=0, 并把 photo_set.ocrStatus 拉回 processing,
   *   方便前端紧接着调用 startOcr 仅重跑这一张
   * - 仍允许调用方在同一次请求里显式传 ocr_text(此时按校对处理, 不再视作换图)
   */
  async updatePhoto(userId: bigint, photoId: bigint, dto: UpdatePhotoDto): Promise<PhotoView> {
    const photo = await this.findPhotoOrThrow(photoId, userId);

    if (dto.image_url) {
      this.assertOwnedKey(dto.image_url);
    }

    if (dto.ocr_text !== undefined && dto.ocr_text.trim().length > 0) {
      await this.moderation.checkOrThrow({
        scene: ModerationScene.ocr_text,
        userId,
        text: dto.ocr_text,
      });
    }
    if (dto.regions) {
      for (const r of dto.regions) {
        if (r.ocr_text && r.ocr_text.trim().length > 0) {
          await this.moderation.checkOrThrow({
            scene: ModerationScene.ocr_text,
            userId,
            text: r.ocr_text,
          });
        }
      }
    }

    const imageChanged =
      typeof dto.image_url === 'string' &&
      dto.image_url.length > 0 &&
      dto.image_url !== photo.imageUrl;
    const explicitOcrText = dto.ocr_text !== undefined;

    const data: Prisma.PhotoUpdateInput = {
      imageUrl: dto.image_url ?? photo.imageUrl,
    };
    if (explicitOcrText) {
      data.ocrText = dto.ocr_text;
      data.ocrCorrected = 1;
    } else if (imageChanged) {
      data.ocrText = null;
      data.ocrCorrected = 0;
    }
    if (dto.regions !== undefined) {
      data.regions = dto.regions as unknown as Prisma.InputJsonValue;
    }

    const updated = await this.prisma.photo.update({
      where: { id: photoId },
      data,
    });

    if (explicitOcrText || dto.regions !== undefined || imageChanged) {
      await this.refreshSetOcrAggregate(photo.photoSetId);
    }
    // 换图后让上层 photo_set 重新进入 processing, 避免前端轮询误判 done
    if (imageChanged && !explicitOcrText) {
      await this.prisma.photoSet
        .update({
          where: { id: photo.photoSetId },
          data: { ocrStatus: OcrStatus.processing },
        })
        .catch(() => {});
    }

    return this.toPhotoView(updated);
  }

  /**
   * DELETE /v1/photos/{id}
   */
  async deletePhoto(userId: bigint, photoId: bigint): Promise<{ ok: true }> {
    const photo = await this.findPhotoOrThrow(photoId, userId);
    const key = this.storage.resolveKeyFromUrl(photo.imageUrl);

    await this.prisma.$transaction(async (tx) => {
      await tx.photo.delete({ where: { id: photoId } });
      await tx.photoSet.update({
        where: { id: photo.photoSetId },
        data: { totalPages: { decrement: 1 } },
      });
    });

    if (key) {
      // OSS 删除失败不阻断业务, 仅打日志(后续清理 job 兜底)
      this.storage.deleteObject(key).catch((err) => {
        this.logger.warn(`OSS 对象删除失败 key=${key} err=${(err as Error).message}`);
      });
    }

    await this.refreshSetOcrAggregate(photo.photoSetId);
    return { ok: true };
  }

  /**
   * PATCH /v1/photo-sets/{id}/reorder
   */
  async reorderPhotos(userId: bigint, setId: bigint, dto: ReorderPhotosDto): Promise<{ ok: true }> {
    await this.findSetOrThrow(setId, userId);
    const ids = dto.items.map((it) => BigInt(it.id));

    const found = await this.prisma.photo.findMany({
      where: { id: { in: ids }, photoSetId: setId },
      select: { id: true },
    });
    if (found.length !== ids.length) {
      throw new BusinessException(ERROR_CODES.PARAM_INVALID, '存在不属于该拍照集的 photo_id');
    }

    await this.prisma.$transaction(
      dto.items.map((it) =>
        this.prisma.photo.update({
          where: { id: BigInt(it.id) },
          data: { orderNo: it.order_no },
        }),
      ),
    );

    return { ok: true };
  }

  // ===== OCR =====

  /**
   * POST /v1/photo-sets/{id}/ocr —— 触发 OCR
   * - mode=vision(推荐): 服务端调 VL 大模型逐页识别, 自动抽取文字/表格/公式
   * - mode=wechat: 仅置 processing, 等客户端把识别结果 PATCH 回来
   * - mode=mock: 立刻给所有图填占位文本并 done(本地调试用)
   * - mode=tencent: M3 接入服务端 OCR 后启用, 暂未实现
   */
  async startOcr(
    userId: bigint,
    setId: bigint,
    mode: OcrMode = 'vision',
  ): Promise<{ task_id: string; estimated_seconds: number; status: OcrStatus }> {
    const set = await this.findSetOrThrow(setId, userId);
    if (set.totalPages === 0) {
      throw new BusinessException(ERROR_CODES.PARAM_INVALID, '拍照集为空, 请先上传图片');
    }

    if (mode === 'tencent') {
      throw new BusinessException(ERROR_CODES.LLM_UNAVAILABLE, '服务端 OCR 兜底将在 M3 接入');
    }

    if (mode === 'mock') {
      const photos = await this.prisma.photo.findMany({
        where: { photoSetId: setId },
        orderBy: { orderNo: 'asc' },
      });
      await this.prisma.$transaction([
        ...photos.map((p) =>
          this.prisma.photo.update({
            where: { id: p.id },
            data: {
              ocrText: p.ocrText ?? `【MOCK OCR】拍照集 ${set.id} 第 ${p.orderNo} 页占位文本`,
            },
          }),
        ),
        this.prisma.photoSet.update({
          where: { id: setId },
          data: { ocrStatus: OcrStatus.processing },
        }),
      ]);
      await this.refreshSetOcrAggregate(setId);
      return {
        task_id: setId.toString(),
        estimated_seconds: 0,
        status: OcrStatus.done,
      };
    }

    if (mode === 'vision') {
      await this.prisma.photoSet.update({
        where: { id: setId },
        data: { ocrStatus: OcrStatus.processing },
      });

      void this.runVisionOcr(setId, userId);

      return {
        task_id: setId.toString(),
        estimated_seconds: Math.min(120, 8 * set.totalPages + 5),
        status: OcrStatus.processing,
      };
    }

    // mode=wechat: 客户端模式, 仅落 processing
    await this.prisma.photoSet.update({
      where: { id: setId },
      data: { ocrStatus: OcrStatus.processing },
    });

    return {
      task_id: setId.toString(),
      estimated_seconds: Math.min(60, 3 * set.totalPages + 5),
      status: OcrStatus.processing,
    };
  }

  /**
   * 后台异步执行 VL 大模型逐页识别, 逐页写入 ocr_text,
   * 全部完成后 refreshSetOcrAggregate 合并并置 done
   *
   * 并发策略:
   * - 每张图调 ai-service.extractDocument(单次 5-15s, 受 DashScope 限速)
   * - 串行处理 N 张图会 8N 秒, 10 张就到 80-150s, 妥妥地把前端 OCR 轮询撑爆
   * - 这里用「分批 gather」: 每批 VISION_OCR_CONCURRENCY 张并发, 批间串行
   *   既能利用 LLM 网关多路并发, 也避免一次性轰击对方限流
   * - 单页失败仅记 warn(下游 refreshSetOcrAggregate 会聚合成 processing/done),
   *   不会让整组 fail; 整体抛错才置 OcrStatus.failed
   */
  private async runVisionOcr(setId: bigint, userId: bigint): Promise<void> {
    try {
      const photos = await this.prisma.photo.findMany({
        where: { photoSetId: setId },
        orderBy: { orderNo: 'asc' },
      });
      const pending = photos.filter((p) => (p.ocrText ?? '').length === 0);

      if (pending.length === 0) {
        await this.refreshSetOcrAggregate(setId);
        return;
      }

      const startedAt = Date.now();
      let okCount = 0;
      let failCount = 0;

      for (let i = 0; i < pending.length; i += VISION_OCR_CONCURRENCY) {
        const batch = pending.slice(i, i + VISION_OCR_CONCURRENCY);
        const results = await Promise.allSettled(
          batch.map((photo) => this.runVisionOcrOne(setId, photo)),
        );
        for (const r of results) {
          if (r.status === 'fulfilled') okCount += 1;
          else failCount += 1;
        }
      }

      await this.refreshSetOcrAggregate(setId);
      this.logger.log(
        `visionOcr set=${setId} done pages=${pending.length} ok=${okCount} fail=${failCount} cost=${
          Date.now() - startedAt
        }ms user=${userId}`,
      );
    } catch (err) {
      this.logger.error(`visionOcr set=${setId} fatal: ${(err as Error).message}`);
      await this.prisma.photoSet
        .update({
          where: { id: setId },
          data: { ocrStatus: OcrStatus.failed },
        })
        .catch(() => {});
    }
  }

  /**
   * 单页识图 + 写库, 提取出来给 runVisionOcr 并发调用。
   *
   * 性能优化(M9): 优先「OSS 内网拉图 → base64 → ai-service」, 避免 DashScope 远程 fetch
   * 本地 minio / 内网 OSS 拉不到 / 重试拖到 60s 的问题。OSS 拉图失败则降级 url 模式,
   * 让 DashScope 自己去拉(走老路径,适用于生产 + 公网 OSS 场景)。
   */
  private async runVisionOcrOne(setId: bigint, photo: Photo): Promise<void> {
    try {
      let req: Parameters<typeof this.aiService.extractDocument>[0];
      const key = this.storage.resolveKeyFromUrl(photo.imageUrl);
      if (key) {
        try {
          const obj = await this.storage.fetchObject(key);
          req = {
            image_b64: obj.body.toString('base64'),
            image_mime: obj.contentType.startsWith('image/') ? obj.contentType : 'image/jpeg',
            kind: 'image',
          };
        } catch (err) {
          this.logger.warn(
            `visionOcr fetch OSS 失败, 退到 url 模式 photo=${photo.id} key=${key} err=${(err as Error).message}`,
          );
          req = { url: photo.imageUrl, kind: 'image' };
        }
      } else {
        req = { url: photo.imageUrl, kind: 'image' };
      }

      const result = await this.aiService.extractDocument(req);
      const md = (result.markdown ?? '').trim();
      if (md.length > 0) {
        await this.prisma.photo.update({
          where: { id: photo.id },
          data: { ocrText: md },
        });
      }
      this.logger.debug(`visionOcr set=${setId} photo=${photo.id} ok chars=${md.length}`);
    } catch (err) {
      this.logger.warn(
        `visionOcr set=${setId} photo=${photo.id} failed: ${(err as Error).message}`,
      );
      throw err;
    }
  }

  /**
   * GET /v1/photo-sets/{id}/ocr —— 查询状态
   */
  async getOcr(userId: bigint, setId: bigint): Promise<OcrSnapshot> {
    const set = await this.findSetOrThrow(setId, userId);
    const photos = await this.prisma.photo.findMany({
      where: { photoSetId: setId },
      orderBy: { orderNo: 'asc' },
    });
    const filled = photos.filter((p) => (p.ocrText ?? '').length > 0).length;
    const progress = photos.length === 0 ? 0 : Math.round((filled / photos.length) * 100);

    return {
      status: set.ocrStatus,
      progress,
      ocr_text: set.ocrText,
      items: photos.map((p) => ({
        photo_id: p.id.toString(),
        id: p.id.toString(),
        order_no: p.orderNo,
        image_url: p.imageUrl,
        ocr_text: p.ocrText,
        regions: PhotoService.normalizeRegions(p.regions),
      })),
    };
  }

  /**
   * PATCH /v1/photo-sets/{id}/ocr —— 客户端写回 / 校对修改
   */
  async updateOcr(userId: bigint, setId: bigint, dto: UpdateOcrDto): Promise<OcrSnapshot> {
    await this.findSetOrThrow(setId, userId);
    const ids = dto.items.map((it) => BigInt(it.photo_id));

    const photos = await this.prisma.photo.findMany({
      where: { id: { in: ids }, photoSetId: setId },
    });
    if (photos.length !== ids.length) {
      throw new BusinessException(ERROR_CODES.PARAM_INVALID, '存在不属于该拍照集的 photo_id');
    }

    // 内容安全:OCR 写回 / 校对文本必须过审, 任何一张命中即整批 block(M6)
    for (const it of dto.items) {
      if (it.ocr_text && it.ocr_text.trim().length > 0) {
        await this.moderation.checkOrThrow({
          scene: ModerationScene.ocr_text,
          userId,
          text: it.ocr_text,
        });
      }
    }

    await this.prisma.$transaction(
      dto.items.map((it) =>
        this.prisma.photo.update({
          where: { id: BigInt(it.photo_id) },
          data: {
            ocrText: it.ocr_text,
            ocrCorrected: 1,
          },
        }),
      ),
    );

    await this.refreshSetOcrAggregate(setId);
    return this.getOcr(userId, setId);
  }

  // ===== 框选区域识别(M8) =====

  /**
   * 触发对单个 region 的视觉识别(转发到 ai-service)
   * - kind=text/formula/table → 写回 region.ocr_text + corrected=1
   * - kind=chart → 写回 region.chart_data
   */
  async recognizeRegion(userId: bigint, photoId: bigint, regionId: string): Promise<PhotoView> {
    const photo = await this.findPhotoOrThrow(photoId, userId);
    const regions = PhotoService.normalizeRegions(photo.regions);
    const idx = regions.findIndex((r) => r.id === regionId);
    if (idx < 0) {
      throw new NotFoundBusinessException(`region 不存在: ${regionId}`);
    }
    const target = regions[idx];

    const recRes = await this.aiService.recognizeRegion({
      image_url: photo.imageUrl,
      bbox: target.bbox,
      coord: target.coord,
      kind: target.kind,
    });

    // 内容安全:对回填的文本做一次审核(图表的 chart_data 不审,JSON 不属于内容安全场景)
    if (recRes.ocr_text && recRes.ocr_text.trim().length > 0) {
      await this.moderation.checkOrThrow({
        scene: ModerationScene.ocr_text,
        userId,
        text: recRes.ocr_text,
      });
    }

    const updatedRegion = {
      ...target,
      ocr_text: recRes.ocr_text ?? target.ocr_text ?? null,
      chart_data: recRes.chart_data ?? target.chart_data ?? null,
      corrected: 1,
    };
    const nextRegions = [...regions];
    nextRegions[idx] = updatedRegion;

    const updated = await this.prisma.photo.update({
      where: { id: photoId },
      data: {
        regions: nextRegions as unknown as Prisma.InputJsonValue,
      },
    });

    await this.refreshSetOcrAggregate(photo.photoSetId);
    this.logger.log(
      `recognizeRegion user=${userId} photo=${photoId} region=${regionId} kind=${target.kind}`,
    );
    return this.toPhotoView(updated);
  }

  /**
   * GET /v1/photo-sets/{id} —— 拍照集 meta(M8 PR2.6 用于"反向跳书"页跳转)
   * 返回 set 的源信息(sourceKind / sourceBookId 等), 不含 photos
   */
  async getSetMeta(
    userId: bigint,
    setId: bigint,
  ): Promise<{
    id: string;
    name: string | null;
    total_pages: number;
    ocr_status: OcrStatus;
    source_kind: string;
    source_book_id: string | null;
    expires_at: string;
    created_at: string;
  }> {
    const set = await this.findSetOrThrow(setId, userId);
    return {
      id: set.id.toString(),
      name: set.name,
      total_pages: set.totalPages,
      ocr_status: set.ocrStatus,
      source_kind: set.sourceKind,
      source_book_id: set.sourceBookId !== null ? set.sourceBookId.toString() : null,
      expires_at: set.expiresAt.toISOString(),
      created_at: set.createdAt.toISOString(),
    };
  }

  /** 仅供同模块/出题模块查询用(按 order_no 排序) */
  async listPhotosForSet(userId: bigint, setId: bigint): Promise<PhotoView[]> {
    await this.findSetOrThrow(setId, userId);
    const photos = await this.prisma.photo.findMany({
      where: { photoSetId: setId },
      orderBy: { orderNo: 'asc' },
    });
    return photos.map((p) => this.toPhotoView(p));
  }

  // ===== 内部辅助 =====

  private async findSetOrThrow(setId: bigint, userId: bigint): Promise<PhotoSet> {
    const set = await this.prisma.photoSet.findUnique({ where: { id: setId } });
    if (!set || set.userId !== userId) {
      throw new NotFoundBusinessException('拍照集不存在');
    }
    return set;
  }

  private async findPhotoOrThrow(photoId: bigint, userId: bigint): Promise<Photo> {
    const photo = await this.prisma.photo.findUnique({
      where: { id: photoId },
      include: { photoSet: true },
    });
    if (!photo || photo.photoSet.userId !== userId) {
      throw new NotFoundBusinessException('图片不存在');
    }
    return photo;
  }

  /**
   * 单张照片的"对外有效文本":
   * - 优先:regions 里 kind∈[text|formula|table] 的 ocr_text 顺序拼接(框选 OCR 优先)
   * - 兜底:photo.ocrText(整图 OCR)
   */
  private static photoEffectiveText(p: Photo): string {
    const regions = PhotoService.normalizeRegions(p.regions);
    const fromRegions = regions
      .filter(
        (r) =>
          r.kind !== 'chart' && typeof r.ocr_text === 'string' && (r.ocr_text ?? '').length > 0,
      )
      .map((r) => r.ocr_text as string)
      .join('\n');
    if (fromRegions.length > 0) return fromRegions;
    return p.ocrText ?? '';
  }

  /**
   * 重新计算 photo_set.ocr_text(按 order_no 拼接) + ocr_status
   * - 单张文本同时考虑「整图 OCR」和「框选区域 OCR」(取并集,见 photoEffectiveText)
   */
  private async refreshSetOcrAggregate(setId: bigint): Promise<void> {
    const photos = await this.prisma.photo.findMany({
      where: { photoSetId: setId },
      orderBy: { orderNo: 'asc' },
    });

    if (photos.length === 0) {
      await this.prisma.photoSet.update({
        where: { id: setId },
        data: {
          ocrText: null,
          ocrStatus: OcrStatus.pending,
        },
      });
      return;
    }

    const texts = photos.map((p) => PhotoService.photoEffectiveText(p));
    const filled = texts.filter((t) => t.length > 0);
    const aggregated = filled.length === 0 ? null : texts.filter((t) => t.length > 0).join('\n\n');

    let status: OcrStatus;
    if (filled.length === 0) {
      status = OcrStatus.pending;
    } else if (filled.length === photos.length) {
      status = OcrStatus.done;
    } else {
      status = OcrStatus.processing;
    }

    await this.prisma.photoSet.update({
      where: { id: setId },
      data: {
        ocrText: aggregated,
        ocrStatus: status,
      },
    });
  }

  private async getMaxPhotoPages(): Promise<number> {
    const cfg = await this.prisma.systemConfig.findUnique({
      where: { keyName: 'max_photo_pages' },
    });
    if (!cfg) return DEFAULT_MAX_PHOTOS;
    if (typeof cfg.value === 'number') return cfg.value;
    if (typeof cfg.value === 'string') return parseInt(cfg.value, 10) || DEFAULT_MAX_PHOTOS;
    return DEFAULT_MAX_PHOTOS;
  }

  /**
   * 从 URL 解析 OSS 对象键, 校验属于本桶, 否则抛业务异常
   */
  private assertOwnedKey(url: string): string {
    const key = this.storage.resolveKeyFromUrl(url);
    if (!key) {
      throw new BusinessException(ERROR_CODES.PARAM_INVALID, '图片 URL 必须指向本系统对象存储');
    }
    return key;
  }

  /**
   * HEAD 校验对象真的存在(避免客户端骗一个不存在的 URL 上来)
   */
  private async assertObjectExists(key: string): Promise<void> {
    const stat = await this.storage.statObject(key);
    if (!stat) {
      throw new BusinessException(ERROR_CODES.PARAM_INVALID, '图片对象不存在, 请先完成直传');
    }
    if (!stat.contentType.startsWith('image/')) {
      throw new BusinessException(
        ERROR_CODES.PARAM_INVALID,
        `非法 content-type: ${stat.contentType}`,
      );
    }
  }

  private toPhotoView(p: Photo): PhotoView {
    return {
      id: p.id.toString(),
      photo_set_id: p.photoSetId.toString(),
      order_no: p.orderNo,
      image_url: p.imageUrl,
      ocr_text: p.ocrText,
      ocr_corrected: p.ocrCorrected,
      regions: PhotoService.normalizeRegions(p.regions),
      created_at: p.createdAt.toISOString(),
    };
  }

  /** 把 DB JSON 转成对外 view(容错) */
  static normalizeRegions(raw: Prisma.JsonValue | null | undefined): PhotoRegionView[] {
    if (!raw || !Array.isArray(raw)) return [];
    const out: PhotoRegionView[] = [];
    for (const item of raw) {
      if (!item || typeof item !== 'object' || Array.isArray(item)) continue;
      const r = item as Record<string, unknown>;
      const id = typeof r.id === 'string' ? r.id : '';
      const bboxRaw = r.bbox;
      if (!Array.isArray(bboxRaw) || bboxRaw.length !== 4) continue;
      const bbox = bboxRaw.map((n) => Number(n)) as [number, number, number, number];
      if (bbox.some((n) => Number.isNaN(n))) continue;
      const kindRaw = r.kind;
      const kind: PhotoRegionView['kind'] =
        kindRaw === 'chart' || kindRaw === 'formula' || kindRaw === 'table' || kindRaw === 'text'
          ? kindRaw
          : 'text';
      out.push({
        id,
        bbox,
        coord: r.coord === 'pixel' ? 'pixel' : 'normalized',
        kind,
        ocr_text: typeof r.ocr_text === 'string' ? r.ocr_text : null,
        chart_data:
          r.chart_data && typeof r.chart_data === 'object' && !Array.isArray(r.chart_data)
            ? (r.chart_data as Record<string, unknown>)
            : null,
        corrected: typeof r.corrected === 'number' ? r.corrected : 0,
        note: typeof r.note === 'string' ? r.note : null,
      });
    }
    return out;
  }
}

// 让 Prisma 类型被使用(防止 import 报未使用警告)
export type _Prisma = Prisma.JsonObject;
