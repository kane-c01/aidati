<template>
  <div class="page">
    <header class="page-header">
      <div>
        <h2 class="title">
          用户管理
        </h2>
        <p class="subtitle">
          共 {{ pagination.total }} 个账户
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
        <el-form-item label="关键词">
          <el-input
            v-model="filter.keyword"
            clearable
            placeholder="昵称 / openid"
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
              label="正常"
              value="1"
            />
            <el-option
              label="封禁"
              value="0"
            />
            <el-option
              label="已注销"
              value="-1"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="角色">
          <el-select
            v-model="filter.role"
            style="width: 140px"
          >
            <el-option
              label="全部"
              value="all"
            />
            <el-option
              label="user"
              value="user"
            />
            <el-option
              label="admin"
              value="admin"
            />
            <el-option
              label="super_admin"
              value="super_admin"
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
    >
      <el-table-column
        type="index"
        width="56"
      />
      <el-table-column
        prop="nickname"
        label="昵称"
        width="160"
      >
        <template #default="{ row }">
          <span class="user-line">
            <el-avatar
              :src="row.avatar_url ?? undefined"
              :size="24"
            >{{ row.nickname?.[0] ?? 'A' }}</el-avatar>
            <span>{{ row.nickname ?? '(未设置)' }}</span>
          </span>
        </template>
      </el-table-column>
      <el-table-column
        prop="openid_masked"
        label="openid"
        width="200"
      />
      <el-table-column
        label="角色"
        width="120"
      >
        <template #default="{ row }">
          <el-tag
            v-if="row.role === 'super_admin'"
            type="danger"
            size="small"
          >
            SUPER
          </el-tag>
          <el-tag
            v-else-if="row.role === 'admin'"
            type="warning"
            size="small"
          >
            ADMIN
          </el-tag>
          <el-tag
            v-else
            type="info"
            size="small"
          >
            user
          </el-tag>
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
          >
            正常
          </el-tag>
          <el-tag
            v-else-if="row.status === 0"
            type="danger"
            size="small"
          >
            封禁
          </el-tag>
          <el-tag
            v-else
            type="info"
            size="small"
          >
            已注销
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column
        prop="last_login_at"
        label="最后登录"
        width="170"
      >
        <template #default="{ row }">
          {{ row.last_login_at ? format(row.last_login_at) : '-' }}
        </template>
      </el-table-column>
      <el-table-column
        prop="created_at"
        label="注册时间"
        width="170"
      >
        <template #default="{ row }">
          {{ format(row.created_at) }}
        </template>
      </el-table-column>
      <el-table-column
        label="操作"
        width="280"
        fixed="right"
      >
        <template #default="{ row }">
          <el-button
            text
            type="primary"
            size="small"
            @click="openDetail(row)"
          >
            详情
          </el-button>
          <el-button
            v-if="row.status === 1"
            text
            type="danger"
            size="small"
            @click="onBan(row)"
          >
            封禁
          </el-button>
          <el-button
            v-else-if="row.status === 0"
            text
            type="success"
            size="small"
            @click="onUnban(row)"
          >
            解封
          </el-button>
          <template v-if="auth.isSuperAdmin">
            <el-button
              v-if="row.role === 'user'"
              text
              type="warning"
              size="small"
              @click="onPromote(row)"
            >
              任命 admin
            </el-button>
            <el-button
              v-else-if="row.role === 'admin'"
              text
              size="small"
              @click="onDemote(row)"
            >
              免职
            </el-button>
            <el-button
              v-if="row.role === 'admin' || row.role === 'super_admin'"
              text
              type="primary"
              size="small"
              @click="openCredentialDialog(row)"
            >
              设密码
            </el-button>
          </template>
        </template>
      </el-table-column>
    </el-table>

    <!-- 设/重置后台账号密码弹框(super_admin) -->
    <el-dialog
      v-model="credentialVisible"
      :title="`设置后台账号密码 - ${credentialTarget?.nickname ?? credentialTarget?.id ?? ''}`"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-alert
        v-if="credentialTarget?.role !== 'super_admin' && credentialTarget?.role !== 'admin'"
        type="warning"
        show-icon
        :closable="false"
        title="只能给 admin / super_admin 设密码,先「任命 admin」再来"
        style="margin-bottom: 12px"
      />
      <el-form
        ref="credFormRef"
        :model="credForm"
        :rules="credRules"
        label-position="top"
      >
        <el-form-item
          label="账号(英数下划线连字符,2~64)"
          prop="username"
        >
          <el-input
            v-model="credForm.username"
            autocomplete="off"
          />
        </el-form-item>
        <el-form-item
          label="密码(≥ 6 位)"
          prop="password"
        >
          <el-input
            v-model="credForm.password"
            type="password"
            show-password
            autocomplete="new-password"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="credentialVisible = false">
          取消
        </el-button>
        <el-button
          type="primary"
          :loading="credSubmitting"
          @click="onCredentialSubmit"
        >
          保存
        </el-button>
      </template>
    </el-dialog>

    <el-pagination
      class="pagination"
      :current-page="pagination.page"
      :page-size="pagination.page_size"
      :total="pagination.total"
      layout="total, prev, pager, next, jumper"
      @current-change="handlePage"
    />

    <UserDetailDrawer
      v-model="detailVisible"
      :user-id="detailId"
      @changed="loadList"
    />
  </div>
</template>

<script setup lang="ts">
import { Refresh, Search } from '@element-plus/icons-vue';
import dayjs from 'dayjs';
import { ElMessage, ElMessageBox, type FormInstance } from 'element-plus';
import { onMounted, reactive, ref } from 'vue';

import { userApi } from '@/api/admin';
import { useAuthStore } from '@/stores/auth';
import type { AdminUserView } from '@/types/api';

import UserDetailDrawer from './_UserDetailDrawer.vue';

const auth = useAuthStore();

const loading = ref(false);
const rows = ref<AdminUserView[]>([]);
const pagination = reactive({ page: 1, page_size: 20, total: 0 });
const filter = reactive({
  keyword: '',
  status: 'all' as '1' | '0' | '-1' | 'all',
  role: 'all' as 'user' | 'admin' | 'super_admin' | 'all',
});

const detailVisible = ref(false);
const detailId = ref<string | null>(null);

async function loadList(): Promise<void> {
  loading.value = true;
  try {
    const res = await userApi.list({
      keyword: filter.keyword.trim() || undefined,
      status: filter.status,
      role: filter.role,
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
  filter.role = 'all';
  pagination.page = 1;
  void loadList();
}
function handlePage(p: number): void {
  pagination.page = p;
  void loadList();
}

function openDetail(row: AdminUserView): void {
  detailId.value = row.id;
  detailVisible.value = true;
}

async function onBan(row: AdminUserView): Promise<void> {
  try {
    const { value } = await ElMessageBox.prompt('请输入封禁原因', '封禁用户', {
      confirmButtonText: '封禁',
      confirmButtonClass: 'el-button--danger',
      inputPattern: /\S+/,
      inputErrorMessage: '原因必填',
    });
    await userApi.ban(row.id, String(value));
    ElMessage.success('已封禁');
    void loadList();
  } catch {
    /* cancel */
  }
}

async function onUnban(row: AdminUserView): Promise<void> {
  await userApi.unban(row.id);
  ElMessage.success('已解封');
  void loadList();
}

async function onPromote(row: AdminUserView): Promise<void> {
  try {
    await ElMessageBox.confirm(`确认任命 ${row.nickname ?? row.id} 为 admin?`, '任命', {
      type: 'warning',
    });
  } catch {
    return;
  }
  await userApi.promote(row.id);
  ElMessage.success('已任命');
  void loadList();
}

async function onDemote(row: AdminUserView): Promise<void> {
  try {
    await ElMessageBox.confirm(`确认免去 ${row.nickname ?? row.id} 的 admin 角色?`, '免职', {
      type: 'warning',
    });
  } catch {
    return;
  }
  await userApi.demote(row.id);
  ElMessage.success('已免职');
  void loadList();
}

// ===== 后台账号密码 =====
const credentialVisible = ref(false);
const credentialTarget = ref<AdminUserView | null>(null);
const credSubmitting = ref(false);
const credFormRef = ref<FormInstance>();
const credForm = reactive({ username: '', password: '' });
const credRules = {
  username: [
    { required: true, message: '请输入账号', trigger: 'blur' },
    {
      pattern: /^[A-Za-z0-9_-]{2,64}$/,
      message: '仅支持字母 / 数字 / _ / -, 长度 2~64',
      trigger: 'blur',
    },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 128, message: '密码 6~128 位', trigger: 'blur' },
  ],
};

function openCredentialDialog(row: AdminUserView): void {
  credentialTarget.value = row;
  credForm.username = '';
  credForm.password = '';
  credentialVisible.value = true;
}

async function onCredentialSubmit(): Promise<void> {
  if (!credentialTarget.value || !credFormRef.value) return;
  const ok = await credFormRef.value.validate().catch(() => false);
  if (!ok) return;
  credSubmitting.value = true;
  try {
    await userApi.setCredential(
      credentialTarget.value.id,
      credForm.username.trim(),
      credForm.password,
    );
    ElMessage.success('已保存,该账号现在可以用账号密码登录');
    credentialVisible.value = false;
    void loadList();
  } finally {
    credSubmitting.value = false;
  }
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
.user-line {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.pagination {
  margin-top: 16px;
  display: flex;
  justify-content: flex-end;
}
</style>
