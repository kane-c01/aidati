<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h2 class="title">
          系统配置
        </h2>
        <p class="subtitle">
          仅 super_admin 可见。修改前请确认对全站影响。
        </p>
      </div>
      <el-button
        :icon="Refresh"
        @click="load"
      >
        刷新
      </el-button>
    </header>

    <el-table
      v-loading="loading"
      :data="rows"
      stripe
      class="table"
      row-key="key"
    >
      <el-table-column
        prop="key"
        label="Key"
        width="240"
      />
      <el-table-column
        label="Value"
        min-width="320"
      >
        <template #default="{ row }">
          <code class="code-value">{{ formatValue(row.value) }}</code>
        </template>
      </el-table-column>
      <el-table-column
        prop="description"
        label="描述"
        min-width="220"
        show-overflow-tooltip
      />
      <el-table-column
        prop="updated_at"
        label="更新时间"
        width="170"
      >
        <template #default="{ row }">
          {{ format(row.updated_at) }}
        </template>
      </el-table-column>
      <el-table-column
        label="操作"
        width="100"
        fixed="right"
      >
        <template #default="{ row }">
          <el-button
            text
            type="primary"
            size="small"
            @click="openEdit(row)"
          >
            改
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-dialog
      v-model="visible"
      :title="editing ? `修改配置 ${editing.key}` : '修改配置'"
      width="560px"
      :close-on-click-modal="false"
    >
      <p
        v-if="editing"
        class="hint"
      >
        当前值:<code>{{ formatValue(editing.value) }}</code>
      </p>
      <el-form label-position="top">
        <el-form-item label="新值(JSON)">
          <el-input
            v-model="newValueRaw"
            type="textarea"
            :rows="6"
            placeholder="例: 10 / &quot;deepseek-chat&quot; / [&quot;a&quot;,&quot;b&quot;] / {&quot;k&quot;:&quot;v&quot;}"
          />
          <p
            v-if="parseError"
            class="error"
          >
            解析失败:{{ parseError }}
          </p>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="newDescription"
            maxlength="200"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="visible = false">
          取消
        </el-button>
        <el-button
          type="primary"
          :loading="saving"
          :disabled="!!parseError"
          @click="save"
        >
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { Refresh } from '@element-plus/icons-vue';
import dayjs from 'dayjs';
import { ElMessage } from 'element-plus';
import { computed, onMounted, ref } from 'vue';

import { configApi } from '@/api/admin';
import type { SystemConfigView } from '@/types/api';

const loading = ref(false);
const saving = ref(false);
const rows = ref<SystemConfigView[]>([]);

const visible = ref(false);
const editing = ref<SystemConfigView | null>(null);
const newValueRaw = ref('');
const newDescription = ref('');

const parseError = computed<string | null>(() => {
  try {
    JSON.parse(newValueRaw.value || 'null');
    return null;
  } catch (err) {
    return (err as Error).message;
  }
});

async function load(): Promise<void> {
  loading.value = true;
  try {
    rows.value = await configApi.list();
  } finally {
    loading.value = false;
  }
}

function openEdit(row: SystemConfigView): void {
  editing.value = row;
  newValueRaw.value = JSON.stringify(row.value, null, 2);
  newDescription.value = row.description ?? '';
  visible.value = true;
}

async function save(): Promise<void> {
  if (!editing.value || parseError.value) return;
  saving.value = true;
  try {
    const value = JSON.parse(newValueRaw.value || 'null');
    await configApi.update(editing.value.key, value, newDescription.value || undefined);
    ElMessage.success('保存成功');
    visible.value = false;
    void load();
  } finally {
    saving.value = false;
  }
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

function format(ts: string): string {
  return dayjs(ts).format('YYYY-MM-DD HH:mm');
}

onMounted(load);
</script>

<style scoped lang="scss">
.page {
  max-width: 1400px;
  margin: 0 auto;
}
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 16px;
}
.title {
  font-size: 22px;
  font-weight: 600;
  margin: 0;
}
.subtitle {
  margin: 4px 0 0;
  font-size: 12px;
  color: #8c8c8c;
}
.table {
  background: #fff;
  border-radius: 8px;
}
.code-value {
  background: #f4f5f7;
  padding: 2px 8px;
  border-radius: 4px;
  color: #4f7cff;
  font-family: 'Menlo', 'Monaco', monospace;
  font-size: 12px;
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hint {
  font-size: 13px;
  color: #4a4a4a;
  margin: 0 0 12px;

  code {
    background: #f4f5f7;
    padding: 1px 6px;
    border-radius: 3px;
    color: #4f7cff;
  }
}
.error {
  color: #f56c6c;
  font-size: 12px;
  margin: 4px 0 0;
}
</style>
