<template>
  <el-dialog
    :model-value="modelValue"
    :title="book ? `编辑书籍 #${book.id}` : '新建书籍'"
    width="640px"
    append-to-body
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <el-form
      ref="formRef"
      :model="form"
      :rules="rules"
      label-width="100px"
      label-position="right"
    >
      <el-form-item
        label="书名"
        prop="title"
      >
        <el-input
          v-model="form.title"
          maxlength="120"
        />
      </el-form-item>
      <el-form-item label="作者">
        <el-input
          v-model="form.author"
          maxlength="64"
        />
      </el-form-item>
      <el-form-item label="ISBN">
        <el-input
          v-model="form.isbn"
          maxlength="20"
        />
      </el-form-item>
      <el-form-item label="封面 URL">
        <el-input
          v-model="form.cover_url"
          placeholder="https://..."
        />
      </el-form-item>
      <el-form-item label="PDF URL">
        <el-input
          v-model="form.pdf_url"
          placeholder="https://..."
        />
      </el-form-item>
      <el-form-item label="版权">
        <el-select
          v-model="form.copyright_status"
          placeholder="未指定"
          clearable
        >
          <el-option
            label="公版"
            value="public_domain"
          />
          <el-option
            label="授权"
            value="licensed"
          />
          <el-option
            label="用户主张"
            value="user_claimed"
          />
          <el-option
            label="未知"
            value="unknown"
          />
        </el-select>
      </el-form-item>
      <el-form-item label="标签">
        <el-input
          v-model="tagsInput"
          placeholder="多个标签用 / 分隔, 例:Python/入门"
        />
      </el-form-item>
      <el-form-item label="简介">
        <el-input
          v-model="form.description"
          type="textarea"
          :rows="4"
          maxlength="2000"
        />
      </el-form-item>
      <el-form-item
        v-if="book"
        label="排序权重"
      >
        <el-input-number
          v-model="form.sort_weight"
          :min="-1000"
          :max="1000"
          :step="10"
        />
      </el-form-item>
    </el-form>

    <template #footer>
      <el-button @click="emit('update:modelValue', false)">
        取消
      </el-button>
      <el-button
        type="primary"
        :loading="submitting"
        @click="onSubmit"
      >
        保存
      </el-button>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { reactive, ref, watch } from 'vue';

import { bookApi } from '@/api/admin';
import type { AdminBookView, CreateBookPayload, UpdateBookPayload } from '@/types/api';

const props = defineProps<{
  modelValue: boolean;
  book: AdminBookView | null;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', v: boolean): void;
  (e: 'saved'): void;
}>();

interface BookForm {
  title: string;
  author?: string;
  isbn?: string;
  cover_url?: string;
  pdf_url?: string;
  copyright_status?: 'public_domain' | 'licensed' | 'user_claimed' | 'unknown';
  description?: string;
  sort_weight?: number;
}

const form = reactive<BookForm>({ title: '' });
const tagsInput = ref('');
const submitting = ref(false);
const formRef = ref<FormInstance>();

const rules: FormRules = {
  title: [{ required: true, message: '书名必填', trigger: 'blur' }],
};

watch(
  () => [props.modelValue, props.book] as const,
  ([visible, book]) => {
    if (!visible) return;
    if (book) {
      Object.assign(form, {
        title: book.title,
        author: book.author ?? '',
        isbn: book.isbn ?? '',
        cover_url: book.cover_url ?? '',
        pdf_url: book.pdf_url ?? '',
        copyright_status: (book.copyright_status as BookForm['copyright_status']) ?? undefined,
        description: book.description ?? '',
        sort_weight: book.sort_weight,
      });
      tagsInput.value = Array.isArray(book.tags) ? (book.tags as string[]).join('/') : '';
    } else {
      Object.assign(form, {
        title: '',
        author: '',
        isbn: '',
        cover_url: '',
        pdf_url: '',
        copyright_status: undefined,
        description: '',
        sort_weight: 0,
      });
      tagsInput.value = '';
    }
  },
  { immediate: true },
);

async function onSubmit(): Promise<void> {
  if (!formRef.value) return;
  const ok = await formRef.value.validate().catch(() => false);
  if (!ok) return;
  submitting.value = true;
  try {
    const tags = tagsInput.value
      .split('/')
      .map((s) => s.trim())
      .filter(Boolean);
    if (props.book) {
      const payload: UpdateBookPayload = {
        title: form.title,
        author: form.author || undefined,
        isbn: form.isbn || undefined,
        cover_url: form.cover_url || undefined,
        pdf_url: form.pdf_url || undefined,
        description: form.description || undefined,
        copyright_status: form.copyright_status,
        tags,
        sort_weight: form.sort_weight,
      };
      await bookApi.update(props.book.id, payload);
    } else {
      const payload: CreateBookPayload = {
        title: form.title,
        author: form.author || undefined,
        isbn: form.isbn || undefined,
        cover_url: form.cover_url || undefined,
        pdf_url: form.pdf_url || undefined,
        description: form.description || undefined,
        copyright_status: form.copyright_status,
        tags,
      };
      await bookApi.create(payload);
    }
    ElMessage.success('保存成功');
    emit('saved');
  } finally {
    submitting.value = false;
  }
}
</script>
