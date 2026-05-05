<template>
  <div class="dashboard">
    <h2 class="title">
      工作台
    </h2>
    <p class="subtitle">
      数据按上海日历日(00:00~24:00)统计
    </p>

    <el-row
      v-loading="loading"
      :gutter="16"
      class="card-row"
    >
      <el-col
        v-for="item in todayCards"
        :key="item.label"
        :xs="12"
        :sm="8"
        :md="6"
      >
        <el-card
          shadow="hover"
          class="metric-card"
        >
          <div class="metric-label">
            {{ item.label }}
          </div>
          <div class="metric-value">
            {{ item.value }}
          </div>
          <div class="metric-extra">
            {{ item.extra }}
          </div>
        </el-card>
      </el-col>
    </el-row>

    <el-row
      :gutter="16"
      class="card-row"
    >
      <el-col
        :sm="24"
        :md="12"
      >
        <el-card shadow="never">
          <template #header>
            <span>待办 / 风险</span>
          </template>
          <el-row :gutter="12">
            <el-col
              v-for="row in pendingRows"
              :key="row.label"
              :span="12"
              class="kv"
            >
              <span class="kv-key">{{ row.label }}</span>
              <span
                class="kv-value"
                :class="{ danger: row.danger }"
              >{{ row.value }}</span>
            </el-col>
          </el-row>
        </el-card>
      </el-col>
      <el-col
        :sm="24"
        :md="12"
      >
        <el-card shadow="never">
          <template #header>
            <span>累计</span>
          </template>
          <el-row :gutter="12">
            <el-col
              v-for="row in totalRows"
              :key="row.label"
              :span="12"
              class="kv"
            >
              <span class="kv-key">{{ row.label }}</span>
              <span class="kv-value">{{ row.value }}</span>
            </el-col>
          </el-row>
        </el-card>
      </el-col>
    </el-row>

    <p
      v-if="data"
      class="reset-hint"
    >
      下次重置:{{ formatDate(data.reset_at) }}
    </p>
  </div>
</template>

<script setup lang="ts">
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
    { label: '今日 DAU', value: t?.dau ?? '-', extra: '近 24h 活跃数' },
    { label: '新增用户', value: t?.new_users ?? '-', extra: '今日注册' },
    { label: '今日出题', value: t?.papers_created ?? '-', extra: `已批改 ${t?.papers_graded ?? 0}` },
    { label: 'AI 成本(¥)', value: t?.ai_cost?.toFixed(4) ?? '-', extra: '估算, 仅 LLM 部分' },
  ];
});

const pendingRows = computed(() => {
  const p = data.value?.pending;
  return [
    { label: '近 7 天 内容拦截', value: p?.moderation_block_7d ?? '-' },
    { label: '近 24 小时 拦截', value: p?.moderation_block_24h ?? '-', danger: (p?.moderation_block_24h ?? 0) > 0 },
    { label: '待审 用户书籍(V2)', value: p?.book_uploads_pending ?? 0 },
    { label: '待处理 举报(V2)', value: p?.reports_pending ?? 0 },
  ];
});

const totalRows = computed(() => {
  const t = data.value?.totals;
  return [
    { label: '正常用户', value: t?.users ?? '-' },
    { label: '已上架书籍', value: t?.books_published ?? '-' },
    { label: '历史试卷', value: t?.papers_total ?? '-' },
    { label: '活跃错题', value: t?.mistakes_active ?? '-' },
  ];
});

function formatDate(ts: string): string {
  return dayjs(ts).format('YYYY-MM-DD HH:mm:ss');
}
</script>

<style scoped lang="scss">
.dashboard {
  max-width: 1400px;
  margin: 0 auto;
}

.title {
  font-size: 22px;
  font-weight: 600;
  margin: 0 0 4px;
}

.subtitle {
  font-size: 12px;
  color: #8c8c8c;
  margin: 0 0 20px;
}

.card-row {
  margin-bottom: 16px;
}

.metric-card {
  border: none;
  border-radius: 12px;
  padding: 4px 4px;
  text-align: left;
}

.metric-label {
  color: #8c8c8c;
  font-size: 13px;
}

.metric-value {
  margin-top: 6px;
  font-size: 26px;
  font-weight: 700;
  color: #1a1a1a;
}

.metric-extra {
  margin-top: 4px;
  font-size: 12px;
  color: #b0b3b8;
}

.kv {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  font-size: 13px;
  padding: 8px 0;
  border-bottom: 1px dashed #eef0f3;
}

.kv-key {
  color: #4a4a4a;
}

.kv-value {
  font-weight: 600;
  color: #1a1a1a;

  &.danger {
    color: #f56c6c;
  }
}

.reset-hint {
  text-align: right;
  font-size: 12px;
  color: #b0b3b8;
}
</style>
