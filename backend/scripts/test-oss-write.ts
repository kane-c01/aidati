/**
 * 写删探测: 用当前 .env + DB 合并后的 OSS 配置执行 Put → Head → Delete
 * 与 StorageService 相同的方式优先测一遍，失败则对腾讯云用 regional endpoint 再测。
 * 用法: cd backend && npx ts-node scripts/test-oss-write.ts
 */
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import {
  DeleteObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
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

  await prisma.$disconnect();

  console.log('── OSS 写删探测（当前合并配置）──');
  console.log(`  provider : ${provider}`);
  console.log(`  endpoint : ${endpoint ?? '(缺)'}`);
  console.log(`  region   : ${region}`);
  console.log(`  bucket   : ${bucket ?? '(缺)'}`);
  console.log(`  public_base : ${publicBase ?? '(缺)'}`);
  console.log('');

  if (!endpoint || !bucket || !accessKey || !secretKey) {
    console.error('❌ 参数不完整，无法测试');
    process.exit(1);
  }

  const ossBucket = bucket;
  const cosRegion = parseCosRegionFromEndpoint(endpoint);
  const clients: { label: string; c: S3Client }[] = [
    {
      label: '与后端 StorageService 一致: forcePathStyle=true + 当前 endpoint',
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
      label: `腾讯云推荐: forcePathStyle=false + ${regional} (region=${cosRegion})`,
      c: new S3Client({
        endpoint: regional,
        region: cosRegion,
        credentials: { accessKeyId: accessKey, secretAccessKey: secretKey },
        forcePathStyle: false,
      }),
    });
  }

  const key = `__probe/cursor-${Date.now()}.txt`;
  const body = Buffer.from('cursor-oss-probe\n', 'utf8');

  for (const { label, c: client } of clients) {
    console.log(`尝试: ${label}`);
    try {
      await client.send(
        new PutObjectCommand({
          Bucket: ossBucket,
          Key: key,
          Body: body,
          ContentType: 'text/plain',
        }),
      );
      const head = await client.send(
        new HeadObjectCommand({ Bucket: ossBucket, Key: key }),
      );
      await client.send(new DeleteObjectCommand({ Bucket: ossBucket, Key: key }));
      console.log('');
      console.log('✅ 通过: PutObject + HeadObject + DeleteObject 均成功');
      console.log(`   使用方式: ${label}`);
      console.log(`   探测对象 key: ${key}（已删除）`);
      console.log(`   Head ContentLength: ${head.ContentLength ?? 'n/a'}`);
      process.exit(0);
    } catch (e) {
      console.log(`   ❌ 失败: ${(e as Error).message}`);
      console.log('');
    }
  }

  console.error('❌ 所有连接方式均上传失败，COS 当前不能用于本后端写对象');
  process.exit(1);
}

main().catch((err) => {
  console.error('❌', err);
  process.exit(1);
});
