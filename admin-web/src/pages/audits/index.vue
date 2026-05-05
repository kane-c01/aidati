<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h2 class="title">
          内容审核日志
        </h2>
        <p class="subtitle">
          共 {{ pagination.total }} 条记录
        </p>
      </div>
    </header>

    <el-card
      shadow="never"
      class="filter"
    >
      <el-form
        inline
        :model="filter"
        @submit.prevent
      >
        <el-form-item label="场景">
          <el-select
            v-model="filter.scene"
            placeholder="全部"
            clearable
            style="width: 160px"
          >
            <el-option
              v-for="s in scenes"
              :key="s"
              :label="s"
              :value="s"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="结果">
          <el-select
            v-model="filter.result"
            placeholder="全部"
            clearable
            style="width: 140px"
          >
            <el-option
              label="pass 通过"
              value="pass"
            />
            <el-option
              label="warn 警告"
              value="warn"
            />
            <el-option
              label="block 拦截"
              value="block"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="用户 ID">
          <el-input
            v-model="filter.user_id"
            clearable
            placeholder="数字 user.id"
            style="width: 160px"
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            :icon="Search"
            @click="search"
          >
            查询
          </el-button>
          <el-button
            :icon="Refresh"
            @click="reset"
          >
            重置
          </el-button>
        </el-form-item>
      </el-form>
    </el-card>

    <el-table
      v-loading="loading"
      :data="rows"
      stripe
      class="table"
    >
      <el-table-column
        prop="id"
        label="#"
        width="80"
      />
      <el-table-column
        prop="user_id"
        label="user_id"
        width="100"
      >
        <template #default="{ row }">
          {{ row.user_id ?? '系统' }}
        </template>
      </el-table-column>
      <el-table-column
        prop="scene"
        label="场景"
        width="140"
      />
      <el-table-column
        label="结果"
        width="100"
      >
        <template #default="{ row }">
          <el-tag
            v-if="row.result === 'pass'"
            size="small"
            type="success"
          >
            pass
          </el-tag>
          <el-tag
            v-else-if="row.result === 'warn'"
            size="small"
            type="warning"
          >
            warn
          </el-tag>
          <el-tag
            v-else
            size="small"
            type="danger"
          >
            block
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        prop="api_provider"
        label="provider"
        width="120"
      />
      <el-table-column
        prop="reason"
        label="原因"
        min-width="220"
        show-overflow-tooltip
      />
      <el-table-column
        prop="content_hash"
        label="content_hash"
        width="180"
        show-overflow-tooltip
      />
      <el-table-column
        prop="created_at"
        label="时间"
        width="180"
      >
        <template #default="{ row }">
          {{ format(row.created_at) }}
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      class="pagination"
      :current-page="pagination.page"
      :page-size="pagination.page_size"
      :total="pagination.total"
      :page-sizes="[20, 50, 100]"
      layout="total, sizes, prev, pager, next, jumper"
      @current-change="handlePage"
      @size-change="handleSize"
    />
  </div>
</template>

<script setup lang="ts">
import { Refresh, Search } from '@element-plus/icons-vue';
import dayjs from 'dayjs';
import { onMounted, reactive, ref } from 'vue';

import { moderationApi } from '@/api/admin';
import type { ModerationLogView } from '@/types/api';

const scenes = [
  'photo',
  'ocr_text',
  'book_info',
  'answer',
  'ai_question',
  'ai_explanation',
  'pdf_text',
  'pdf_cover',
];

const loading = ref(false);
const rows = ref<ModerationLogView[]>([]);
const pagination = reactive({ page: 1, page_size: 20, total: 0 });
const filter = reactive<{
  scene: string;
  result: 'pass' | 'warn' | 'block' | '';
  user_id: string;
}>({
  scene: '',
  result: '',
  user_id: '',
});

async function loadList(): Promise<void> {
  loading.value = true;
  try {
    const res = await moderationApi.list({
      scene: filter.scene || undefined,
      result: filter.result || undefined,
      user_id: filter.user_id.trim() || undefined,
      page: pagination.page,
      page_size: pagination.page_size,
    });
    rows.value = res.list;
    pagination.total = res.pagination.total;
  } finally {
    loading.value = false;
  }
}

function search(): void {
  pagination.page = 1;
  void loadList();
}
function reset(): void {
  filter.scene = '';
  filter.result = '';
  filter.user_id = '';
  pagination.page = 1;
  void loadList();
}
function handlePage(p: number): void {
  pagination.page = p;
  void loadList();
}
function handleSize(s: number): void {
  pagination.page_size = s;
  pagination.page = 1;
  void loadList();
}

function format(ts: string): string {
  return dayjs(ts).format('YYYY-MM-DD HH:mm:ss');
}

onMounted(loadList);
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
.filter {
  margin-bottom: 16px;
  border: none;
}
.table {
  background: #fff;
  border-radius: 8px;
}
.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
