<template>
  <div class="page dash">
    <!-- Hero -->
    <header class="page-hero">
      <div>
        <h2 class="page-hero__title">
          工作台
        </h2>
        <p class="page-hero__subtitle">
          数据按上海日历日(00:00~24:00)统计 · 下次重置 {{ data ? formatDate(data.reset_at) : '—' }}
        </p>
      </div>
      <div class="page-hero__actions">
        <el-button
          :icon="Refresh"
          :loading="loading"
          @click="load"
        >
          刷新
        </el-button>
      </div>
    </header>

    <!-- 4 张今日指标卡 -->
    <div
      v-loading="loading && !data"
      class="dash__metrics"
    >
      <div
        v-for="m in todayCards"
        :key="m.label"
        class="metric"
        :class="`metric--${m.tone}`"
      >
        <div class="metric__head">
          <span class="metric__label">{{ m.label }}</span>
          <el-icon class="metric__ico">
            <component :is="m.icon" />
          </el-icon>
        </div>
        <div class="metric__value">
          {{ m.value }}
        </div>
        <div class="metric__extra">
          {{ m.extra }}
        </div>
      </div>
    </div>

    <!-- 待办 / 累计 -->
    <div class="dash__row">
      <el-card
        shadow="never"
        class="info-card"
      >
        <template #header>
          <div class="info-card__head">
            <div class="info-card__title">
              <el-icon><Warning /></el-icon>
              待办与风险
            </div>
            <el-tag
              v-if="totalPending > 0"
              type="danger"
              effect="plain"
              size="small"
            >
              {{ totalPending }} 项待处理
            </el-tag>
            <el-tag
              v-else
              type="success"
              effect="plain"
              size="small"
            >
              全部清空
            </el-tag>
          </div>
        </template>
        <div class="info-list">
          <div
            v-for="row in pendingRows"
            :key="row.label"
            class="info-row"
          >
            <span
              class="info-row__dot"
              :class="`info-row__dot--${row.tone}`"
            />
            <span class="info-row__label">{{ row.label }}</span>
            <span
              class="info-row__value"
              :class="{ danger: row.danger }"
            >{{ row.value }}</span>
          </div>
        </div>
      </el-card>

      <el-card
        shadow="never"
        class="info-card"
      >
        <template #header>
          <div class="info-card__head">
            <div class="info-card__title">
              <el-icon><DataLine /></el-icon>
              累计
            </div>
            <span class="info-card__sub">截至当前</span>
          </div>
        </template>
        <div class="info-list">
          <div
            v-for="row in totalRows"
            :key="row.label"
            class="info-row"
          >
            <span class="info-row__label">{{ row.label }}</span>
            <span class="info-row__value">{{ row.value }}</span>
          </div>
        </div>
      </el-card>
    </div>

    <!-- 快捷入口 -->
    <el-card
      shadow="never"
      class="info-card"
    >
      <template #header>
        <div class="info-card__head">
          <div class="info-card__title">
            <el-icon><Tickets /></el-icon>
            快捷入口
          </div>
        </div>
      </template>
      <div class="quick-grid">
        <a
          v-for="q in quickLinks"
          :key="q.label"
          class="quick-item"
          @click="$router.push(q.path)"
        >
          <el-icon class="quick-item__ico">
            <component :is="q.icon" />
          </el-icon>
          <div class="quick-item__body">
            <div class="quick-item__title">
              {{ q.label }}
            </div>
            <div class="quick-item__desc">
              {{ q.desc }}
            </div>
          </div>
        </a>
      </div>
    </el-card>
  </div>
</template>

<script setup lang="ts">
import {
  Camera,
  ChatLineRound,
  DataLine,
  Money,
  Reading,
  Refresh,
  Setting,
  Tickets,
  TrendCharts,
  User,
  UserFilled,
  Warning,
} from '@element-plus/icons-vue';
import dayjs from 'dayjs';
import { computed, onMounted, ref } from 'vue';

import { dashboardApi } from '@/api/admin';
import type { AdminDashboard } from '@/types/api';

const loading = ref(false);
const data = ref<AdminDashboard | null>(null);

async function load(): Promise<void> {
  loading.value = true;
  try {
    data.value = await dashboardApi.get();
  } finally {
    loading.value = false;
  }
}
onMounted(load);

const todayCards = computed(() => {
  const t = data.value?.today;
  return [
    {
      label: '今日 DAU',
      value: t?.dau?.toLocaleString() ?? '—',
      extra: '近 24 小时活跃用户',
      tone: 'brand',
      icon: UserFilled,
    },
    {
      label: '新增用户',
      value: t?.new_users?.toLocaleString() ?? '—',
      extra: '今日完成注册',
      tone: 'success',
      icon: ChatLineRound,
    },
    {
      label: '今日出题',
      value: t?.papers_created?.toLocaleString() ?? '—',
      extra: `已批改 ${t?.papers_graded ?? 0}`,
      tone: 'warning',
      icon: TrendCharts,
    },
    {
      label: 'AI 成本(¥)',
      value: t?.ai_cost?.toFixed(4) ?? '—',
      extra: '估算 · 仅 LLM 部分',
      tone: 'info',
      icon: Money,
    },
  ];
});

const totalPending = computed<number>(() => {
  const p = data.value?.pending;
  if (!p) return 0;
  return (
    (p.moderation_block_24h ?? 0) +
    (p.book_uploads_pending ?? 0) +
    (p.reports_pending ?? 0) +
    (p.appeals_pending ?? 0)
  );
});

const pendingRows = computed(() => {
  const p = data.value?.pending;
  return [
    {
      label: '近 7 天 内容拦截',
      value: p?.moderation_block_7d ?? 0,
      tone: 'warning',
    },
    {
      label: '近 24 小时 拦截',
      value: p?.moderation_block_24h ?? 0,
      tone: 'danger',
      danger: (p?.moderation_block_24h ?? 0) > 0,
    },
    {
      label: '待审 用户书籍(V2)',
      value: p?.book_uploads_pending ?? 0,
      tone: 'info',
    },
    { label: '待处理 举报(V2)', value: p?.reports_pending ?? 0, tone: 'info' },
    { label: '待处理 申诉(V2)', value: p?.appeals_pending ?? 0, tone: 'info' },
  ];
});

const totalRows = computed(() => {
  const t = data.value?.totals;
  return [
    { label: '正常用户', value: t?.users?.toLocaleString() ?? '—' },
    { label: '已上架书籍', value: t?.books_published?.toLocaleString() ?? '—' },
    { label: '历史试卷', value: t?.papers_total?.toLocaleString() ?? '—' },
    { label: '活跃错题', value: t?.mistakes_active?.toLocaleString() ?? '—' },
  ];
});

const quickLinks = computed(() => [
  { path: '/books', label: '书籍管理', desc: '增改 / 章节 / PDF 自动入章', icon: Reading },
  { path: '/photos', label: '拍照集', desc: '查看用户拍照素材 + AI 校对', icon: Camera },
  { path: '/users', label: '用户管理', desc: '封禁 / 任命 / 设置密码', icon: User },
  { path: '/audits', label: '内容审核日志', desc: '历史拦截记录与申诉', icon: Warning },
  { path: '/configs', label: '系统配置 · AI 密钥', desc: 'LLM / 视觉模型 / 公告', icon: Setting },
]);

function formatDate(ts: string): string {
  return dayjs(ts).format('YYYY-MM-DD HH:mm:ss');
}
</script>

<style scoped lang="scss">
.dash {
  max-width: 1400px;
  margin: 0 auto;
}

// ===== 指标卡 =====
.dash__metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 16px;
  margin-bottom: 24px;
}

.metric {
  position: relative;
  padding: 18px 20px;
  border-radius: 14px;
  background: #fff;
  border: 1px solid var(--color-border-soft, #f0eeea);
  overflow: hidden;
  transition: transform 0.2s, box-shadow 0.2s;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    pointer-events: none;
    opacity: 0.08;
  }

  &:hover {
    transform: translateY(-2px);
    box-shadow: 0 12px 24px rgba(20, 20, 20, 0.06);
  }
}

.metric--brand::before {
  background: linear-gradient(135deg, #6c6cf0, #5b5bd6, transparent 70%);
}
.metric--success::before {
  background: linear-gradient(135deg, #1dbf73, #16a86a, transparent 70%);
}
.metric--warning::before {
  background: linear-gradient(135deg, #f5a623, #f08a1c, transparent 70%);
}
.metric--info::before {
  background: linear-gradient(135deg, #4a6fa5, #3c5e8d, transparent 70%);
}

.metric__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
  position: relative;
}

.metric__label {
  font-size: 12.5px;
  color: var(--color-text-3, #8c8c8c);
  font-weight: 500;
}

.metric__ico {
  font-size: 18px;
  color: var(--color-brand, #5b5bd6);
  background: var(--color-brand-soft, #eeeefc);
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.metric--success .metric__ico {
  color: #1dbf73;
  background: rgba(29, 191, 115, 0.1);
}
.metric--warning .metric__ico {
  color: #f08a1c;
  background: rgba(245, 166, 35, 0.12);
}
.metric--info .metric__ico {
  color: #4a6fa5;
  background: rgba(74, 111, 165, 0.1);
}

.metric__value {
  font-size: 30px;
  font-weight: 700;
  color: var(--color-text-1, #1a1a1a);
  line-height: 1.1;
  font-variant-numeric: tabular-nums;
  position: relative;
}

.metric__extra {
  margin-top: 6px;
  font-size: 12px;
  color: var(--color-text-3, #8c8c8c);
  position: relative;
}

// ===== 待办 / 累计 / 快捷入口 =====
.dash__row {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 16px;
  margin-bottom: 16px;
}

.info-card {
  border-radius: 14px;
  border: 1px solid var(--color-border-soft, #f0eeea);

  :deep(.el-card__header) {
    padding: 14px 18px;
    border-bottom: 1px solid var(--color-border-soft, #f0eeea);
  }

  :deep(.el-card__body) {
    padding: 6px 18px 14px;
  }
}

.info-card__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.info-card__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-1, #1a1a1a);
  display: inline-flex;
  align-items: center;
  gap: 8px;

  .el-icon {
    color: var(--color-brand, #5b5bd6);
  }
}

.info-card__sub {
  font-size: 12px;
  color: var(--color-text-3, #8c8c8c);
}

.info-list {
  display: flex;
  flex-direction: column;
}

.info-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 0;
  border-bottom: 1px dashed var(--color-border-soft, #f0eeea);
  font-size: 13px;

  &:last-child {
    border-bottom: none;
  }
}

.info-row__dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  flex-shrink: 0;
}

.info-row__dot--danger {
  background: var(--color-danger, #e14c4c);
  box-shadow: 0 0 0 3px rgba(225, 76, 76, 0.16);
}
.info-row__dot--warning {
  background: var(--color-warning, #f5a623);
  box-shadow: 0 0 0 3px rgba(245, 166, 35, 0.16);
}
.info-row__dot--info {
  background: var(--color-info, #4a6fa5);
  box-shadow: 0 0 0 3px rgba(74, 111, 165, 0.16);
}

.info-row__label {
  flex: 1;
  color: var(--color-text-2, #4a4a4a);
}

.info-row__value {
  font-weight: 600;
  color: var(--color-text-1, #1a1a1a);
  font-variant-numeric: tabular-nums;

  &.danger {
    color: var(--color-danger, #e14c4c);
  }
}

// ===== 快捷入口网格 =====
.quick-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 12px;
}

.quick-item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 14px;
  border-radius: 12px;
  background: var(--color-bg-soft, #f7f6f1);
  border: 1px solid var(--color-border-soft, #f0eeea);
  cursor: pointer;
  transition: background 0.15s, transform 0.15s, box-shadow 0.15s;

  &:hover {
    background: #fff;
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(20, 20, 20, 0.05);
    border-color: var(--color-brand, #5b5bd6);
  }
}

.quick-item__ico {
  font-size: 20px;
  color: var(--color-brand, #5b5bd6);
  background: var(--color-brand-soft, #eeeefc);
  width: 40px;
  height: 40px;
  border-radius: 10px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.quick-item__body {
  flex: 1;
  min-width: 0;
}

.quick-item__title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-1, #1a1a1a);
}

.quick-item__desc {
  margin-top: 2px;
  font-size: 12px;
  color: var(--color-text-3, #8c8c8c);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
</style>
