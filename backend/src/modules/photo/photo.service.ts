import { Injectable, Logger } from '@nestjs/common';
import { type Photo, type PhotoSet, OcrStatus, Prisma } from '@prisma/client';

import { ERROR_CODES } from '../../common/constants/error-codes';
import {
  BusinessException,
  NotFoundBusinessException,
} from '../../common/exceptions/business.exception';
import { StorageService } from '../../infra/storage/storage.service';
import { PrismaService } from '../../infra/prisma/prisma.service';

import type { BindPhotoDto } from './dto/bind-photo.dto';
import type { OcrMode } from './dto/start-ocr.dto';
import type { UpdateOcrDto } from './dto/update-ocr.dto';
import type { UpdatePhotoDto } from './dto/update-photo.dto';
import type { ReorderPhotosDto } from './dto/reorder-photos.dto';

/** photo_set 默认 7 天 TTL,见 02-数据库设计 §3.4 */
const PHOTO_SET_TTL_MS = 7 * 24 * 3600 * 1000;
const DEFAULT_MAX_PHOTOS = 20;

export interface PhotoView {
  id: string;
  photo_set_id: string;
  order_no: number;
  image_url: string;
  ocr_text: string | null;
  ocr_corrected: number;
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
  items: Array<{ photo_id: string; order_no: number; ocr_text: string | null }>;
}

@Injectable()
export class PhotoService {
  private readonly logger = new Logger(PhotoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
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
   * PATCH /v1/photos/{id} —— 重拍 / 校对
   */
  async updatePhoto(userId: bigint, photoId: bigint, dto: UpdatePhotoDto): Promise<PhotoView> {
    const photo = await this.findPhotoOrThrow(photoId, userId);

    if (dto.image_url) {
      this.assertOwnedKey(dto.image_url);
    }

    const updated = await this.prisma.photo.update({
      where: { id: photoId },
      data: {
        imageUrl: dto.image_url ?? photo.imageUrl,
        ocrText: dto.ocr_text ?? photo.ocrText,
        ocrCorrected: dto.ocr_text !== undefined ? 1 : photo.ocrCorrected,
      },
    });

    if (dto.ocr_text !== undefined) {
      await this.refreshSetOcrAggregate(photo.photoSetId);
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
   * - mode=wechat(默认): 仅置 processing, 等客户端把识别结果 PATCH 回来
   * - mode=mock: 立刻给所有图填占位文本并 done(本地调试用)
   * - mode=tencent: M3 接入服务端 OCR 后启用, 暂未实现
   */
  async startOcr(
    userId: bigint,
    setId: bigint,
    mode: OcrMode = 'wechat',
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

    // mode=wechat: 客户端模式, 仅落 processing
    await this.prisma.photoSet.update({
      where: { id: setId },
      data: { ocrStatus: OcrStatus.processing },
    });

    return {
      task_id: setId.toString(),
      // 经验值, 客户端连拍 5 张时, 微信 OCR 大约耗时 15-25s
      estimated_seconds: Math.min(60, 3 * set.totalPages + 5),
      status: OcrStatus.processing,
    };
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
        order_no: p.orderNo,
        ocr_text: p.ocrText,
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
   * 重新计算 photo_set.ocr_text(按 order_no 拼接) + ocr_status
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

    const filled = photos.filter((p) => (p.ocrText ?? '').length > 0);
    const aggregated =
      filled.length === 0
        ? null
        : photos
            .map((p) => p.ocrText ?? '')
            .filter((t) => t.length > 0)
            .join('\n\n');

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
      created_at: p.createdAt.toISOString(),
    };
  }
}

// 让 Prisma 类型被使用(防止 import 报未使用警告)
export type _Prisma = Prisma.JsonObject;
