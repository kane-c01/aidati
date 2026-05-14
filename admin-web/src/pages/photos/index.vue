<template>
  <div class="page app-container">
    <header class="page-hero">
      <div>
        <h2 class="page-hero__title">
          用户拍照集
        </h2>
        <p class="page-hero__subtitle">
          用户在小程序拍照上传的素材, 共 {{ pagination.total.toLocaleString() }} 组
        </p>
      </div>
    </header>

    <div class="app-filter">
      <el-form
        inline
        :model="filter"
        @submit.prevent
      >
        <el-form-item label="关键词">
          <el-input
            v-model="filter.keyword"
            clearable
            placeholder="拍照集名称 / 用户昵称"
            style="width: 240px"
            :prefix-icon="Search"
          />
        </el-form-item>
        <el-form-item label="OCR 状态">
          <el-select
            v-model="filter.ocr_status"
            style="width: 160px"
          >
            <el-option
              label="全部状态"
              value="all"
            />
            <el-option
              label="待识别"
              value="pending"
            />
            <el-option
              label="识别中"
              value="processing"
            />
            <el-option
              label="已完成"
              value="done"
            />
            <el-option
              label="失败"
              value="failed"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="用户 ID">
          <el-input
            v-model="filter.user_id"
            clearable
            placeholder="可选"
            style="width: 160px"
          />
        </el-form-item>
        <el-form-item>
          <el-button
            type="primary"
            :icon="Search"
            @click="reload(true)"
          >
            搜索
          </el-button>
          <el-button @click="onResetFilter">
            重置
          </el-button>
        </el-form-item>
      </el-form>
    </div>

    <el-card
      shadow="never"
      class="table-card"
    >
      <el-table
        v-loading="loading"
        :data="rows"
        stripe
        size="default"
        @row-click="onRowClick"
      >
        <el-table-column
          label="拍照集"
          min-width="200"
        >
          <template #default="{ row }">
            <div class="cell-title">
              <strong>{{ row.name || `#${row.id}` }}</strong>
              <span class="cell-sub">ID {{ row.id }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="用户"
          min-width="160"
        >
          <template #default="{ row }">
            <div class="cell-title">
              <span>{{ row.user_nickname || '—' }}</span>
              <span class="cell-sub">user_id {{ row.user_id }}</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column
          label="张数"
          width="80"
          align="center"
        >
          <template #default="{ row }">
            {{ row.total_pages }}
          </template>
        </el-table-column>
        <el-table-column
          label="OCR 状态"
          width="120"
        >
          <template #default="{ row }">
            <el-tag
              size="small"
              :type="ocrTagType(row.ocr_status)"
              effect="light"
            >
              {{ ocrLabel(row.ocr_status) }}
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          label="过期时间"
          width="160"
        >
          <template #default="{ row }">
            <span class="muted">{{ formatTime(row.expires_at) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="创建时间"
          width="160"
        >
          <template #default="{ row }">
            <span class="muted">{{ formatTime(row.created_at) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="160"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button
              link
              type="primary"
              @click.stop="onView(row)"
            >
              查看 / 校对
            </el-button>
            <el-button
              link
              type="danger"
              @click.stop="onRemove(row)"
            >
              删除
            </el-button>
          </template>
        </el-table-column>
        <template #empty>
          <el-empty description="暂无拍照集 — 用户在小程序拍照后会出现在这里" />
        </template>
      </el-table>

      <el-pagination
        v-model:current-page="filter.page"
        v-model:page-size="filter.page_size"
        :total="pagination.total"
        :page-sizes="[10, 20, 50]"
        layout="total, sizes, prev, pager, next, jumper"
        background
        class="pagination"
        @size-change="reload(true)"
        @current-change="reload()"
      />
    </el-card>

    <PhotoSetDrawer
      v-model="drawerOpen"
      :set-id="activeId"
      @saved="reload()"
      @deleted="onDrawerDeleted"
    />
  </div>
</template>

<script setup lang="ts">
import { Search } from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';

import { photoSetApi, type ListPhotoSetsParams } from '@/api/admin';
import type { AdminPhotoSetView, OcrStatus } from '@/types/api';

import PhotoSetDrawer from './_PhotoSetDrawer.vue';

interface Filter {
  keyword: string;
  ocr_status: OcrStatus | 'all';
  user_id: string;
  page: number;
  page_size: number;
}

const filter = reactive<Filter>({
  keyword: '',
  ocr_status: 'all',
  user_id: '',
  page: 1,
  page_size: 20,
});

const loading = ref(false);
const rows = ref<AdminPhotoSetView[]>([]);
const pagination = reactive({ total: 0 });

const drawerOpen = ref(false);
const activeId = ref<string | null>(null);

async function reload(resetPage = false): Promise<void> {
  if (resetPage) filter.page = 1;
  loading.value = true;
  try {
    const params: ListPhotoSetsParams = {
      page: filter.page,
      page_size: filter.page_size,
    };
    if (filter.keyword.trim()) params.keyword = filter.keyword.trim();
    if (filter.ocr_status !== 'all') params.ocr_status = filter.ocr_status;
    if (filter.user_id.trim()) params.user_id = filter.user_id.trim();

    const res = await photoSetApi.list(params);
    rows.value = res.list;
    pagination.total = res.pagination.total;
  } catch (err) {
    ElMessage.error((err as Error).message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function onResetFilter(): void {
  filter.keyword = '';
  filter.ocr_status = 'all';
  filter.user_id = '';
  filter.page = 1;
  void reload();
}

function onRowClick(row: AdminPhotoSetView): void {
  onView(row);
}

function onView(row: AdminPhotoSetView): void {
  activeId.value = row.id;
  drawerOpen.value = true;
}

async function onRemove(row: AdminPhotoSetView): Promise<void> {
  try {
    await ElMessageBox.confirm(
      `确认删除拍照集「${row.name || '#' + row.id}」?\n这会同时删除 ${row.total_pages} 张图与 OSS 对象,不可恢复。`,
      '删除确认',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await photoSetApi.remove(row.id);
    ElMessage.success('已删除');
    void reload();
  } catch (err) {
    ElMessage.error((err as Error).message || '删除失败');
  }
}

function onDrawerDeleted(): void {
  drawerOpen.value = false;
  activeId.value = null;
  void reload();
}

function ocrTagType(s: OcrStatus): 'info' | 'warning' | 'success' | 'danger' {
  if (s === 'done') return 'success';
  if (s === 'processing') return 'warning';
  if (s === 'failed') return 'danger';
  return 'info';
}

function ocrLabel(s: OcrStatus): string {
  if (s === 'done') return '已完成';
  if (s === 'processing') return '识别中';
  if (s === 'failed') return '失败';
  return '待识别';
}

function formatTime(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

onMounted(() => {
  void reload();
});
</script>

<style scoped lang="scss">
.cell-title {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.4;
}

.cell-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.muted {
  color: var(--el-text-color-secondary);
  font-size: 13px;
}

.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
