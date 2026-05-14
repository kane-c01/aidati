<template>
  <el-drawer
    :model-value="modelValue"
    :title="detail ? `用户详情 #${detail.id}` : '用户详情'"
    direction="rtl"
    size="520px"
    @update:model-value="emit('update:modelValue', $event)"
    @open="load"
  >
    <div
      v-loading="loading"
      class="content"
    >
      <template v-if="detail">
        <div class="hero">
          <el-avatar
            :src="detail.avatar_url ?? undefined"
            :size="56"
          >
            {{ detail.nickname?.[0] ?? 'A' }}
          </el-avatar>
          <div class="hero-meta">
            <div class="hero-name">
              {{ detail.nickname ?? '(未设置昵称)' }}
            </div>
            <div class="hero-tags">
              <el-tag
                size="small"
                :type="roleType"
              >
                {{ detail.role }}
              </el-tag>
              <el-tag
                size="small"
                :type="statusType"
              >
                {{ statusLabel }}
              </el-tag>
            </div>
          </div>
        </div>

        <el-descriptions
          :column="1"
          border
          class="block"
          size="small"
        >
          <el-descriptions-item label="openid">
            {{ detail.openid_masked }}
          </el-descriptions-item>
          <el-descriptions-item label="注册">
            {{ format(detail.created_at) }}
          </el-descriptions-item>
          <el-descriptions-item label="最后登录">
            {{ detail.last_login_at ? format(detail.last_login_at) : '从未登录' }}
          </el-descriptions-item>
          <el-descriptions-item label="协议">
            {{ detail.privacy_version ?? '-' }}({{ detail.privacy_agreed_at ? format(detail.privacy_agreed_at) : '未同意' }})
          </el-descriptions-item>
        </el-descriptions>

        <h3 class="block-title">
          学习数据
        </h3>
        <el-row
          :gutter="12"
          class="kv-row"
        >
          <el-col
            :span="12"
            class="kv"
          >
            <span class="kv-key">历史试卷</span>
            <span class="kv-value">{{ detail.stats.papers }}</span>
          </el-col>
          <el-col
            :span="12"
            class="kv"
          >
            <span class="kv-key">回答总数</span>
            <span class="kv-value">{{ detail.stats.answers }}</span>
          </el-col>
          <el-col
            :span="12"
            class="kv"
          >
            <span class="kv-key">活跃错题</span>
            <span class="kv-value">{{ detail.stats.mistakes_active }}</span>
          </el-col>
          <el-col
            :span="12"
            class="kv"
          >
            <span class="kv-key">最近出题</span>
            <span class="kv-value">{{ detail.stats.last_paper_at ? format(detail.stats.last_paper_at) : '从未' }}</span>
          </el-col>
        </el-row>
      </template>
    </div>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">
        关闭
      </el-button>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import dayjs from 'dayjs';
import { computed, ref, watch } from 'vue';

import { userApi } from '@/api/admin';
import type { AdminUserDetail } from '@/types/api';

const props = defineProps<{
  modelValue: boolean;
  userId: string | null;
}>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'changed'): void;
}>();

const loading = ref(false);
const detail = ref<AdminUserDetail | null>(null);

const roleType = computed<'danger' | 'warning' | 'info'>(() => {
  if (detail.value?.role === 'super_admin') return 'danger';
  if (detail.value?.role === 'admin') return 'warning';
  return 'info';
});

const statusType = computed<'success' | 'danger' | 'info'>(() => {
  if (detail.value?.status === 1) return 'success';
  if (detail.value?.status === 0) return 'danger';
  return 'info';
});

const statusLabel = computed<string>(() => {
  if (detail.value?.status === 1) return '正常';
  if (detail.value?.status === 0) return '封禁';
  return '已注销';
});

async function load(): Promise<void> {
  if (!props.userId) return;
  loading.value = true;
  try {
    detail.value = await userApi.detail(props.userId);
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.userId,
  () => {
    if (props.modelValue) void load();
  },
);

function format(ts: string): string {
  return dayjs(ts).format('YYYY-MM-DD HH:mm');
}
</script>

<style scoped lang="scss">
.content {
  padding: 0 8px;
}
.hero {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0 16px;
  border-bottom: 1px dashed #eef0f3;
}
.hero-name {
  font-size: 16px;
  font-weight: 600;
}
.hero-tags {
  margin-top: 4px;
  display: flex;
  gap: 6px;
}
.block {
  margin-top: 16px;
}
.block-title {
  margin: 24px 0 8px;
  font-size: 14px;
  font-weight: 600;
  color: #4a4a4a;
}
.kv-row {
  margin-bottom: 16px;
}
.kv {
  display: flex;
  justify-content: space-between;
  padding: 6px 0;
  border-bottom: 1px dashed #eef0f3;
  font-size: 13px;
}
.kv-key {
  color: #4a4a4a;
}
.kv-value {
  font-weight: 600;
  color: #1a1a1a;
}
</style>
