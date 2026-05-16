<template>
  <div class="page app-container">
    <header class="page-hero">
      <div>
        <h2 class="page-hero__title">
          书籍管理
        </h2>
        <p class="page-hero__subtitle">
          管理平台书库、章节与上下架,共 {{ pagination.total.toLocaleString() }} 本
        </p>
      </div>
      <div class="page-hero__actions">
        <el-button
          type="primary"
          :icon="Plus"
          @click="openCreate"
        >
          新建书籍
        </el-button>
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
            placeholder="书名 / 作者 / ISBN"
            style="width: 240px"
            :prefix-icon="Search"
          />
        </el-form-item>
        <el-form-item label="状态">
          <el-select
            v-model="filter.status"
            style="width: 140px"
          >
            <el-option
              label="全部状态"
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
        <el-form-item label="来源">
          <el-select
            v-model="filter.source"
            style="width: 160px"
          >
            <el-option
              label="全部来源"
              value="all"
            />
            <el-option
              label="管理员录入"
              value="admin"
            />
            <el-option
              label="用户上传"
              value="user_upload"
            />
            <el-option
              label="公版"
              value="public_domain"
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
    </div>

    <div class="app-card table-card">
      <el-table
        v-loading="loading"
        :data="rows"
        stripe
        row-key="id"
        :empty-text="loading ? '加载中…' : '暂无数据,点击右上角「新建书籍」开始'"
      >
        <el-table-column
          type="index"
          label="#"
          width="56"
        />
        <el-table-column
          prop="title"
          label="书籍信息"
          min-width="260"
        >
          <template #default="{ row }">
            <div class="book-cell">
              <div class="book-cell__cover">
                <el-image
                  v-if="row.cover_url"
                  :src="row.cover_url"
                  fit="cover"
                />
                <span
                  v-else
                  class="book-cell__cover-fallback"
                >
                  {{ row.title?.[0] ?? 'B' }}
                </span>
              </div>
              <div class="book-cell__body">
                <div class="book-cell__title">
                  {{ row.title }}
                  <el-tag
                    v-if="row.is_recommended"
                    type="warning"
                    size="small"
                    effect="light"
                    round
                  >
                    推荐
                  </el-tag>
                </div>
                <div class="book-cell__meta">
                  {{ row.author || '佚名' }}<span
                    v-if="row.isbn"
                    class="dot-sep"
                  >·</span>{{ row.isbn || '' }}
                </div>
              </div>
            </div>
          </template>
        </el-table-column>
        <el-table-column
          prop="chapters_count"
          label="章节"
          width="80"
          align="center"
        >
          <template #default="{ row }">
            <span class="chapter-num">{{ row.chapters_count }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="状态"
          width="100"
        >
          <template #default="{ row }">
            <el-tag
              v-if="row.status === 1"
              type="success"
              size="small"
              effect="light"
              round
            >
              已上架
            </el-tag>
            <el-tag
              v-else-if="row.status === 0"
              type="info"
              size="small"
              effect="light"
              round
            >
              已下架
            </el-tag>
            <el-tag
              v-else
              type="danger"
              size="small"
              effect="light"
              round
            >
              已删除
            </el-tag>
          </template>
        </el-table-column>
        <el-table-column
          label="来源 / 上传者"
          width="170"
        >
          <template #default="{ row }">
            <div class="source-cell">
              <el-tag
                size="small"
                :type="sourceType(row.source)"
                effect="plain"
              >
                {{ sourceLabel(row.source) }}
              </el-tag>
              <span
                v-if="row.source === 'user_upload' && row.created_by_name"
                class="text-muted"
              >
                {{ row.created_by_name }}
              </span>
            </div>
          </template>
        </el-table-column>
        <el-table-column
          prop="updated_at"
          label="更新时间"
          width="170"
        >
          <template #default="{ row }">
            <span class="text-muted">{{ format(row.updated_at) }}</span>
          </template>
        </el-table-column>
        <el-table-column
          label="操作"
          width="420"
          fixed="right"
        >
          <template #default="{ row }">
            <el-button
              text
              type="primary"
              size="small"
              @click="openPreview(row)"
            >
              预览
            </el-button>
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
            <el-dropdown
              trigger="click"
              size="small"
            >
              <el-button
                text
                type="primary"
                size="small"
              >
                AI 入章 ▾
              </el-button>
              <template #dropdown>
                <el-dropdown-menu>
                  <el-dropdown-item
                    :disabled="!row.pdf_url || !!pdfImporting[row.id]"
                    @click="onImportPdf(row)"
                  >
                    从 PDF 抽取章节
                  </el-dropdown-item>
                  <el-dropdown-item @click="openPhotoSetImport(row)">
                    从拍照集导入章节
                  </el-dropdown-item>
                </el-dropdown-menu>
              </template>
            </el-dropdown>
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

      <div class="pagination-wrap">
        <el-pagination
          :current-page="pagination.page"
          :page-size="pagination.page_size"
          :total="pagination.total"
          layout="total, prev, pager, next, jumper"
          :page-sizes="[10, 20, 50]"
          @current-change="handlePage"
          @size-change="handleSize"
        />
      </div>
    </div>

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
    <BookPreviewDrawer
      v-model="previewVisible"
      :book-id="previewBookId"
    />

    <!-- 从拍照集导入章节 -->
    <el-dialog
      v-model="psImportVisible"
      title="从拍照集导入章节"
      width="520px"
      append-to-body
      :close-on-click-modal="false"
    >
      <el-alert
        type="warning"
        :closable="false"
        show-icon
        class="mb-12"
      >
        导入将替换《{{ psImportTarget?.title }}》的全部现有章节,不可恢复
      </el-alert>
      <el-form label-width="80px">
        <el-form-item label="拍照集">
          <el-select
            v-model="psImportSetId"
            filterable
            remote
            reserve-keyword
            placeholder="搜索拍照集(名称/用户)"
            :remote-method="searchPsForImport"
            :loading="psSearchLoading"
            style="width: 100%"
          >
            <el-option
              v-for="ps in psSearchResults"
              :key="ps.id"
              :label="`${ps.name || '#' + ps.id} (${ps.user_nickname || '—'}, ${ps.total_pages}张)`"
              :value="ps.id"
              :disabled="ps.ocr_status !== 'done'"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="psImportVisible = false">
          取消
        </el-button>
        <el-button
          type="primary"
          :loading="psImporting"
          :disabled="!psImportSetId"
          @click="onPsImport"
        >
          开始导入
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import { Plus, Refresh, Search } from '@element-plus/icons-vue';
import dayjs from 'dayjs';
import { ElMessage, ElMessageBox } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';

import { bookApi, photoSetApi } from '@/api/admin';
import type { AdminBookView, AdminPhotoSetView } from '@/types/api';

import BookEditDialog from './_BookEditDialog.vue';
import BookPreviewDrawer from './_BookPreviewDrawer.vue';
import ChapterImportDialog from './_ChapterImportDialog.vue';

const loading = ref(false);
const rows = ref<AdminBookView[]>([]);
const pagination = reactive({ page: 1, page_size: 20, total: 0 });
const filter = reactive({
  keyword: '',
  status: 'all' as '1' | '0' | '-1' | 'all',
  source: 'all' as 'admin' | 'user_upload' | 'public_domain' | 'all',
});

const editVisible = ref(false);
const editing = ref<AdminBookView | null>(null);
const chapterVisible = ref(false);
const chapterTarget = ref<AdminBookView | null>(null);

const previewVisible = ref(false);
const previewBookId = ref<string | null>(null);

const pdfImporting = reactive<Record<string, boolean>>({});

async function loadList(): Promise<void> {
  loading.value = true;
  try {
    const res = await bookApi.list({
      keyword: filter.keyword.trim() || undefined,
      status: filter.status,
      source: filter.source,
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
  filter.source = 'all';
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

function openPreview(row: AdminBookView): void {
  previewBookId.value = row.id;
  previewVisible.value = true;
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

async function onImportPdf(row: AdminBookView): Promise<void> {
  if (!row.pdf_url) {
    ElMessage.warning('该书未填 pdf_url, 请先在「编辑」中填入 PDF 链接');
    return;
  }
  try {
    await ElMessageBox.confirm(
      `要从 PDF 自动抽取章节并替换《${row.title}》当前章节吗?\n` +
        '步骤:1) 服务端 pdfplumber 抽文字  2) LLM 切章  3) 整体替换原章节(不可恢复)',
      'PDF 自动入章',
      { type: 'warning', confirmButtonText: '开始抽取', cancelButtonText: '取消' },
    );
  } catch {
    return;
  }
  pdfImporting[row.id] = true;
  try {
    const r = await bookApi.importPdf(row.id);
    ElMessage.success(
      `已抽取 ${r.imported} 章(共 ${r.pages} 页 · 启发标题 ${r.chapter_hints} 个)`,
    );
    void loadList();
  } catch (err) {
    ElMessage.error((err as Error).message || 'PDF 抽取失败');
  } finally {
    pdfImporting[row.id] = false;
  }
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

// ===== 拍照集导入章节 =====
const psImportVisible = ref(false);
const psImportTarget = ref<AdminBookView | null>(null);
const psImportSetId = ref('');
const psSearchLoading = ref(false);
const psSearchResults = ref<AdminPhotoSetView[]>([]);
const psImporting = ref(false);

function openPhotoSetImport(row: AdminBookView): void {
  psImportTarget.value = row;
  psImportSetId.value = '';
  psImportVisible.value = true;
  void searchPsForImport('');
}

async function searchPsForImport(query: string): Promise<void> {
  psSearchLoading.value = true;
  try {
    const res = await photoSetApi.list({
      keyword: query || undefined,
      page: 1,
      page_size: 20,
    });
    psSearchResults.value = res.list;
  } catch {
    psSearchResults.value = [];
  } finally {
    psSearchLoading.value = false;
  }
}

async function onPsImport(): Promise<void> {
  if (!psImportTarget.value || !psImportSetId.value) return;
  psImporting.value = true;
  try {
    const r = await bookApi.importFromPhotoSet(psImportTarget.value.id, psImportSetId.value);
    ElMessage.success(`已从拍照集导入 ${r.imported} 章`);
    psImportVisible.value = false;
    void loadList();
  } catch (err) {
    ElMessage.error((err as Error).message || '导入失败');
  } finally {
    psImporting.value = false;
  }
}

function format(ts: string): string {
  return dayjs(ts).format('YYYY-MM-DD HH:mm');
}

function sourceLabel(s: AdminBookView['source']): string {
  if (s === 'user_upload') return '用户上传';
  if (s === 'public_domain') return '公版';
  return '管理员';
}

function sourceType(s: AdminBookView['source']): 'primary' | 'success' | 'info' {
  if (s === 'user_upload') return 'primary';
  if (s === 'public_domain') return 'success';
  return 'info';
}

onMounted(() => {
  void loadList();
});
</script>

<style scoped lang="scss">
.table-card {
  padding: 0;
  overflow: hidden;
}

.book-cell {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 0;
}

.book-cell__cover {
  width: 40px;
  height: 52px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: var(--color-bg-soft);
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--color-border-soft);

  :deep(.el-image) {
    width: 100%;
    height: 100%;
  }
}

.book-cell__cover-fallback {
  font-size: 18px;
  font-weight: 600;
  color: var(--color-brand);
  background: var(--color-brand-soft);
  width: 100%;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
}

.book-cell__body {
  min-width: 0;
}

.book-cell__title {
  font-weight: 600;
  color: var(--color-text-1);
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.book-cell__meta {
  font-size: 12.5px;
  color: var(--color-text-3);
  margin-top: 2px;
}

.dot-sep {
  margin: 0 6px;
  color: var(--color-text-4);
}

.chapter-num {
  font-weight: 600;
  color: var(--color-text-1);
  font-variant-numeric: tabular-nums;
  font-size: 13px;
  background: var(--color-bg-soft);
  padding: 2px 10px;
  border-radius: var(--radius-pill);
}

.pagination-wrap {
  padding: 12px 20px;
  display: flex;
  justify-content: flex-end;
  border-top: 1px solid var(--color-border-soft);
}

.source-cell {
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}
.text-muted {
  color: var(--color-text-3);
  font-size: 12px;
}
</style>
