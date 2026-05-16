<template>
  <el-drawer
    :model-value="modelValue"
    :title="detail?.name || (detail ? `拍照集 #${detail.id}` : '拍照集详情')"
    direction="rtl"
    size="780px"
    append-to-body
    destroy-on-close
    @update:model-value="emit('update:modelValue', $event)"
    @open="onOpen"
  >
    <div
      v-loading="loading"
      class="ps"
    >
      <template v-if="detail">
        <el-descriptions
          :column="2"
          border
          size="small"
          class="meta"
        >
          <el-descriptions-item label="ID">
            {{ detail.id }}
          </el-descriptions-item>
          <el-descriptions-item label="用户">
            {{ detail.user_nickname || '—' }}（{{ detail.user_id }}）
          </el-descriptions-item>
          <el-descriptions-item label="OCR 状态">
            <el-tag
              size="small"
              :type="ocrTagType(detail.ocr_status)"
            >
              {{ ocrLabel(detail.ocr_status) }}
            </el-tag>
          </el-descriptions-item>
          <el-descriptions-item label="张数">
            {{ detail.total_pages }}
          </el-descriptions-item>
          <el-descriptions-item label="创建时间">
            {{ formatTime(detail.created_at) }}
          </el-descriptions-item>
          <el-descriptions-item label="过期时间">
            {{ formatTime(detail.expires_at) }}
          </el-descriptions-item>
          <el-descriptions-item
            label="聚合文本"
            :span="2"
          >
            <pre class="agg-text">{{ detail.ocr_text || '（暂无)' }}</pre>
          </el-descriptions-item>
        </el-descriptions>

        <h4 class="section-title">
          照片清单(共 {{ detail.photos.length }} 张)
        </h4>

        <div
          v-for="p in editing"
          :key="p.id"
          class="photo-card"
        >
          <div class="photo-card__head">
            <span class="photo-card__no">#{{ p.order_no }}</span>
            <span
              v-if="p.ocr_corrected"
              class="photo-card__tag photo-card__tag--ok"
            >已校对</span>
            <span
              v-else
              class="photo-card__tag"
            >未校对</span>
            <el-button
              link
              size="small"
              :loading="p._saving"
              :disabled="!p._dirty"
              @click="onSave(p)"
            >
              保存
            </el-button>
          </div>

          <div class="photo-card__body">
            <div class="photo-card__img-wrap">
              <img
                :ref="(el) => bindImgRef(p.id, el)"
                :src="p.image_url"
                class="photo-card__img"
                @load="onImgLoad(p.id)"
              >
              <div
                v-for="r in p.regions"
                :key="r.id"
                class="photo-card__rect"
                :class="`photo-card__rect--${r.kind}`"
                :style="rectStyle(p.id, r)"
                :title="`${kindLabel(r.kind)} · ${r.ocr_text || '(空)'}`"
              />
            </div>

            <div class="photo-card__form">
              <label class="photo-card__label">整图 OCR 文本</label>
              <el-input
                v-model="p.ocr_text"
                type="textarea"
                :rows="3"
                placeholder="(留空)"
                @input="markDirty(p)"
              />

              <label class="photo-card__label">
                框选区域(共 {{ p.regions.length }})
              </label>
              <div
                v-if="!p.regions.length"
                class="photo-card__empty"
              >
                暂无框选,可在小程序端框选后再来此校对
              </div>

              <div
                v-for="(r, idx) in p.regions"
                :key="r.id"
                class="region-row"
              >
                <div class="region-row__head">
                  <span class="region-row__no">{{ idx + 1 }}</span>
                  <el-select
                    v-model="r.kind"
                    size="small"
                    style="width: 110px"
                    @change="markDirty(p)"
                  >
                    <el-option
                      v-for="k in KINDS"
                      :key="k.value"
                      :label="k.label"
                      :value="k.value"
                    />
                  </el-select>
                  <el-tag
                    v-if="r.corrected"
                    type="success"
                    size="small"
                  >
                    已校对
                  </el-tag>
                  <el-button
                    link
                    type="primary"
                    size="small"
                    :loading="recognizing[`${p.id}:${r.id}`]"
                    @click="onRecognizeRegion(p, r)"
                  >
                    AI 识别
                  </el-button>
                  <el-button
                    link
                    type="danger"
                    size="small"
                    @click="onRemoveRegion(p, idx)"
                  >
                    删除
                  </el-button>
                </div>
                <el-input
                  v-if="r.kind !== 'chart'"
                  v-model="r.ocr_text"
                  type="textarea"
                  :rows="2"
                  placeholder="该区域识别文字 — 也可点「AI 识别」让模型自动填"
                  @input="r.corrected = 1; markDirty(p)"
                />
                <pre
                  v-else
                  class="chart-data"
                >{{ r.chart_data ? JSON.stringify(r.chart_data, null, 2) : '(尚未识别 — 点「AI 识别」让通义 VL 提取结构化数据)' }}</pre>
              </div>
            </div>
          </div>
        </div>
      </template>
    </div>

    <template #footer>
      <div class="drawer-footer">
        <el-button @click="emit('update:modelValue', false)">
          关闭
        </el-button>
        <el-button
          type="danger"
          plain
          @click="onDeleteSet"
        >
          删除整个拍照集
        </el-button>
        <el-button
          type="success"
          plain
          :disabled="detail?.ocr_status !== 'done'"
          :title="detail?.ocr_status !== 'done' ? 'OCR 未完成，请先完成识别和校对' : '将校对完成的拍照集保存为书籍'"
          @click="showSaveAsBook = true"
        >
          保存为书籍
        </el-button>
        <el-button
          type="primary"
          :loading="batchSaving"
          :disabled="!hasDirty"
          @click="onSaveAll"
        >
          一键保存全部({{ dirtyCount }})
        </el-button>
      </div>

      <!-- 保存为书籍弹窗 -->
      <el-dialog
        v-model="showSaveAsBook"
        title="将拍照集保存为书籍"
        width="480px"
        append-to-body
        :close-on-click-modal="false"
      >
        <el-form
          ref="bookFormRef"
          :model="bookForm"
          :rules="bookFormRules"
          label-width="80px"
        >
          <el-form-item
            label="书名"
            prop="title"
          >
            <el-input
              v-model="bookForm.title"
              maxlength="120"
              placeholder="给这本书起个名字"
            />
          </el-form-item>
          <el-form-item label="作者">
            <el-input
              v-model="bookForm.author"
              maxlength="64"
              placeholder="可选"
            />
          </el-form-item>
          <el-form-item label="简介">
            <el-input
              v-model="bookForm.description"
              type="textarea"
              :rows="3"
              maxlength="2000"
              placeholder="可选"
            />
          </el-form-item>
        </el-form>
        <el-alert
          type="info"
          :closable="false"
          show-icon
        >
          保存后 AI 将自动根据 OCR 文本拆分章节,过程约 1~2 分钟
        </el-alert>
        <template #footer>
          <el-button @click="showSaveAsBook = false">
            取消
          </el-button>
          <el-button
            type="primary"
            :loading="savingAsBook"
            @click="onSaveAsBook"
          >
            确认保存
          </el-button>
        </template>
      </el-dialog>
    </template>
  </el-drawer>
</template>

<script setup lang="ts">
import { ElMessage, ElMessageBox, type FormInstance, type FormRules } from 'element-plus';
import { computed, nextTick, reactive, ref, watch } from 'vue';

import { bookApi, photoSetApi } from '@/api/admin';
import type {
  AdminPhotoSetDetail,
  AdminPhotoView,
  OcrStatus,
  PhotoRegionKind,
  PhotoRegionView,
} from '@/types/api';

const props = defineProps<{
  modelValue: boolean;
  setId: string | null;
}>();

const emit = defineEmits<{
  'update:modelValue': [boolean];
  saved: [];
  deleted: [];
}>();

interface PhotoEdit extends AdminPhotoView {
  ocr_text: string;
  regions: PhotoRegionView[];
  _dirty: boolean;
  _saving: boolean;
}

const loading = ref(false);
const detail = ref<AdminPhotoSetDetail | null>(null);
const editing = ref<PhotoEdit[]>([]);
const batchSaving = ref(false);
const imgSizes = reactive<Record<string, { w: number; h: number }>>({});
const recognizing = reactive<Record<string, boolean>>({});

const KINDS: Array<{ value: PhotoRegionKind; label: string }> = [
  { value: 'text', label: '文字' },
  { value: 'formula', label: '公式' },
  { value: 'table', label: '表格' },
  { value: 'chart', label: '图表' },
];

const dirtyCount = computed(() => editing.value.filter((p) => p._dirty).length);
const hasDirty = computed(() => dirtyCount.value > 0);

const imgRefs: Record<string, HTMLImageElement> = {};

function bindImgRef(id: string, el: unknown): void {
  if (el && el instanceof HTMLImageElement) imgRefs[id] = el;
}

function onImgLoad(id: string): void {
  const el = imgRefs[id];
  if (!el) return;
  imgSizes[id] = { w: el.clientWidth, h: el.clientHeight };
}

function rectStyle(photoId: string, r: PhotoRegionView): Record<string, string> {
  const size = imgSizes[photoId] ?? { w: 0, h: 0 };
  if (r.coord === 'pixel' || size.w === 0 || size.h === 0) {
    return {
      left: `${r.bbox[0]}px`,
      top: `${r.bbox[1]}px`,
      width: `${r.bbox[2]}px`,
      height: `${r.bbox[3]}px`,
    };
  }
  return {
    left: `${r.bbox[0] * size.w}px`,
    top: `${r.bbox[1] * size.h}px`,
    width: `${r.bbox[2] * size.w}px`,
    height: `${r.bbox[3] * size.h}px`,
  };
}

watch(
  () => props.setId,
  () => {
    if (!props.modelValue) {
      detail.value = null;
      editing.value = [];
    }
  },
);

async function onOpen(): Promise<void> {
  if (!props.setId) return;
  loading.value = true;
  try {
    const d = await photoSetApi.detail(props.setId);
    detail.value = d;
    editing.value = d.photos.map((p) => ({
      ...p,
      ocr_text: p.ocr_text ?? '',
      regions: (p.regions ?? []).map((r) => ({ ...r })),
      _dirty: false,
      _saving: false,
    }));
    await nextTick();
  } catch (err) {
    ElMessage.error((err as Error).message || '加载失败');
  } finally {
    loading.value = false;
  }
}

function markDirty(p: PhotoEdit): void {
  p._dirty = true;
}

function onRemoveRegion(p: PhotoEdit, idx: number): void {
  p.regions.splice(idx, 1);
  markDirty(p);
}

async function onRecognizeRegion(p: PhotoEdit, r: PhotoRegionView): Promise<void> {
  const key = `${p.id}:${r.id}`;
  if (recognizing[key]) return;
  recognizing[key] = true;
  try {
    const fresh = await photoSetApi.recognizeRegion(p.id, r.id);
    // 用接口返回的 regions 覆盖该 photo
    p.regions = fresh.regions.map((x) => ({ ...x }));
    p.ocr_corrected = fresh.ocr_corrected;
    p._dirty = false;
    ElMessage.success(r.kind === 'chart' ? '图表已识别' : '已自动填入识别文字');
    emit('saved');
  } catch (err) {
    ElMessage.error((err as Error).message || '识别失败');
  } finally {
    recognizing[key] = false;
  }
}

async function onSave(p: PhotoEdit): Promise<void> {
  p._saving = true;
  try {
    const fresh = await photoSetApi.patchPhoto(p.id, {
      ocr_text: p.ocr_text,
      regions: p.regions,
    });
    p.ocr_corrected = fresh.ocr_corrected;
    p._dirty = false;
    ElMessage.success(`第 ${p.order_no} 张已保存`);
    emit('saved');
  } catch (err) {
    ElMessage.error((err as Error).message || '保存失败');
  } finally {
    p._saving = false;
  }
}

async function onSaveAll(): Promise<void> {
  const dirty = editing.value.filter((p) => p._dirty);
  if (!dirty.length) return;
  batchSaving.value = true;
  try {
    for (const p of dirty) {
      await onSave(p);
    }
  } finally {
    batchSaving.value = false;
  }
}

async function onDeleteSet(): Promise<void> {
  if (!detail.value) return;
  try {
    await ElMessageBox.confirm(
      `确认删除拍照集「${detail.value.name || '#' + detail.value.id}」及其全部 ${detail.value.total_pages} 张图?`,
      '删除确认',
      { type: 'warning' },
    );
  } catch {
    return;
  }
  try {
    await photoSetApi.remove(detail.value.id);
    ElMessage.success('已删除');
    emit('deleted');
  } catch (err) {
    ElMessage.error((err as Error).message || '删除失败');
  }
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

function kindLabel(k: PhotoRegionKind): string {
  if (k === 'text') return '文字';
  if (k === 'chart') return '图表';
  if (k === 'formula') return '公式';
  return '表格';
}

// ===== 保存为书籍 =====
const showSaveAsBook = ref(false);
const savingAsBook = ref(false);
const bookFormRef = ref<FormInstance>();
const bookForm = reactive({ title: '', author: '', description: '' });
const bookFormRules: FormRules = {
  title: [{ required: true, message: '书名必填', trigger: 'blur' }],
};

async function onSaveAsBook(): Promise<void> {
  if (!bookFormRef.value || !detail.value) return;
  const ok = await bookFormRef.value.validate().catch(() => false);
  if (!ok) return;

  savingAsBook.value = true;
  try {
    await bookApi.fromPhotoSet({
      photo_set_id: detail.value.id,
      title: bookForm.title,
      author: bookForm.author || undefined,
      description: bookForm.description || undefined,
    });
    ElMessage.success('书籍已创建,AI 正在拆分章节,请前往书籍管理查看');
    showSaveAsBook.value = false;
    bookForm.title = '';
    bookForm.author = '';
    bookForm.description = '';
    emit('saved');
  } catch (err) {
    ElMessage.error((err as Error).message || '保存失败');
  } finally {
    savingAsBook.value = false;
  }
}

function formatTime(s: string | null | undefined): string {
  if (!s) return '—';
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return s;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
</script>

<style scoped lang="scss">
.ps {
  padding: 0 4px 16px;
}

.meta {
  margin-bottom: 16px;
}

.agg-text {
  margin: 0;
  padding: 8px 10px;
  background: var(--el-fill-color-light);
  border-radius: 6px;
  font-size: 12px;
  line-height: 1.55;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 160px;
  overflow: auto;
}

.section-title {
  margin: 0 0 10px;
  font-size: 14px;
  font-weight: 600;
}

.photo-card {
  background: var(--el-bg-color-page);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  padding: 12px;
  margin-bottom: 16px;
}

.photo-card__head {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 10px;
  font-size: 13px;
}

.photo-card__no {
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.photo-card__tag {
  font-size: 11px;
  padding: 2px 10px;
  border-radius: 999px;
  background: var(--el-fill-color);
  color: var(--el-text-color-secondary);
}

.photo-card__tag--ok {
  background: var(--el-color-success-light-9);
  color: var(--el-color-success);
}

.photo-card__body {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 16px;
}

.photo-card__img-wrap {
  position: relative;
  width: 280px;
  border-radius: 6px;
  overflow: hidden;
  background: #000;
  align-self: start;
}

.photo-card__img {
  display: block;
  width: 100%;
  height: auto;
}

.photo-card__rect {
  position: absolute;
  box-sizing: border-box;
  border: 2px solid #5b5bd6;
  background-color: rgba(91, 91, 214, 0.16);
  border-radius: 3px;
  pointer-events: none;
}

.photo-card__rect--text {
  border-color: #5b5bd6;
  background-color: rgba(91, 91, 214, 0.16);
}
.photo-card__rect--chart {
  border-color: #d97706;
  background-color: rgba(217, 119, 6, 0.18);
}
.photo-card__rect--formula {
  border-color: #0d9488;
  background-color: rgba(13, 148, 136, 0.18);
}
.photo-card__rect--table {
  border-color: #7c3aed;
  background-color: rgba(124, 58, 237, 0.18);
}

.photo-card__form {
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}

.photo-card__label {
  font-size: 12px;
  font-weight: 500;
  color: var(--el-text-color-secondary);
  margin-top: 6px;
}

.photo-card__empty {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  padding: 8px 10px;
  border: 1px dashed var(--el-border-color);
  border-radius: 6px;
  text-align: center;
}

.region-row {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 6px;
  padding: 8px;
  margin-bottom: 8px;
  background: var(--el-fill-color-blank);
}

.region-row__head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.region-row__no {
  font-weight: 600;
  font-size: 12px;
  width: 18px;
  color: var(--el-text-color-primary);
}

.chart-data {
  margin: 0;
  padding: 8px;
  background: var(--el-color-warning-light-9);
  border-radius: 4px;
  font-size: 11px;
  line-height: 1.5;
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 160px;
  overflow: auto;
}

.drawer-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  width: 100%;
}
</style>
