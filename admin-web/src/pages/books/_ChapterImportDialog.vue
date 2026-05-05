<template>
  <el-dialog
    :model-value="modelValue"
    :title="`章节管理 - ${book?.title ?? ''}`"
    width="780px"
    append-to-body
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
    @open="loadChapters"
  >
    <el-tabs v-model="tab">
      <el-tab-pane
        label="现有章节"
        name="list"
      >
        <el-table
          v-loading="loading"
          :data="chapters"
          stripe
          size="small"
        >
          <el-table-column
            prop="order_no"
            label="#"
            width="60"
          />
          <el-table-column
            prop="title"
            label="标题"
          />
          <el-table-column
            prop="start_page"
            label="起页"
            width="70"
          />
          <el-table-column
            prop="end_page"
            label="止页"
            width="70"
          />
          <el-table-column
            label="正文"
            width="100"
          >
            <template #default="{ row }">
              <el-tag
                v-if="row.content_length > 0"
                size="small"
                type="success"
              >
                {{ row.content_length }} 字
              </el-tag>
              <el-tag
                v-else
                size="small"
                type="info"
              >
                空
              </el-tag>
            </template>
          </el-table-column>
        </el-table>
        <p
          v-if="chapters.length === 0 && !loading"
          class="empty"
        >
          暂无章节, 切到「批量导入」一键写入。
        </p>
      </el-tab-pane>

      <el-tab-pane
        label="批量导入"
        name="import"
      >
        <el-alert
          type="info"
          :closable="false"
          show-icon
          class="alert"
        >
          一行一章, 格式 <code>章号|标题|起页|止页|正文摘要</code>(后三段可省)。也支持粘贴 JSON 数组。
        </el-alert>
        <el-input
          v-model="raw"
          type="textarea"
          :rows="14"
          placeholder="例:
1|什么是函数|1|10|讲解函数定义与应用
2|极限|11|24
3|连续性"
        />
        <div class="opts">
          <el-checkbox v-model="replace">
            导入前清空现有章节
          </el-checkbox>
        </div>
      </el-tab-pane>
    </el-tabs>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">
        关闭
      </el-button>
      <el-button
        v-if="tab === 'import'"
        type="primary"
        :loading="importing"
        @click="onImport"
      >
        导入
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ElMessage } from 'element-plus';
import { ref } from 'vue';

import { bookApi } from '@/api/admin';
import type { AdminBookView, ChapterAdminView, ChapterImportItem } from '@/types/api';

const props = defineProps<{
  modelValue: boolean;
  book: AdminBookView | null;
}>();
const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'saved'): void;
}>();

const tab = ref<'list' | 'import'>('list');
const loading = ref(false);
const importing = ref(false);
const chapters = ref<ChapterAdminView[]>([]);
const raw = ref('');
const replace = ref(false);

async function loadChapters(): Promise<void> {
  if (!props.book) return;
  loading.value = true;
  try {
    const detail = await bookApi.detail(props.book.id);
    chapters.value = detail.chapters;
  } finally {
    loading.value = false;
  }
}

function parseRaw(): ChapterImportItem[] {
  const text = raw.value.trim();
  if (!text) return [];
  // 尝试 JSON 数组
  if (text.startsWith('[')) {
    try {
      const arr = JSON.parse(text) as ChapterImportItem[];
      if (Array.isArray(arr)) return arr;
    } catch {
      /* fallthrough */
    }
  }
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const parts = line.split('|').map((s) => s.trim());
      const item: ChapterImportItem = {
        order_no: parseInt(parts[0] ?? '0', 10),
        title: parts[1] ?? '',
      };
      if (parts[2]) {
        const n = parseInt(parts[2], 10);
        if (!isNaN(n)) item.start_page = n;
      }
      if (parts[3]) {
        const n = parseInt(parts[3], 10);
        if (!isNaN(n)) item.end_page = n;
      }
      if (parts[4]) item.content_summary = parts[4];
      return item;
    })
    .filter((c) => c.order_no > 0 && c.title.length > 0);
}

async function onImport(): Promise<void> {
  if (!props.book) return;
  const items = parseRaw();
  if (items.length === 0) {
    ElMessage.warning('未识别到任何章节, 请检查格式');
    return;
  }
  importing.value = true;
  try {
    const r = await bookApi.importChapters(props.book.id, {
      chapters: items,
      replace: replace.value,
    });
    ElMessage.success(`成功导入 ${r.imported} 章, 全书共 ${r.total} 章`);
    raw.value = '';
    replace.value = false;
    tab.value = 'list';
    await loadChapters();
    emit('saved');
  } finally {
    importing.value = false;
  }
}
</script>

<style scoped lang="scss">
.alert {
  margin-bottom: 12px;

  code {
    background: #f4f5f7;
    padding: 1px 6px;
    border-radius: 3px;
    color: #4f7cff;
  }
}
.opts {
  margin-top: 12px;
  display: flex;
  justify-content: flex-end;
}
.empty {
  text-align: center;
  color: #8c8c8c;
  font-size: 13px;
  padding: 24px 0;
}
</style>
