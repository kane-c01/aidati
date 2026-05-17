/**
 * 只读审计: 当前解析到的 OSS/COS 配置 + 桶内对象抽样 + 与 DB 中 URL 对齐情况
 * 用法(在 backend/ 目录): npx ts-node scripts/audit-oss-bucket.ts
 */
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { ListObjectsV2Command, S3Client } from '@aws-sdk/client-s3';
import { PrismaClient } from '@prisma/client';

const OSS_KEYS = [
  'oss_provider',
  'oss_endpoint',
  'oss_bucket',
  'oss_region',
  'oss_access_key',
  'oss_secret_key',
  'oss_public_base',
] as const;

function loadDotEnv(path: string): void {
  let raw: string;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return;
  }
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    process.env[key] = val;
  }
}

function nonEmpty(v: string | undefined | null): string | undefined {
  if (!v || typeof v !== 'string') return undefined;
  const s = v.trim();
  return s.length > 0 ? s : undefined;
}

/** 从控制台给的 COS 访问域名推断 region, 用于修正 regional endpoint */
function parseCosRegionFromEndpoint(ep: string): string | null {
  try {
    const host = new URL(ep).hostname;
    const m1 = host.match(/^[a-z0-9-]+\.cos\.([a-z0-9-]+)\.myqcloud\.com$/i);
    if (m1) return m1[1];
    const m2 = host.match(/^cos\.([a-z0-9-]+)\.myqcloud\.com$/i);
    if (m2) return m2[1];
  } catch {
    /* ignore */
  }
  return null;
}

async function listPrefixSamples(
  client: S3Client,
  bucket: string,
  prefix: string,
  maxKeys: number,
): Promise<{ ok: true; count: number; truncated: boolean; samples: string[] } | { ok: false; err: string }> {
  try {
    const out = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        MaxKeys: maxKeys,
      }),
    );
    const cnt = out.KeyCount ?? out.Contents?.length ?? 0;
    const samples = (out.Contents ?? []).slice(0, 8).map((o) => o.Key ?? '');
    return {
      ok: true,
      count: cnt,
      truncated: Boolean(out.IsTruncated),
      samples: samples.filter(Boolean),
    };
  } catch (e) {
    return { ok: false, err: (e as Error).message };
  }
}

async function main(): Promise<void> {
  const envPath = resolve(__dirname, '..', '.env');
  loadDotEnv(envPath);

  const prisma = new PrismaClient();

  let endpoint = nonEmpty(process.env.OSS_ENDPOINT);
  let region = nonEmpty(process.env.OSS_REGION) ?? 'us-east-1';
  let bucket = nonEmpty(process.env.OSS_BUCKET);
  let accessKey = nonEmpty(process.env.OSS_ACCESS_KEY);
  let secretKey = nonEmpty(process.env.OSS_SECRET_KEY);
  let publicBase = nonEmpty(process.env.OSS_PUBLIC_BASE);
  let provider = nonEmpty(process.env.OSS_PROVIDER) ?? 'minio';

  const rows = await prisma.systemConfig.findMany({
    where: { keyName: { in: [...OSS_KEYS] } },
  });
  const map = new Map(
    rows.map((r) => {
      const v = r.value;
      const s =
        typeof v === 'string' ? v : v != null && typeof v === 'number' ? String(v) : JSON.stringify(v);
      return [r.keyName, s] as const;
    }),
  );

  const dbEndpoint = nonEmpty(map.get('oss_endpoint'));
  const dbAccessKey = nonEmpty(map.get('oss_access_key'));
  const dbSecretKey = nonEmpty(map.get('oss_secret_key'));

  if (dbEndpoint || dbAccessKey) {
    endpoint = dbEndpoint ?? endpoint;
    accessKey = dbAccessKey ?? accessKey;
    secretKey = dbSecretKey ?? secretKey;
    region = nonEmpty(map.get('oss_region')) ?? region;
    bucket = nonEmpty(map.get('oss_bucket')) ?? bucket;
    publicBase = nonEmpty(map.get('oss_public_base')) ?? publicBase;
    provider = nonEmpty(map.get('oss_provider')) ?? provider;
  }

  console.log('── 生效配置(脱敏) ──');
  console.log(`  provider      : ${provider}`);
  console.log(`  endpoint      : ${endpoint ?? '(缺)'}`);
  console.log(`  region        : ${region}`);
  console.log(`  bucket        : ${bucket ?? '(缺)'}`);
  console.log(`  public_base   : ${publicBase ?? '(缺)'}`);
  console.log(
    `  credentials   : ${accessKey && secretKey ? `已设置 (AK 前缀 ${accessKey.slice(0, 4)}…)` : '缺失'}`,
  );
  console.log(`  .env 路径     : ${envPath}`);
  console.log(`  DB 覆盖生效   : ${Boolean(dbEndpoint || dbAccessKey)}`);
  console.log('');

  if (!endpoint || !bucket || !accessKey || !secretKey) {
    console.error('❌ OSS 连接参数不完整，无法列桶。请检查 .env 或后台 system_config。');
    await prisma.$disconnect();
    process.exit(1);
  }

  const ossBucket: string = bucket;

  if (provider === 'tencent_cos' && publicBase?.includes('localhost')) {
    console.warn(
      '⚠️  provider 已是 tencent_cos，但 public_base 仍指向 localhost，小程序/DB 里存的 URL 很可能还在旧 MinIO 域名，应到后台把 oss_public_base 改成 COS 默认访问域名。',
    );
    console.log('');
  }

  const cosRegion = parseCosRegionFromEndpoint(endpoint);
  const clients: { label: string; c: S3Client }[] = [
    {
      label: 'forcePathStyle=true(与线上一致)',
      c: new S3Client({
        endpoint,
        region,
        credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
        forcePathStyle: true,
      }),
    },
  ];
  if (provider === 'tencent_cos' && cosRegion) {
    const regional = `https://cos.${cosRegion}.myqcloud.com`;
    clients.push({
      label: `腾讯云 regional + 虚拟主机 (${regional}, region=${cosRegion})`,
      c: new S3Client({
        endpoint: regional,
        region: cosRegion,
        credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
        forcePathStyle: false,
      }),
    });
  }

  const prefixes = ['photo/', 'cover/', 'pdf/'] as const;
  const maxKeys = 80;

  console.log('── 桶内对象(按业务前缀, 每类最多 ' + maxKeys + ' 条) ──');

  async function dumpAllPrefixes(client: S3Client, label: string): Promise<void> {
    console.log(`  使用: ${label}`);
    for (const prefix of prefixes) {
      const r = await listPrefixSamples(client, ossBucket, prefix, maxKeys);
      if (!r.ok) {
        console.log(`  [${prefix}] ❌ ${r.err}`);
        continue;
      }
      console.log(`  [${prefix}] 本页条数: ${r.count}${r.truncated ? ' (截断, 还有更多)' : ''}`);
      for (const k of r.samples) console.log(`    · ${k}`);
    }
  }

  let active = clients[0];
  let probe = await listPrefixSamples(active.c, ossBucket, prefixes[0], maxKeys);
  if (!probe.ok && clients[1]) {
    console.log(`  初次列出失败（${probe.err}），改用 COS 兼容 endpoint 重试…`);
    active = clients[1];
    probe = await listPrefixSamples(active.c, ossBucket, prefixes[0], maxKeys);
  }
  if (!probe.ok) {
    console.log(`  ❌ 仍无法列桶: ${probe.err}`);
  } else {
    await dumpAllPrefixes(active.c, active.label);
  }

  const inferredCosBase =
    provider === 'tencent_cos' && bucket && cosRegion
      ? `https://${bucket}.cos.${cosRegion}.myqcloud.com`
      : null;

  if (publicBase || inferredCosBase) {
    console.log('');
    console.log('── 数据库 URL 统计 ──');

    if (publicBase) {
      const base = publicBase.replace(/\/$/, '');
      console.log(`  前缀匹配 public_base (${base}):`);
      const [photoN, bookCoverN, bookPdfN, userAvN] = await Promise.all([
        prisma.photo.count({ where: { imageUrl: { startsWith: base } } }),
        prisma.book.count({ where: { coverUrl: { startsWith: base } } }),
        prisma.book.count({ where: { pdfUrl: { startsWith: base } } }),
        prisma.user.count({ where: { avatarUrl: { startsWith: base } } }),
      ]);
      console.log(`    photo.image_url : ${photoN}`);
      console.log(`    book.cover_url  : ${bookCoverN}`);
      console.log(`    book.pdf_url    : ${bookPdfN}`);
      console.log(`    user.avatar_url : ${userAvN}`);
    }

    if (inferredCosBase) {
      const b = inferredCosBase.replace(/\/$/, '');
      console.log(`  前缀匹配推断的 COS 默认域名 (${b}):`);
      const [photoN, bookCoverN, bookPdfN, userAvN] = await Promise.all([
        prisma.photo.count({ where: { imageUrl: { startsWith: b } } }),
        prisma.book.count({ where: { coverUrl: { startsWith: b } } }),
        prisma.book.count({ where: { pdfUrl: { startsWith: b } } }),
        prisma.user.count({ where: { avatarUrl: { startsWith: b } } }),
      ]);
      console.log(`    photo.image_url : ${photoN}`);
      console.log(`    book.cover_url  : ${bookCoverN}`);
      console.log(`    book.pdf_url    : ${bookPdfN}`);
      console.log(`    user.avatar_url : ${userAvN}`);
    }

    const anyCloud = await prisma.photo.count({
      where: { imageUrl: { contains: 'myqcloud.com' } },
    });
    console.log(`  photo 中含 "myqcloud.com" 任意位置: ${anyCloud}`);
  } else {
    console.log('');
    console.log('(无法推断 public_base / COS 域名，跳过 DB URL 统计)');
  }

  await prisma.$disconnect();
  console.log('');
  console.log('✅ 审计结束');
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
