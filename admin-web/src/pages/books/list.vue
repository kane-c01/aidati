<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h2 class="title">
          书籍管理
        </h2>
        <p class="subtitle">
          共 {{ pagination.total }} 本
        </p>
      </div>
      <el-button
        type="primary"
        :icon="Plus"
        @click="openCreate"
      >
        新建书籍
      </el-button>
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
        <el-form-item label="关键词">
          <el-input
            v-model="filter.keyword"
            clearable
            placeholder="书名 / 作者 / ISBN"
            style="width: 220px"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="filter.status"
            style="width: 140px"
          >
            <el-option
              label="全部"
              value="all"
            />
            <el-option
              label="已上架"
              value="1"
            />
            <el-option
              label="已下架"
              value="0"
            />
          </el-select>
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
      row-key="id"
    >
      <el-table-column
        type="index"
        width="56"
      />
      <el-table-column
        prop="title"
        label="书名"
        min-width="220"
      >
        <template #default="{ row }">
          <span class="book-title">{{ row.title }}</span>
          <el-tag
            v-if="row.is_recommended"
            type="warning"
            size="small"
            effect="light"
            style="margin-left: 6px"
          >
            推荐
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        prop="author"
        label="作者"
        width="160"
      />
      <el-table-column
        prop="category"
        label="分类"
        width="120"
      />
      <el-table-column
        prop="chapters_count"
        label="章节"
        width="80"
        align="center"
      />
      <el-table-column
        label="状态"
        width="100"
      >
        <template #default="{ row }">
          <el-tag
            v-if="row.status === 1"
            type="success"
            size="small"
          >
            已上架
          </el-tag>
          <el-tag
            v-else-if="row.status === 0"
            type="info"
            size="small"
          >
            已下架
          </el-tag>
          <el-tag
            v-else
            type="danger"
            size="small"
          >
            已删除
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        prop="updated_at"
        label="更新时间"
        width="180"
      >
        <template #default="{ row }">
          {{ format(row.updated_at) }}
        </template>
      </el-table-column>
      <el-table-column
        label="操作"
        width="320"
        fixed="right"
      >
        <template #default="{ row }">
          <el-button
            text
            type="primary"
            size="small"
            @click="openEdit(row)"
          >
            编辑
          </el-button>
          <el-button
            text
            type="primary"
            size="small"
            @click="openChapters(row)"
          >
            章节
          </el-button>
          <el-button
            v-if="!row.is_recommended"
            text
            type="warning"
            size="small"
            @click="setRecommend(row, true)"
          >
            推荐
          </el-button>
          <el-button
            v-else
            text
            size="small"
            @click="setRecommend(row, false)"
          >
            取消推荐
          </el-button>
          <el-button
            v-if="row.status === 1"
            text
            size="small"
            @click="setStatus(row, 0)"
          >
            下架
          </el-button>
          <el-button
            v-else-if="row.status === 0"
            text
            type="success"
            size="small"
            @click="setStatus(row, 1)"
          >
            上架
          </el-button>
          <el-button
            text
            type="danger"
            size="small"
            @click="remove(row)"
          >
            删除
          </el-button>
        </template>
      </el-table-column>
    </el-table>

    <el-pagination
      class="pagination"
      :current-page="pagination.page"
      :page-size="pagination.page_size"
      :total="pagination.total"
      layout="total, prev, pager, next, jumper"
      :page-sizes="[10, 20, 50]"
      @current-change="handlePage"
      @size-change="handleSize"
    />

    <BookEditDialog
      v-model="editVisible"
      :book="editing"
      @saved="onSaved"
    />
    <ChapterImportDialog
      v-model="chapterVisible"
      :book="chapterTarget"
      @saved="loadList()"
    />
  </div>
</template>

<script setup lang="ts">
import { Plus, Refresh, Search } from '@element-plus/icons-vue';
import dayjs from 'dayjs';
import { ElMessage, ElMessageBox } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';

import { bookApi } from '@/api/admin';
import type { AdminBookView } from '@/types/api';

import BookEditDialog from './_BookEditDialog.vue';
import ChapterImportDialog from './_ChapterImportDialog.vue';

const loading = ref(false);
const rows = ref<AdminBookView[]>([]);
const pagination = reactive({ page: 1, page_size: 20, total: 0 });
const filter = reactive({ keyword: '', status: 'all' as '1' | '0' | '-1' | 'all' });

const editVisible = ref(false);
const editing = ref<AdminBookView | null>(null);
const chapterVisible = ref(false);
const chapterTarget = ref<AdminBookView | null>(null);

async function loadList(): Promise<void> {
  loading.value = true;
  try {
    const res = await bookApi.list({
      keyword: filter.keyword.trim() || undefined,
      status: filter.status,
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
  filter.keyword = '';
  filter.status = 'all';
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

function openCreate(): void {
  editing.value = null;
  editVisible.value = true;
}

function openEdit(row: AdminBookView): void {
  editing.value = row;
  editVisible.value = true;
}

function openChapters(row: AdminBookView): void {
  chapterTarget.value = row;
  chapterVisible.value = true;
}

async function setRecommend(row: AdminBookView, on: boolean): Promise<void> {
  if (on) await bookApi.recommend(row.id);
  else await bookApi.unrecommend(row.id);
  ElMessage.success(on ? '已推荐' : '已取消推荐');
  void loadList();
}

async function setStatus(row: AdminBookView, status: 1 | 0): Promise<void> {
  if (status === 1) await bookApi.online(row.id);
  else await bookApi.offline(row.id);
  ElMessage.success(status === 1 ? '已上架' : '已下架');
  void loadList();
}

async function remove(row: AdminBookView): Promise<void> {
  try {
    await ElMessageBox.confirm(`删除《${row.title}》?(软删除, 用户侧立即下线)`, '危险操作', {
      type: 'warning',
      confirmButtonText: '删除',
      confirmButtonClass: 'el-button--danger',
    });
  } catch {
    return;
  }
  await bookApi.remove(row.id);
  ElMessage.success('已删除');
  void loadList();
}

function onSaved(): void {
  editVisible.value = false;
  void loadList();
}

function format(ts: string): string {
  return dayjs(ts).format('YYYY-MM-DD HH:mm');
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
.book-title {
  font-weight: 500;
}
.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
