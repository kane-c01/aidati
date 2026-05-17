/// <reference types="node" />
/**
 * Prisma 种子数据
 * 文档:02-数据库设计文档.md §3.13(system_config 初始化)
 *
 * 运行方式(在 backend/ 目录):
 *   pnpm db:seed
 *
 * 也可在 prisma migrate reset 时自动跑(由 package.json prisma.seed 配置)
 *
 * Seed 内容:
 * 1. system_config 默认配置(缺则插入;已存在则只更新 description,不覆盖 value;含 OSS 与 LLM 后台项)
 * 2. 默认超级管理员 admin
 *    - 密码: 优先取环境变量 ADMIN_DEFAULT_PASSWORD;
 *           未设置则随机生成 24 位强密码,并打印到 stdout (仅打印一次, 不入库明文)
 *    - 已存在则跳过 (避免覆盖)
 *
 * 注:本文件不在 backend/tsconfig.json 的 include 内, 顶部 reference 让 IDE 找到 node 类型。
 * ts-node 实际运行不受影响。
 */
import { randomBytes } from 'node:crypto';

import { Prisma, PrismaClient, UserRole } from '@prisma/client';

import { hashPassword } from '../src/common/utils/password';

const prisma = new PrismaClient();

interface ConfigItem {
  key: string;
  value: Prisma.InputJsonValue;
  description: string;
}

const SYSTEM_CONFIGS: ConfigItem[] = [
  {
    key: 'privacy_version',
    value: 'v1.0',
    description: '当前隐私协议版本, 用户协议升级后客户端需重新弹窗',
  },
  {
    key: 'terms_version',
    value: 'v1.0',
    description: '当前用户服务协议版本',
  },
  {
    key: 'daily_quota_user_first',
    value: 5,
    description: '新注册用户首日出题额度(02 §3.13)',
  },
  {
    key: 'daily_quota_user',
    value: 10,
    description: '普通用户每日出题额度',
  },
  {
    key: 'daily_quota_admin',
    value: 50,
    description: '管理员/超管每日出题额度',
  },
  {
    key: 'max_paper_questions',
    value: 50,
    description: '单卷最大题量',
  },
  {
    key: 'max_photo_pages',
    value: 20,
    description: '单次拍照集最大页数',
  },
  {
    key: 'current_llm_primary',
    value: 'deepseek-chat',
    description: '主用 LLM 模型 ID',
  },
  {
    key: 'current_llm_backup',
    value: 'qwen-plus',
    description: '备用 LLM 模型 ID',
  },
  {
    key: 'sensitive_words',
    value: [] as string[],
    description: '敏感词扩展(微信内容安全 + 自维护词库, 留空表示仅依赖微信)',
  },
  {
    key: 'home_banners',
    value: [] as Prisma.InputJsonValue[],
    description: '首页轮播图配置 [{image_url, link, sort_no}]',
  },
  {
    key: 'announcement',
    value: { title: '', content: '', active: false },
    description: '全站公告;active=true 时小程序首页弹出',
  },
  {
    key: 'minor_mode_window',
    value: { start: '06:00', end: '22:00' },
    description: '未成年人模式可用时段(本地时区), PRD §7.5.2',
  },
  // OSS / COS: 与 admin 配置页、StorageService.OSS_CONFIG_KEYS 对齐; 留空则 onModuleInit 仍走环境变量
  {
    key: 'oss_provider',
    value: 'minio',
    description: '对象存储提供商: minio | tencent_cos | aliyun_oss',
  },
  {
    key: 'oss_endpoint',
    value: '',
    description: 'S3 兼容 Endpoint(腾讯云 COS 为 https://cos.<region>.myqcloud.com)',
  },
  {
    key: 'oss_bucket',
    value: '',
    description: '存储桶名称',
  },
  {
    key: 'oss_region',
    value: '',
    description: '区域, 如 ap-guangzhou',
  },
  {
    key: 'oss_access_key',
    value: '',
    description: '访问密钥 ID(Secret 类, 列表接口脱敏)',
  },
  {
    key: 'oss_secret_key',
    value: '',
    description: '访问密钥 Secret(Secret 类, 列表接口脱敏)',
  },
  {
    key: 'oss_public_base',
    value: '',
    description: '公开访问 URL 基址(末尾不要斜杠), 用于拼接文件直链',
  },
  // LLM 运行时: 与 admin 配置页、LlmRuntimeService.CONFIG_KEYS 对齐; 留空可走 ai-service .env
  {
    key: 'llm_deepseek_api_key',
    value: '',
    description: 'DeepSeek API Key(敏感;后台保存后在 ai-health / 出题链路中使用)',
  },
  {
    key: 'llm_qwen_api_key',
    value: '',
    description: '通义千问 API Key(可选)',
  },
  {
    key: 'llm_glm_api_key',
    value: '',
    description: '智谱 GLM API Key(可选)',
  },
  {
    key: 'llm_deepseek_base_url',
    value: 'https://api.deepseek.com',
    description: 'DeepSeek OpenAI 兼容 Base URL',
  },
  {
    key: 'llm_qwen_base_url',
    value: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    description: '通义千问兼容 Base URL',
  },
  {
    key: 'llm_glm_base_url',
    value: 'https://open.bigmodel.cn/api/paas/v4',
    description: '智谱 GLM Base URL',
  },
  // 视觉模型(VL): 与 admin 配置页、VisionRuntimeService.CONFIG_KEYS 对齐
  {
    key: 'vision_provider',
    value: 'qwen_vl',
    description: '视觉识别提供商: 目前 qwen_vl',
  },
  {
    key: 'vision_model',
    value: 'qwen-vl-max',
    description: '视觉模型 ID',
  },
  {
    key: 'vision_api_key',
    value: '',
    description: 'DashScope API Key(可选;空则 ai-service 可回落到 Qwen Key)',
  },
  {
    key: 'vision_base_url',
    value: '',
    description: '视觉 API Base URL(留空走 DashScope 兼容默认)',
  },
];

async function upsertSystemConfig(): Promise<void> {
  for (const cfg of SYSTEM_CONFIGS) {
    await prisma.systemConfig.upsert({
      where: { keyName: cfg.key },
      update: {
        // 仅同步说明文案;不覆盖 value,避免线上已配好的 COS/额度等被 seed 刷掉
        description: cfg.description,
      },
      create: {
        keyName: cfg.key,
        value: cfg.value,
        description: cfg.description,
      },
    });
  }
  console.log(`✅ system_config: 已确保 ${SYSTEM_CONFIGS.length} 项配置存在(缺则创建,已有则保留 value)`);
}

/**
 * 默认超级管理员账号
 * - 仅在「该 username 还不存在」时插入(已存在不会覆盖密码,避免误踩)
 * - 密码来源(优先级从高到低):
 *   1. 环境变量 ADMIN_DEFAULT_PASSWORD
 *   2. 自动生成 24 字节随机密码(打印到 stdout 一次)
 * - 禁止使用历史弱密码 admin123 等;若环境变量明文出现在禁用列表会立即报错
 */
const FORBIDDEN_DEFAULT_PASSWORDS = new Set([
  'admin',
  'admin123',
  'password',
  '123456',
  '12345678',
  'qwerty',
]);

function resolveDefaultPassword(): { password: string; source: 'env' | 'random' } {
  const fromEnv = (process.env.ADMIN_DEFAULT_PASSWORD ?? '').trim();
  if (fromEnv.length > 0) {
    if (FORBIDDEN_DEFAULT_PASSWORDS.has(fromEnv.toLowerCase()) || fromEnv.length < 12) {
      throw new Error(
        `ADMIN_DEFAULT_PASSWORD 不可使用弱密码(≥12 位,且不在历史泄露列表). 当前值已被拒绝。`,
      );
    }
    return { password: fromEnv, source: 'env' };
  }
  // 24 字节 → base64url 32 字符,足以抗在线爆破
  const random = randomBytes(24).toString('base64url');
  return { password: random, source: 'random' };
}

async function ensureDefaultSuperAdmin(): Promise<void> {
  const username = 'admin';
  const existing = await prisma.user.findUnique({ where: { username } });
  if (existing) {
    console.log(`✅ 默认超管已存在 user_id=${existing.id} username=${username},不重置密码`);
    return;
  }
  const { password, source } = resolveDefaultPassword();
  const created = await prisma.user.create({
    data: {
      username,
      passwordHash: hashPassword(password),
      nickname: '超级管理员',
      role: UserRole.super_admin,
      status: 1,
      openid: null,
    },
  });

  const banner = '='.repeat(72);
  console.log(`\n${banner}`);
  console.log(`🔑 已创建默认超管 user_id=${created.id} username=${username}`);
  if (source === 'random') {
    console.log(`🔐 自动生成密码(仅显示这一次,请立即保存到密码管理器):`);
    console.log(`    ${password}`);
    console.log(`⚠️  下次 seed 不会再显示;丢失需通过 SQL 重置 passwordHash`);
  } else {
    console.log(`🔐 已使用 ADMIN_DEFAULT_PASSWORD 环境变量中的密码`);
  }
  console.log(`${banner}\n`);
}

async function main(): Promise<void> {
  console.log('🌱 开始执行 seed...');
  await upsertSystemConfig();
  await ensureDefaultSuperAdmin();
  console.log('🎉 seed 完成');
}

main()
  .catch((err) => {
    console.error('❌ seed 失败', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
