/**
 * Prisma 种子数据
 * 文档:02-数据库设计文档.md §3.13(system_config 初始化)
 *
 * 运行方式(在 backend/ 目录):
 *   pnpm db:seed
 *
 * 也可在 prisma migrate reset 时自动跑(由 package.json prisma.seed 配置)
 */
import { Prisma, PrismaClient } from '@prisma/client';

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
];

async function upsertSystemConfig(): Promise<void> {
  for (const cfg of SYSTEM_CONFIGS) {
    await prisma.systemConfig.upsert({
      where: { keyName: cfg.key },
      update: {
        value: cfg.value,
        description: cfg.description,
      },
      create: {
        keyName: cfg.key,
        value: cfg.value,
        description: cfg.description,
      },
    });
  }
  console.log(`✅ system_config: 已初始化 ${SYSTEM_CONFIGS.length} 项配置`);
}

async function main(): Promise<void> {
  console.log('🌱 开始执行 seed...');
  await upsertSystemConfig();
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
