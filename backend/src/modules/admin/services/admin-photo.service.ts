import { Injectable, Logger } from '@nestjs/common';
import { type Photo, type PhotoSet, type Prisma, OcrStatus } from '@prisma/client';

import { NotFoundBusinessException } from '../../../common/exceptions/business.exception';
import { AiService } from '../../../infra/ai-service/ai-service.service';
import { PrismaService } from '../../../infra/prisma/prisma.service';
import { PhotoService, type PhotoRegionView } from '../../photo/photo.service';
import { StorageService } from '../../../infra/storage/storage.service';

import type { AdminUpdatePhotoDto, ListAdminPhotoSetsQuery } from '../dto/admin-photo.dto';

import { AdminLogService } from './admin-log.service';

export interface AdminPhotoView {
  id: string;
  photo_set_id: string;
  order_no: number;
  image_url: string;
  ocr_text: string | null;
  ocr_corrected: number;
  regions: PhotoRegionView[];
  created_at: string;
}

export interface AdminPhotoSetView {
  id: string;
  user_id: string;
  user_nickname: string | null;
  name: string | null;
  ocr_status: OcrStatus;
  total_pages: number;
  ocr_text: string | null;
  expires_at: string;
  created_at: string;
}

export interface AdminPhotoSetDetail extends AdminPhotoSetView {
  photos: AdminPhotoView[];
}

@Injectable()
export class AdminPhotoService {
  private readonly logger = new Logger(AdminPhotoService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly aiService: AiService,
    private readonly adminLog: AdminLogService,
  ) {}

  // ===== 列表 =====

  async list(query: ListAdminPhotoSetsQuery): Promise<{
    list: AdminPhotoSetView[];
    pagination: { page: number; page_size: number; total: number };
  }> {
    const where: Prisma.PhotoSetWhereInput = {};
    if (query.user_id) where.userId = BigInt(query.user_id);
    if (query.ocr_status && query.ocr_status !== 'all') {
      where.ocrStatus = query.ocr_status as OcrStatus;
    }
    if (query.keyword && query.keyword.trim().length > 0) {
      const kw = query.keyword.trim();
      where.OR = [
        { name: { contains: kw } },
        { user: { nickname: { contains: kw } } },
        { user: { username: { contains: kw } } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.photoSet.count({ where }),
      this.prisma.photoSet.findMany({
        where,
        orderBy: [{ createdAt: 'desc' }],
        skip: (query.page - 1) * query.page_size,
        take: query.page_size,
        include: { user: { select: { nickname: true } } },
      }),
    ]);

    return {
      list: rows.map((r) => this.toSetView(r, r.user?.nickname ?? null)),
      pagination: { page: query.page, page_size: query.page_size, total },
    };
  }

  // ===== 详情(含照片 + 区域) =====

  async detail(setId: bigint): Promise<AdminPhotoSetDetail> {
    const set = await this.prisma.photoSet.findUnique({
      where: { id: setId },
      include: {
        user: { select: { nickname: true } },
        photos: { orderBy: { orderNo: 'asc' } },
      },
    });
    if (!set) throw new NotFoundBusinessException('拍照集不存在');

    return {
      ...this.toSetView(set, set.user?.nickname ?? null),
      photos: set.photos.map((p) => this.toPhotoView(p)),
    };
  }

  // ===== 管理员校对 =====

  async patchPhoto(
    adminId: bigint,
    photoId: bigint,
    dto: AdminUpdatePhotoDto,
  ): Promise<AdminPhotoView> {
    const photo = await this.prisma.photo.findUnique({ where: { id: photoId } });
    if (!photo) throw new NotFoundBusinessException('图片不存在');

    const data: Prisma.PhotoUpdateInput = {};
    if (dto.ocr_text !== undefined) {
      data.ocrText = dto.ocr_text;
      data.ocrCorrected = 1;
    }
    if (dto.order_no !== undefined) {
      data.orderNo = dto.order_no;
    }
    if (dto.regions !== undefined) {
      data.regions = dto.regions as unknown as Prisma.InputJsonValue;
    }

    const updated = await this.prisma.photo.update({ where: { id: photoId }, data });

    if (dto.ocr_text !== undefined || dto.regions !== undefined) {
      await this.refreshSetAggregate(photo.photoSetId);
    }

    await this.adminLog.record({
      adminId,
      action: 'photo.update',
      targetType: 'photo',
      targetId: photoId,
      meta: {
        ocr_text_changed: dto.ocr_text !== undefined,
        regions_changed: dto.regions !== undefined,
        order_no_changed: dto.order_no !== undefined,
      },
    });

    return this.toPhotoView(updated);
  }

  /**
   * 管理员触发单 region 视觉识别 - 复用 ai-service.recognizeRegion
   */
  async recognizeRegion(
    adminId: bigint,
    photoId: bigint,
    regionId: string,
  ): Promise<AdminPhotoView> {
    const photo = await this.prisma.photo.findUnique({ where: { id: photoId } });
    if (!photo) throw new NotFoundBusinessException('图片不存在');

    const regions = PhotoService.normalizeRegions(photo.regions);
    const idx = regions.findIndex((r) => r.id === regionId);
    if (idx < 0) throw new NotFoundBusinessException(`region 不存在: ${regionId}`);
    const target = regions[idx];

    const recRes = await this.aiService.recognizeRegion({
      image_url: photo.imageUrl,
      bbox: target.bbox,
      coord: target.coord,
      kind: target.kind,
    });

    const next = [...regions];
    next[idx] = {
      ...target,
      ocr_text: recRes.ocr_text ?? target.ocr_text ?? null,
      chart_data: recRes.chart_data ?? target.chart_data ?? null,
      corrected: 1,
    };

    const updated = await this.prisma.photo.update({
      where: { id: photoId },
      data: { regions: next as unknown as Prisma.InputJsonValue },
    });

    await this.refreshSetAggregate(photo.photoSetId);

    await this.adminLog.record({
      adminId,
      action: 'photo.recognize_region',
      targetType: 'photo',
      targetId: photoId,
      meta: {
        region_id: regionId,
        kind: target.kind,
        usage: (recRes.usage ?? null) as Prisma.InputJsonValue | null,
      } as Prisma.InputJsonValue,
    });

    return this.toPhotoView(updated);
  }

  /**
   * 管理员级联删除拍照集(连同照片 + OSS 对象);该数据本就 7 天 TTL, 删除不可逆
   */
  async deleteSet(adminId: bigint, setId: bigint): Promise<{ ok: true; deleted_photos: number }> {
    const set = await this.prisma.photoSet.findUnique({
      where: { id: setId },
      include: { photos: true },
    });
    if (!set) throw new NotFoundBusinessException('拍照集不存在');

    const keys = set.photos
      .map((p) => this.storage.resolveKeyFromUrl(p.imageUrl))
      .filter((k): k is string => k !== null);

    await this.prisma.$transaction([
      // 先把所有指向该集合的 book 引用置空, 避免删除后产生悬挂指针
      this.prisma.book.updateMany({
        where: { linkedPhotoSetId: setId },
        data: { linkedPhotoSetId: null },
      }),
      this.prisma.photo.deleteMany({ where: { photoSetId: setId } }),
      this.prisma.photoSet.delete({ where: { id: setId } }),
    ]);

    for (const k of keys) {
      this.storage.deleteObject(k).catch((err) => {
        this.logger.warn(`OSS 对象删除失败 key=${k} err=${(err as Error).message}`);
      });
    }

    await this.adminLog.record({
      adminId,
      action: 'photo_set.delete',
      targetType: 'photo_set',
      targetId: setId,
      meta: { deleted_photos: set.photos.length },
    });

    return { ok: true, deleted_photos: set.photos.length };
  }

  // ===== 私有辅助 =====

  private toSetView(s: PhotoSet, nickname: string | null): AdminPhotoSetView {
    return {
      id: s.id.toString(),
      user_id: s.userId.toString(),
      user_nickname: nickname,
      name: s.name,
      ocr_status: s.ocrStatus,
      total_pages: s.totalPages,
      ocr_text: s.ocrText,
      expires_at: s.expiresAt.toISOString(),
      created_at: s.createdAt.toISOString(),
    };
  }

  private toPhotoView(p: Photo): AdminPhotoView {
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

  /**
   * 重新聚合 photo_set.ocr_text + ocr_status
   * 与 PhotoService.refreshSetOcrAggregate 等价(避免循环依赖此处独立实现)
   */
  private async refreshSetAggregate(setId: bigint): Promise<void> {
    const photos = await this.prisma.photo.findMany({
      where: { photoSetId: setId },
      orderBy: { orderNo: 'asc' },
    });
    if (photos.length === 0) {
      await this.prisma.photoSet.update({
        where: { id: setId },
        data: { ocrText: null, ocrStatus: OcrStatus.pending },
      });
      return;
    }

    const texts = photos.map((p) => {
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
    });
    const filled = texts.filter((t) => t.length > 0);
    const aggregated = filled.length === 0 ? null : texts.filter((t) => t.length > 0).join('\n\n');

    let status: OcrStatus;
    if (filled.length === 0) status = OcrStatus.pending;
    else if (filled.length === photos.length) status = OcrStatus.done;
    else status = OcrStatus.processing;

    await this.prisma.photoSet.update({
      where: { id: setId },
      data: { ocrText: aggregated, ocrStatus: status },
    });
  }
}
