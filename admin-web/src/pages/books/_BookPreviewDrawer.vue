<template>
  <el-drawer
    :model-value="modelValue"
    :title="detail?.title ? `预览 — ${detail.title}` : '书籍预览'"
    direction="rtl"
    size="520px"
    append-to-body
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
    @open="onOpen"
  >
    <div
      v-loading="loading"
      class="preview"
    >
      <template v-if="detail">
        <div class="cover-row">
          <div class="cover-box">
            <el-image
              v-if="detail.cover_url"
              :src="detail.cover_url"
              fit="cover"
            />
            <span
              v-else
              class="cover-fallback"
            >{{ detail.title?.[0] ?? '书' }}</span>
          </div>
          <div class="cover-meta">
            <p class="title">
              {{ detail.title }}
            </p>
            <p class="meta-line">
              {{ detail.author || '佚名' }}
              <span v-if="detail.isbn"> · ISBN {{ detail.isbn }}</span>
            </p>
            <el-space wrap>
              <el-tag
                v-if="detail.is_recommended"
                type="warning"
                size="small"
              >
                推荐
              </el-tag>
              <el-tag
                size="small"
                effect="plain"
              >
                {{ statusLabel(detail.status) }}
              </el-tag>
              <el-tag
                size="small"
                effect="plain"
              >
                {{ detail.source }}
              </el-tag>
            </el-space>
          </div>
        </div>

        <el-descriptions
          :column="1"
          border
          size="small"
          class="desc-block"
        >
          <el-descriptions-item label="ISBN">
            {{ detail.isbn || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="版权">
            {{ detail.copyright_status || '—' }}
          </el-descriptions-item>
          <el-descriptions-item label="PDF">
            <template v-if="detail.pdf_url">
              <el-link
                :href="detail.pdf_url"
                target="_blank"
                type="primary"
              >
                打开链接
              </el-link>
              <span
                v-if="detail.pdf_pages"
                class="muted"
              >（约 {{ detail.pdf_pages }} 页）</span>
            </template>
            <span v-else>—</span>
          </el-descriptions-item>
          <el-descriptions-item label="标签">
            <template v-if="tagList.length">
              <el-tag
                v-for="t in tagList"
                :key="t"
                size="small"
                class="tag-item"
              >
                {{ t }}
              </el-tag>
            </template>
            <span v-else>—</span>
          </el-descriptions-item>
          <el-descriptions-item label="简介">
            <div class="desc-text">
              {{ detail.description || '—' }}
            </div>
          </el-descriptions-item>
        </el-descriptions>

        <h4 class="section-title">
          章节（{{ detail.chapters.length }}）
        </h4>
        <el-table
          :data="detail.chapters"
          size="small"
          stripe
          max-height="420"
        >
          <el-table-column
            prop="order_no"
            label="#"
            width="48"
          />
          <el-table-column
            prop="title"
            label="标题"
            min-width="120"
          />
          <el-table-column
            label="页码"
            width="88"
          >
            <template #default="{ row }">
              <span class="muted">{{ row.start_page ?? '—' }}–{{ row.end_page ?? '—' }}</span>
            </template>
          </el-table-column>
          <el-table-column
            label="正文"
            width="72"
            align="center"
          >
            <template #default="{ row }">
              {{ row.content_length }} 字
            </template>
          </el-table-column>
          <el-table-column
            type="expand"
          >
            <template #default="{ row }">
              <div class="expand-inner">
                <p class="expand-label">
                  摘要
                </p>
                <pre class="expand-pre">{{ row.content_summary || '（无）' }}</pre>
                <template v-if="row.content_full">
                  <p class="expand-label">
                    全文
                  </p>
                  <pre class="expand-pre expand-pre--full">{{ row.content_full }}</pre>
                </template>
              </div>
            </template>
          </el-table-column>
        </el-table>
      </template>
    </div>
  </el-drawer>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue';

import { bookApi } from '@/api/admin';
import type { AdminBookDetail } from '@/types/api';

const props = defineProps<{
  modelValue: boolean;
  bookId: string | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [boolean];
}>();

const loading = ref(false);
const detail = ref<AdminBookDetail | null>(null);

const tagList = computed(() => {
  const t = detail.value?.tags;
  if (Array.isArray(t)) return t.filter((x): x is string => typeof x === 'string');
  return [];
});

watch(
  () => props.bookId,
  () => {
    if (!props.modelValue) detail.value = null;
  },
);

async function onOpen(): Promise<void> {
  if (!props.bookId) return;
  loading.value = true;
  try {
    detail.value = await bookApi.detail(props.bookId, { include_chapter_full: 1 });
  } finally {
    loading.value = false;
  }
}

function statusLabel(s: number): string {
  if (s === 1) return '已上架';
  if (s === 0) return '已下架';
  return '已删除';
}
</script>

<style scoped lang="scss">
.preview {
  padding: 0 4px 16px;
}

.cover-row {
  display: flex;
  gap: 16px;
  margin-bottom: 16px;
}

.cover-box {
  width: 96px;
  height: 128px;
  border-radius: 8px;
  overflow: hidden;
  flex-shrink: 0;
  border: 1px solid var(--el-border-color-lighter);
  background: var(--el-fill-color-light);

  :deep(.el-image) {
    width: 100%;
    height: 100%;
  }
}

.cover-fallback {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  height: 100%;
  font-size: 28px;
  font-weight: 600;
  color: var(--el-color-primary);
}

.cover-meta {
  min-width: 0;
}

.title {
  font-weight: 600;
  font-size: 16px;
  margin: 0 0 6px;
  line-height: 1.35;
}

.meta-line {
  margin: 0 0 8px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.desc-block {
  margin-bottom: 16px;
}

.desc-text {
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.55;
}

.section-title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
}

.muted {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.tag-item {
  margin-right: 6px;
}

.expand-inner {
  padding: 8px 12px 12px;
  max-width: 100%;
}

.expand-label {
  margin: 0 0 6px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.expand-pre {
  margin: 0;
  padding: 10px 12px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 200px;
  overflow: auto;
}

.expand-pre--full {
  max-height: 320px;
}
</style>
