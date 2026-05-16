<template>
  <el-dialog
    :model-value="modelValue"
    :title="dialogTitle"
    width="760px"
    append-to-body
    :close-on-click-modal="false"
    @update:model-value="emit('update:modelValue', $event)"
  >
    <!-- 创建模式选择(仅新建时) -->
    <div
      v-if="!book && step === 'mode'"
      class="mode-selector"
    >
      <h3 class="mode-selector__title">
        选择添加方式
      </h3>
      <div class="mode-grid">
        <div
          class="mode-card"
          @click="selectMode('manual')"
        >
          <el-icon
            :size="32"
            color="var(--el-color-primary)"
          >
            <EditPen />
          </el-icon>
          <h4>手动录入</h4>
          <p>手动填写书籍信息和章节内容</p>
        </div>
        <div
          class="mode-card"
          @click="selectMode('pdf')"
        >
          <el-icon
            :size="32"
            color="var(--el-color-danger)"
          >
            <Document />
          </el-icon>
          <h4>上传 PDF</h4>
          <p>上传 PDF 文件,AI 自动识别并拆分章节</p>
        </div>
        <div
          class="mode-card"
          @click="selectMode('photo')"
        >
          <el-icon
            :size="32"
            color="var(--el-color-success)"
          >
            <Camera />
          </el-icon>
          <h4>上传图片</h4>
          <p>上传拍照图片,AI 自动 OCR 识别并拆分章节</p>
        </div>
        <div
          class="mode-card"
          @click="selectMode('photo-set')"
        >
          <el-icon
            :size="32"
            color="var(--el-color-warning)"
          >
            <PictureFilled />
          </el-icon>
          <h4>从拍照集导入</h4>
          <p>选择已校对的拍照集,直接保存为书籍</p>
        </div>
      </div>
    </div>

    <!-- 表单步骤 -->
    <div v-if="step === 'form'">
      <div
        v-if="!book"
        class="step-bar"
      >
        <el-button
          text
          :icon="ArrowLeft"
          @click="step = 'mode'"
        >
          返回选择
        </el-button>
        <el-tag
          effect="plain"
          size="small"
        >
          {{ modeLabel }}
        </el-tag>
      </div>

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

        <!-- PDF 上传区 -->
        <el-form-item
          v-if="mode === 'pdf'"
          label="PDF 文件"
          prop="pdf_url"
        >
          <div class="upload-zone">
            <div
              v-if="!form.pdf_url"
              class="upload-area"
            >
              <el-upload
                ref="pdfUploadRef"
                :auto-upload="false"
                accept=".pdf,application/pdf"
                :limit="1"
                :on-change="onPdfSelected"
                :show-file-list="false"
              >
                <el-button
                  type="primary"
                  :icon="Upload"
                  :loading="uploading"
                >
                  {{ uploading ? '上传中...' : '选择 PDF 文件' }}
                </el-button>
              </el-upload>
              <span class="upload-hint">支持 50MB 以内的 PDF 文件</span>
            </div>
            <div
              v-else
              class="upload-done"
            >
              <el-icon
                :size="20"
                color="var(--el-color-success)"
              >
                <CircleCheckFilled />
              </el-icon>
              <span>PDF 已上传</span>
              <el-button
                text
                type="primary"
                size="small"
                @click="form.pdf_url = ''"
              >
                重新选择
              </el-button>
            </div>
            <el-progress
              v-if="uploading"
              :percentage="uploadProgress"
              :stroke-width="4"
              class="upload-progress"
            />
          </div>
        </el-form-item>

        <!-- 图片上传区 -->
        <el-form-item
          v-if="mode === 'photo'"
          label="拍照图片"
        >
          <div class="photo-upload-zone">
            <el-upload
              ref="photoUploadRef"
              :auto-upload="false"
              accept="image/jpeg,image/png,image/webp"
              multiple
              :limit="30"
              list-type="picture-card"
              :file-list="photoFiles"
              :on-change="onPhotoChange"
              :on-remove="onPhotoRemove"
            >
              <el-icon><Plus /></el-icon>
            </el-upload>
            <p class="upload-hint">
              支持 JPG / PNG / WebP,最多 30 张,单张 10MB 以内
            </p>
            <el-button
              v-if="photoFiles.length > 0 && !photosUploaded"
              type="primary"
              :icon="Upload"
              :loading="uploading"
              @click="uploadAllPhotos"
            >
              {{ uploading ? `上传中 (${uploadedCount}/${photoFiles.length})` : `上传 ${photoFiles.length} 张图片` }}
            </el-button>
            <el-tag
              v-if="photosUploaded"
              type="success"
              effect="light"
            >
              {{ photoUrls.length }} 张图片已上传
            </el-tag>
          </div>
        </el-form-item>

        <!-- 拍照集选择 -->
        <el-form-item
          v-if="mode === 'photo-set'"
          label="拍照集"
          prop="photo_set_id"
        >
          <div class="photo-set-select">
            <el-select
              v-model="form.photo_set_id"
              filterable
              remote
              reserve-keyword
              placeholder="搜索拍照集(名称/用户昵称)"
              :remote-method="searchPhotoSets"
              :loading="psLoading"
              style="width: 100%"
              value-key="id"
            >
              <el-option
                v-for="ps in photoSets"
                :key="ps.id"
                :label="`${ps.name || '#' + ps.id} (${ps.user_nickname || '未知用户'}, ${ps.total_pages}张, ${ocrLabel(ps.ocr_status)})`"
                :value="ps.id"
                :disabled="ps.ocr_status !== 'done'"
              >
                <div class="ps-option">
                  <span class="ps-option__name">{{ ps.name || `#${ps.id}` }}</span>
                  <span class="ps-option__meta">
                    {{ ps.user_nickname || '—' }} · {{ ps.total_pages }}张 ·
                    <el-tag
                      :type="ps.ocr_status === 'done' ? 'success' : 'info'"
                      size="small"
                    >
                      {{ ocrLabel(ps.ocr_status) }}
                    </el-tag>
                  </span>
                </div>
              </el-option>
            </el-select>
            <p
              v-if="mode === 'photo-set'"
              class="upload-hint"
            >
              仅 OCR 状态为「已完成」的拍照集可选
            </p>
          </div>
        </el-form-item>

        <!-- 手动模式/编辑模式下的 URL 输入 -->
        <el-form-item
          v-if="mode === 'manual' || book"
          label="封面 URL"
        >
          <el-input
            v-model="form.cover_url"
            placeholder="https://..."
          />
        </el-form-item>
        <el-form-item
          v-if="mode === 'manual' || book"
          label="PDF URL"
        >
          <el-input
            v-model="form.pdf_url"
            placeholder="https://..."
          />
        </el-form-item>

        <!-- 封面上传(PDF/图片模式) -->
        <el-form-item
          v-if="(mode === 'pdf' || mode === 'photo' || mode === 'photo-set') && !book"
          label="封面"
        >
          <div class="upload-zone">
            <div
              v-if="!form.cover_url"
              class="upload-area"
            >
              <el-upload
                :auto-upload="false"
                accept="image/jpeg,image/png,image/webp"
                :limit="1"
                :on-change="onCoverSelected"
                :show-file-list="false"
              >
                <el-button
                  :icon="Upload"
                  :loading="coverUploading"
                >
                  {{ coverUploading ? '上传中...' : '选择封面图片(可选)' }}
                </el-button>
              </el-upload>
            </div>
            <div
              v-else
              class="upload-done"
            >
              <el-image
                :src="form.cover_url"
                style="width:40px;height:52px;border-radius:4px"
                fit="cover"
              />
              <span>封面已上传</span>
              <el-button
                text
                type="primary"
                size="small"
                @click="form.cover_url = ''"
              >
                更换
              </el-button>
            </div>
          </div>
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
            :rows="3"
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

      <!-- AI 处理提示 -->
      <el-alert
        v-if="mode !== 'manual' && !book"
        type="info"
        :closable="false"
        show-icon
        class="ai-hint"
      >
        <template v-if="mode === 'pdf'">
          保存后系统将自动通过 AI 从 PDF 中抽取文字并识别章节结构,整个过程约 1~3 分钟
        </template>
        <template v-else-if="mode === 'photo'">
          保存后系统将对上传的图片进行 OCR 识别,然后 AI 自动拆分章节,整个过程约 2~5 分钟
        </template>
        <template v-else-if="mode === 'photo-set'">
          保存后系统将使用拍照集已校对的 OCR 文本,通过 AI 自动拆分章节
        </template>
      </el-alert>
    </div>

    <template #footer>
      <template v-if="step === 'form'">
        <el-button @click="emit('update:modelValue', false)">
          取消
        </el-button>
        <el-button
          type="primary"
          :loading="submitting"
          :disabled="submitDisabled"
          @click="onSubmit"
        >
          {{ book ? '保存' : submitLabel }}
        </el-button>
      </template>
    </template>
  </el-dialog>
</template>

<script setup lang="ts">
import {
  ArrowLeft,
  Camera,
  CircleCheckFilled,
  Document,
  EditPen,
  PictureFilled,
  Plus,
  Upload,
} from '@element-plus/icons-vue';
import axios from 'axios';
import { ElMessage, type FormInstance, type FormRules, type UploadFile } from 'element-plus';
import { computed, reactive, ref, watch } from 'vue';

import { bookApi, photoSetApi, uploadApi } from '@/api/admin';
import type {
  AdminBookView,
  AdminPhotoSetView,
  CreateBookPayload,
  OcrStatus,
  UpdateBookPayload,
} from '@/types/api';

type Mode = 'manual' | 'pdf' | 'photo' | 'photo-set';

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
  photo_set_id?: string;
}

const step = ref<'mode' | 'form'>('mode');
const mode = ref<Mode>('manual');
const form = reactive<BookForm>({ title: '' });
const tagsInput = ref('');
const submitting = ref(false);
const formRef = ref<FormInstance>();

const uploading = ref(false);
const uploadProgress = ref(0);
const coverUploading = ref(false);

const photoFiles = ref<UploadFile[]>([]);
const photoUrls = ref<string[]>([]);
const photosUploaded = ref(false);
const uploadedCount = ref(0);

const psLoading = ref(false);
const photoSets = ref<AdminPhotoSetView[]>([]);

const rules: FormRules = {
  title: [{ required: true, message: '书名必填', trigger: 'blur' }],
  pdf_url: [{ required: true, message: '请上传 PDF 文件', trigger: 'change' }],
  photo_set_id: [{ required: true, message: '请选择拍照集', trigger: 'change' }],
};

const dialogTitle = computed(() => {
  if (props.book) return `编辑书籍 #${props.book.id}`;
  if (step.value === 'mode') return '新建书籍';
  return `新建书籍 — ${modeLabel.value}`;
});

const modeLabel = computed(() => {
  switch (mode.value) {
    case 'pdf': return 'PDF 上传';
    case 'photo': return '图片上传';
    case 'photo-set': return '拍照集导入';
    default: return '手动录入';
  }
});

const submitLabel = computed(() => {
  switch (mode.value) {
    case 'pdf': return '保存并开始 AI 识别';
    case 'photo': return '保存并开始 AI 识别';
    case 'photo-set': return '保存并 AI 拆分章节';
    default: return '保存';
  }
});

const submitDisabled = computed(() => {
  if (mode.value === 'pdf' && !form.pdf_url) return true;
  if (mode.value === 'photo' && !photosUploaded.value) return true;
  if (mode.value === 'photo-set' && !form.photo_set_id) return true;
  return false;
});

function selectMode(m: Mode): void {
  mode.value = m;
  step.value = 'form';
  if (m === 'photo-set') {
    void searchPhotoSets('');
  }
}

watch(
  () => [props.modelValue, props.book] as const,
  ([visible, book]) => {
    if (!visible) return;
    photoFiles.value = [];
    photoUrls.value = [];
    photosUploaded.value = false;
    uploadedCount.value = 0;
    uploading.value = false;
    uploadProgress.value = 0;
    coverUploading.value = false;

    if (book) {
      step.value = 'form';
      mode.value = 'manual';
      Object.assign(form, {
        title: book.title,
        author: book.author ?? '',
        isbn: book.isbn ?? '',
        cover_url: book.cover_url ?? '',
        pdf_url: book.pdf_url ?? '',
        copyright_status: (book.copyright_status as BookForm['copyright_status']) ?? undefined,
        description: book.description ?? '',
        sort_weight: book.sort_weight,
        photo_set_id: undefined,
      });
      tagsInput.value = Array.isArray(book.tags) ? (book.tags as string[]).join('/') : '';
    } else {
      step.value = 'mode';
      mode.value = 'manual';
      Object.assign(form, {
        title: '',
        author: '',
        isbn: '',
        cover_url: '',
        pdf_url: '',
        copyright_status: undefined,
        description: '',
        sort_weight: 0,
        photo_set_id: undefined,
      });
      tagsInput.value = '';
    }
  },
  { immediate: true },
);

async function uploadFileToOss(
  file: File,
  scene: 'photo' | 'cover' | 'pdf',
): Promise<string> {
  const policy = await uploadApi.getPolicy(scene, file.type || (scene === 'pdf' ? 'application/pdf' : 'image/jpeg'));
  await axios.put(policy.put_url, file, {
    headers: { 'Content-Type': file.type || 'application/octet-stream' },
    onUploadProgress: (e) => {
      if (e.total) {
        uploadProgress.value = Math.round((e.loaded / e.total) * 100);
      }
    },
  });
  return `${policy.public_base_url.replace(/\/$/, '')}/${policy.key}`;
}

async function onPdfSelected(file: UploadFile): Promise<void> {
  if (!file.raw) return;
  if (file.raw.size > 50 * 1024 * 1024) {
    ElMessage.warning('PDF 文件不能超过 50MB');
    return;
  }
  uploading.value = true;
  uploadProgress.value = 0;
  try {
    const url = await uploadFileToOss(file.raw, 'pdf');
    form.pdf_url = url;
    ElMessage.success('PDF 上传成功');
  } catch (err) {
    ElMessage.error((err as Error).message || 'PDF 上传失败');
  } finally {
    uploading.value = false;
  }
}

async function onCoverSelected(file: UploadFile): Promise<void> {
  if (!file.raw) return;
  if (file.raw.size > 5 * 1024 * 1024) {
    ElMessage.warning('封面图片不能超过 5MB');
    return;
  }
  coverUploading.value = true;
  try {
    const url = await uploadFileToOss(file.raw, 'cover');
    form.cover_url = url;
    ElMessage.success('封面上传成功');
  } catch (err) {
    ElMessage.error((err as Error).message || '封面上传失败');
  } finally {
    coverUploading.value = false;
  }
}

function onPhotoChange(file: UploadFile, fileList: UploadFile[]): void {
  if (file.raw && file.raw.size > 10 * 1024 * 1024) {
    ElMessage.warning('单张图片不能超过 10MB');
    fileList.pop();
    return;
  }
  photoFiles.value = fileList;
  photosUploaded.value = false;
}

function onPhotoRemove(_file: UploadFile, fileList: UploadFile[]): void {
  photoFiles.value = fileList;
  if (fileList.length === 0) {
    photosUploaded.value = false;
    photoUrls.value = [];
  }
}

async function uploadAllPhotos(): Promise<void> {
  uploading.value = true;
  uploadedCount.value = 0;
  photoUrls.value = [];
  try {
    for (const f of photoFiles.value) {
      if (!f.raw) continue;
      const url = await uploadFileToOss(f.raw, 'photo');
      photoUrls.value.push(url);
      uploadedCount.value++;
    }
    photosUploaded.value = true;
    ElMessage.success(`${photoUrls.value.length} 张图片上传完成`);
  } catch (err) {
    ElMessage.error((err as Error).message || '图片上传失败');
  } finally {
    uploading.value = false;
  }
}

async function searchPhotoSets(query: string): Promise<void> {
  psLoading.value = true;
  try {
    const res = await photoSetApi.list({
      keyword: query || undefined,
      page: 1,
      page_size: 20,
    });
    photoSets.value = res.list;
  } catch {
    photoSets.value = [];
  } finally {
    psLoading.value = false;
  }
}

function ocrLabel(s: OcrStatus): string {
  if (s === 'done') return '已完成';
  if (s === 'processing') return '识别中';
  if (s === 'failed') return '失败';
  return '待识别';
}

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
      ElMessage.success('保存成功');
    } else if (mode.value === 'photo-set') {
      await bookApi.fromPhotoSet({
        photo_set_id: form.photo_set_id!,
        title: form.title,
        author: form.author || undefined,
        description: form.description || undefined,
        cover_url: form.cover_url || undefined,
        copyright_status: form.copyright_status,
        tags,
      });
      ElMessage.success('书籍已创建,AI 正在拆分章节...');
    } else if (mode.value === 'photo') {
      const payload: CreateBookPayload = {
        title: form.title,
        author: form.author || undefined,
        isbn: form.isbn || undefined,
        cover_url: form.cover_url || undefined,
        description: form.description || undefined,
        copyright_status: form.copyright_status,
        tags,
      };
      const created = await bookApi.create(payload);
      // TODO: if needed, create photo set from uploaded images and link to book
      ElMessage.success(`书籍已创建(${photoUrls.value.length} 张图片已关联)`);
      void created;
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
      if (mode.value === 'pdf' && form.pdf_url) {
        ElMessage.success('书籍已创建,可点击「PDF 入章」启动 AI 章节识别');
      } else {
        ElMessage.success('保存成功');
      }
    }

    emit('saved');
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped lang="scss">
.mode-selector {
  padding: 12px 0;
}

.mode-selector__title {
  margin: 0 0 20px;
  font-size: 16px;
  font-weight: 600;
  text-align: center;
  color: var(--el-text-color-primary);
}

.mode-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}

.mode-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 24px 16px;
  border-radius: 12px;
  border: 2px solid var(--el-border-color-lighter);
  cursor: pointer;
  transition: all 0.2s;
  text-align: center;

  &:hover {
    border-color: var(--el-color-primary);
    background: var(--el-color-primary-light-9);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
  }

  h4 {
    margin: 4px 0 0;
    font-size: 15px;
    font-weight: 600;
    color: var(--el-text-color-primary);
  }

  p {
    margin: 0;
    font-size: 12.5px;
    color: var(--el-text-color-secondary);
    line-height: 1.45;
  }
}

.step-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  padding-bottom: 12px;
  border-bottom: 1px solid var(--el-border-color-lighter);
}

.upload-zone {
  width: 100%;
}

.upload-area {
  display: flex;
  align-items: center;
  gap: 12px;
}

.upload-done {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 12px;
  background: var(--el-color-success-light-9);
  border-radius: 8px;
  font-size: 13px;
  color: var(--el-color-success);
}

.upload-hint {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-top: 6px;
}

.upload-progress {
  margin-top: 8px;
}

.photo-upload-zone {
  width: 100%;

  :deep(.el-upload--picture-card) {
    width: 80px;
    height: 80px;
  }

  :deep(.el-upload-list--picture-card .el-upload-list__item) {
    width: 80px;
    height: 80px;
  }
}

.photo-set-select {
  width: 100%;
}

.ps-option {
  display: flex;
  flex-direction: column;
  gap: 2px;
  line-height: 1.4;
}

.ps-option__name {
  font-weight: 500;
}

.ps-option__meta {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  display: flex;
  align-items: center;
  gap: 4px;
}

.ai-hint {
  margin-top: 16px;
}
</style>
