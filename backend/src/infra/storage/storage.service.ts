import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import type { Readable } from 'node:stream';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import * as mimeTypes from 'mime-types';
import { nanoid } from 'nanoid';

import { todayInShanghaiString } from '../../common/utils/timezone';
import { PrismaService } from '../prisma/prisma.service';

export type UploadScene = 'photo' | 'cover' | 'pdf';

export interface UploadPolicy {
  /** 存储提供商:minio(本地)/tencent_cos / aliyun_oss */
  provider: 'minio' | 'tencent_cos' | 'aliyun_oss';
  /** 上传方式:目前 MVP 统一用 presigned_put */
  method: 'presigned_put';
  bucket: string;
  region: string;
  /** 客户端直传时使用的预签 PUT URL */
  put_url: string;
  /** OSS 内对象键(客户端 PUT 时不能改) */
  key: string;
  /** 预签到期时间(ISO 8601 UTC) */
  expires_at: string;
  /** 该 scene 这一天的对象前缀, 仅用于客户端展示 */
  key_prefix: string;
  /** 单文件最大体积(MB) */
  max_size_mb: number;
  /** 公开访问基址(用于拼成可读 URL) */
  public_base_url: string;
}

interface SceneRule {
  /** 允许的 MIME 前缀(白名单) */
  mimePrefixes: string[];
  /** 单文件最大字节 */
  maxBytes: number;
  /** 该 scene 在 OSS 上的根目录(也作为 ACL/清理边界) */
  rootPrefix: string;
}

const SCENE_RULES: Record<UploadScene, SceneRule> = {
  photo: {
    mimePrefixes: ['image/'],
    maxBytes: 10 * 1024 * 1024,
    rootPrefix: 'photo',
  },
  cover: {
    mimePrefixes: ['image/'],
    maxBytes: 5 * 1024 * 1024,
    rootPrefix: 'cover',
  },
  pdf: {
    mimePrefixes: ['application/pdf'],
    maxBytes: 50 * 1024 * 1024,
    rootPrefix: 'pdf',
  },
};

/**
 * 对象存储服务
 * 文档:01-技术架构 §3.1 / 03-API §五
 *
 * MVP 默认 MinIO + AWS SDK v3 S3 兼容协议;
 * 生产切到腾讯云 COS 时只需替换 endpoint/credentials, 协议 100% 兼容
 *
 * 不在 controller 直接调 S3 SDK, 业务代码全部走本服务的语义化方法
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private client!: S3Client;
  private bucket!: string;
  private publicBase!: string;
  private provider!: UploadPolicy['provider'];
  private region!: string;

  /** 预签 URL 有效期(秒) */
  private static readonly PRESIGN_TTL_SEC = 600;

  private static readonly OSS_CONFIG_KEYS = [
    'oss_provider',
    'oss_endpoint',
    'oss_bucket',
    'oss_region',
    'oss_access_key',
    'oss_secret_key',
    'oss_public_base',
  ] as const;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
  ) {
    this.initFromEnv();
  }

  async onModuleInit(): Promise<void> {
    try {
      await this.tryOverrideFromDb();
    } catch (err) {
      this.logger.warn(
        `读取 system_config 中的 OSS 配置失败,使用环境变量: ${(err as Error).message}`,
      );
    }
  }

  private initFromEnv(): void {
    const endpoint = this.config.getOrThrow<string>('OSS_ENDPOINT');
    this.region = this.config.get<string>('OSS_REGION', 'us-east-1');
    const accessKey = this.config.getOrThrow<string>('OSS_ACCESS_KEY');
    const secretKey = this.config.getOrThrow<string>('OSS_SECRET_KEY');
    this.bucket = this.config.getOrThrow<string>('OSS_BUCKET');
    this.publicBase = this.config.getOrThrow<string>('OSS_PUBLIC_BASE');
    this.provider =
      (this.config.get<string>('OSS_PROVIDER', 'minio') as UploadPolicy['provider']) ?? 'minio';

    this.buildClient(endpoint, this.region, accessKey, secretKey);
  }

  private async tryOverrideFromDb(): Promise<void> {
    const rows = await this.prisma.systemConfig.findMany({
      where: { keyName: { in: [...StorageService.OSS_CONFIG_KEYS] } },
    });
    if (rows.length === 0) return;

    const map = new Map(rows.map((r) => [r.keyName, r.value as string]));
    const dbEndpoint = this.nonEmpty(map.get('oss_endpoint'));
    const dbAccessKey = this.nonEmpty(map.get('oss_access_key'));
    const dbSecretKey = this.nonEmpty(map.get('oss_secret_key'));

    if (!dbEndpoint && !dbAccessKey) return;

    const endpoint = dbEndpoint ?? this.config.getOrThrow<string>('OSS_ENDPOINT');
    const accessKey = dbAccessKey ?? this.config.getOrThrow<string>('OSS_ACCESS_KEY');
    const secretKey = dbSecretKey ?? this.config.getOrThrow<string>('OSS_SECRET_KEY');
    this.region = this.nonEmpty(map.get('oss_region')) ?? this.region;
    this.bucket = this.nonEmpty(map.get('oss_bucket')) ?? this.bucket;
    this.publicBase = this.nonEmpty(map.get('oss_public_base')) ?? this.publicBase;
    this.provider =
      (this.nonEmpty(map.get('oss_provider')) as UploadPolicy['provider']) ?? this.provider;

    this.buildClient(endpoint, this.region, accessKey, secretKey);
    this.logger.log(
      `Storage reloaded from DB: provider=${this.provider} bucket=${this.bucket} endpoint=${endpoint}`,
    );
  }

  private buildClient(
    endpoint: string,
    region: string,
    accessKey: string,
    secretKey: string,
  ): void {
    const { resolvedEndpoint, forcePathStyle } = StorageService.resolveCosCompatibleEndpoint(
      endpoint,
      this.bucket,
    );

    this.client = new S3Client({
      endpoint: resolvedEndpoint,
      region,
      credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretKey,
      },
      forcePathStyle,
    });

    this.logger.log(
      `Storage initialized provider=${this.provider} bucket=${this.bucket} endpoint=${resolvedEndpoint}` +
        (resolvedEndpoint !== endpoint.trim() ? ` (configured=${endpoint.trim()})` : '') +
        ` forcePathStyle=${forcePathStyle}`,
    );
  }

  /**
   * 腾讯云 COS：
   * - 若配置成虚拟托管 `https://{bucket}.cos.{region}.myqcloud.com`，需规范成 regional endpoint
   *   `https://cos.{region}.myqcloud.com`，并让 SDK 使用 **虚拟托管**（forcePathStyle=false）。
   *   否则沿用 path-style（`cos.../bucket/key`）会触发服务端 `PathStyleDomainForbidden`。
   * - 不可在 endpoint 里写死 `{bucket}` 同时又传 Bucket——否则部分 SDK 会得到重复 bucket 的 Host。
   *
   * 预签 PUT 形如：`https://{bucket}.cos.ap-shanghai.myqcloud.com/{key}?…`
   * 小程序需把 `{bucket}.cos.{region}.myqcloud.com` 加入下载/上传合法域名。
   */
  private static resolveCosCompatibleEndpoint(
    endpoint: string,
    bucket: string,
  ): { resolvedEndpoint: string; forcePathStyle: boolean } {
    const ep = endpoint.trim();
    const bn = bucket.trim().toLowerCase();
    try {
      const host = new URL(ep).hostname.toLowerCase();
      if (bn && host.startsWith(`${bn}.cos.`) && host.endsWith('.myqcloud.com')) {
        const regionInHost = host.slice(`${bn}.cos.`.length, host.length - '.myqcloud.com'.length);
        if (regionInHost.length > 0) {
          return {
            resolvedEndpoint: `https://cos.${regionInHost}.myqcloud.com`,
            forcePathStyle: false,
          };
        }
      }
      if (host.startsWith('cos.') && host.endsWith('.myqcloud.com')) {
        return { resolvedEndpoint: ep, forcePathStyle: false };
      }
    } catch {
      /* 非法 URL → 退回 */
    }
    return { resolvedEndpoint: ep, forcePathStyle: true };
  }

  private nonEmpty(v: string | undefined | null): string | undefined {
    if (!v || typeof v !== 'string') return undefined;
    const trimmed = v.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  // ===== 公开 API =====

  /**
   * 生成客户端直传所需的预签策略
   * @param scene  业务场景(决定目录与 MIME 白名单)
   * @param userId 当前用户 id(写入对象键以便审计)
   * @param contentType 客户端将要 PUT 的 MIME, 决定后缀
   */
  async presignPut(scene: UploadScene, userId: bigint, contentType: string): Promise<UploadPolicy> {
    const rule = this.assertSceneAllowsMime(scene, contentType);
    const ext = this.pickExtension(contentType, scene);
    const { key, prefix } = this.buildKey(rule.rootPrefix, userId, ext);

    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: key,
      ContentType: contentType,
    });
    const putUrl = await getSignedUrl(this.client, cmd, {
      expiresIn: StorageService.PRESIGN_TTL_SEC,
    });

    return {
      provider: this.provider,
      method: 'presigned_put',
      bucket: this.bucket,
      region: this.region,
      put_url: putUrl,
      key,
      expires_at: new Date(Date.now() + StorageService.PRESIGN_TTL_SEC * 1000).toISOString(),
      key_prefix: prefix,
      max_size_mb: Math.round(rule.maxBytes / (1024 * 1024)),
      public_base_url: this.publicBase,
    };
  }

  /** 后端转存(simple upload) */
  async putObject(
    scene: UploadScene,
    userId: bigint,
    body: Buffer,
    contentType: string,
  ): Promise<{ key: string; url: string }> {
    const rule = this.assertSceneAllowsMime(scene, contentType);
    if (body.length > rule.maxBytes) {
      throw new Error(`文件超出 ${scene} 场景最大限制 ${rule.maxBytes} bytes`);
    }
    const ext = this.pickExtension(contentType, scene);
    const { key } = this.buildKey(rule.rootPrefix, userId, ext);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }),
    );
    return { key, url: this.buildPublicUrl(key) };
  }

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key: key,
      }),
    );
  }

  buildPublicUrl(key: string): string {
    return `${this.publicBase.replace(/\/$/, '')}/${key.replace(/^\//, '')}`;
  }

  /**
   * 把客户端回传的 URL 解析成 key
   * 校验 URL 必须挂在本存储桶下, 防止替换成第三方域名做钓鱼/盗链
   *
   * 1) 优先匹配 oss_public_base / OSS_PUBLIC_BASE(与 buildPublicUrl 一致)
   * 2) COS 虚拟托管 https://{bucket}.cos.{region}.myqcloud.com/{key}
   * 3) COS path-style 预签 https://cos.{region}.myqcloud.com/{bucket}/{key}
   */
  resolveKeyFromUrl(url: string): string | null {
    if (!url) return null;
    const trimmed = url.trim();
    const base = this.publicBase.replace(/\/$/, '');
    if (base.length > 0 && trimmed.startsWith(`${base}/`)) {
      return trimmed.slice(base.length + 1);
    }
    const bn = this.bucket?.trim();
    if (!bn) return null;
    const bnLower = bn.toLowerCase();
    try {
      const u = new URL(trimmed);
      const host = u.hostname.toLowerCase();
      const prefix = `${bnLower}.cos.`;
      if (host.startsWith(prefix) && host.endsWith('.myqcloud.com')) {
        let key = u.pathname.startsWith('/') ? u.pathname.slice(1) : u.pathname;
        try {
          key = decodeURIComponent(key);
        } catch {
          /* 保持编码路径 */
        }
        return key.length > 0 ? key : null;
      }
      // path-style：https://cos.{region}.myqcloud.com/{bucket}/{objectKey}
      if (host.startsWith('cos.') && host.endsWith('.myqcloud.com')) {
        const rawPath = u.pathname.startsWith('/') ? u.pathname.slice(1) : u.pathname;
        const segments = rawPath.split('/').filter(Boolean);
        if (segments.length >= 2 && segments[0].toLowerCase() === bnLower) {
          const rest = segments.slice(1).join('/');
          try {
            return decodeURIComponent(rest);
          } catch {
            return rest || null;
          }
        }
      }
    } catch {
      return null;
    }
    return null;
  }

  /**
   * GET 对象原始字节(内网 / 同 VPC, 通常零延迟)
   *
   * 用途:OCR 直送链路里, backend 从 OSS 把图拉到内存 → base64 → ai-service → DashScope,
   * 完全绕过 DashScope 远程 fetch OSS 可能失败 / 慢的问题(本地 minio 场景命中率极高)。
   */
  async fetchObject(key: string): Promise<{ body: Buffer; contentType: string }> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    const stream = res.Body as Readable | undefined;
    if (!stream || typeof stream[Symbol.asyncIterator] !== 'function') {
      throw new Error(`S3 GetObject 没有返回可读流: key=${key}`);
    }
    const chunks: Buffer[] = [];
    for await (const chunk of stream as AsyncIterable<Buffer | Uint8Array>) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    }
    return {
      body: Buffer.concat(chunks),
      contentType: res.ContentType ?? 'application/octet-stream',
    };
  }

  /**
   * HEAD 对象, 验证其确实存在且大小合法;返回大小 / MIME
   * 上传链路推荐:client PUT → server HEAD 校验 → 落库 photo
   */
  async statObject(key: string): Promise<{ size: number; contentType: string } | null> {
    try {
      const res = await this.client.send(new HeadObjectCommand({ Bucket: this.bucket, Key: key }));
      return {
        size: res.ContentLength ?? 0,
        contentType: res.ContentType ?? 'application/octet-stream',
      };
    } catch (err) {
      this.logger.warn(`statObject 失败 key=${key} err=${(err as Error).message}`);
      return null;
    }
  }

  // ===== 内部辅助 =====

  private assertSceneAllowsMime(scene: UploadScene, contentType: string): SceneRule {
    const rule = SCENE_RULES[scene];
    if (!rule) throw new Error(`未知 upload scene: ${scene}`);
    const ok = rule.mimePrefixes.some((p) =>
      p.endsWith('/') ? contentType.startsWith(p) : contentType === p,
    );
    if (!ok) {
      throw new Error(`scene=${scene} 不允许 contentType=${contentType}`);
    }
    return rule;
  }

  private pickExtension(contentType: string, scene: UploadScene): string {
    const ext = mimeTypes.extension(contentType);
    if (ext && typeof ext === 'string') return ext;
    if (scene === 'pdf') return 'pdf';
    return 'bin';
  }

  /**
   * 对象键格式:
   *   {scene}/{YYYY}/{MM}/{DD}/{userId}-{nanoid12}.{ext}
   * 选择上海日期:便于按天清理拍照集
   */
  private buildKey(
    rootPrefix: string,
    userId: bigint,
    ext: string,
  ): { key: string; prefix: string } {
    const today = todayInShanghaiString();
    const [y, m, d] = today.split('-');
    const prefix = `${rootPrefix}/${y}/${m}/${d}/`;
    const key = `${prefix}${userId.toString()}-${nanoid(12)}.${ext}`;
    return { key, prefix };
  }
}
