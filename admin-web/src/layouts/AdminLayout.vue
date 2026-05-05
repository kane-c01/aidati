<template>
  <el-container class="admin-layout">
    <el-aside
      :width="collapsed ? '64px' : '220px'"
      class="aside"
    >
      <div class="logo">
        <div class="logo-mark">
          AI
        </div>
        <span
          v-if="!collapsed"
          class="logo-text"
        >出题管理后台</span>
      </div>
      <el-menu
        :collapse="collapsed"
        :default-active="activeMenu"
        :unique-opened="true"
        background-color="#1f2329"
        text-color="#d6dadf"
        active-text-color="#ffffff"
        router
      >
        <el-menu-item index="/dashboard">
          <el-icon><Odometer /></el-icon>
          <template #title>
            工作台
          </template>
        </el-menu-item>
        <el-menu-item index="/books">
          <el-icon><Reading /></el-icon>
          <template #title>
            书籍管理
          </template>
        </el-menu-item>
        <el-menu-item index="/users">
          <el-icon><User /></el-icon>
          <template #title>
            用户管理
          </template>
        </el-menu-item>
        <el-menu-item index="/audits">
          <el-icon><Warning /></el-icon>
          <template #title>
            内容审核
          </template>
        </el-menu-item>
        <el-menu-item
          v-if="auth.isSuperAdmin"
          index="/configs"
        >
          <el-icon><Setting /></el-icon>
          <template #title>
            系统配置
          </template>
        </el-menu-item>
      </el-menu>
    </el-aside>

    <el-container>
      <el-header class="header">
        <div class="header-left">
          <el-button
            text
            :icon="collapsed ? Expand : Fold"
            @click="collapsed = !collapsed"
          />
          <el-breadcrumb separator="/">
            <el-breadcrumb-item :to="{ path: '/dashboard' }">
              后台
            </el-breadcrumb-item>
            <el-breadcrumb-item>{{ pageTitle }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>
        <div class="header-right">
          <el-tag
            v-if="auth.isSuperAdmin"
            type="danger"
            effect="dark"
            round
          >
            SUPER_ADMIN
          </el-tag>
          <el-tag
            v-else-if="auth.role === 'admin'"
            type="warning"
            effect="dark"
            round
          >
            ADMIN
          </el-tag>
          <el-dropdown
            trigger="click"
            @command="onCmd"
          >
            <span class="user-trigger">
              <el-avatar
                :src="auth.user?.avatar_url ?? undefined"
                :size="28"
              >
                {{ initial }}
              </el-avatar>
              <span class="user-name">{{ auth.displayName }}</span>
              <el-icon><ArrowDown /></el-icon>
            </span>
            <template #dropdown>
              <el-dropdown-menu>
                <el-dropdown-item command="refresh">
                  <el-icon><Refresh /></el-icon>刷新身份
                </el-dropdown-item>
                <el-dropdown-item
                  divided
                  command="logout"
                >
                  <el-icon><SwitchButton /></el-icon>退出登录
                </el-dropdown-item>
              </el-dropdown-menu>
            </template>
          </el-dropdown>
        </div>
      </el-header>

      <el-main class="main">
        <router-view />
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import {
  ArrowDown,
  Expand,
  Fold,
  Odometer,
  Reading,
  Refresh,
  Setting,
  SwitchButton,
  User,
  Warning,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const collapsed = ref(false);

const activeMenu = computed(() => {
  const m = (route.path.match(/^\/[\w-]+/) ?? ['/dashboard'])[0];
  return m;
});

const pageTitle = computed<string>(() => (route.meta?.title as string | undefined) ?? '工作台');

const initial = computed<string>(() => (auth.user?.nickname?.[0] ?? 'A').toUpperCase());

async function onCmd(cmd: string): Promise<void> {
  if (cmd === 'logout') {
    try {
      await ElMessageBox.confirm('确认退出登录?', '提示', { type: 'warning' });
    } catch {
      return;
    }
    await auth.logout();
    ElMessage.success('已退出');
    void router.replace('/login');
  } else if (cmd === 'refresh') {
    await auth.refreshMe();
    ElMessage.success('身份已刷新');
  }
}
</script>

<style scoped lang="scss">
.admin-layout {
  height: 100vh;
}

.aside {
  background: #1f2329;
  transition: width 0.2s ease;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.logo {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 16px;
  color: #fff;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.logo-mark {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  background: linear-gradient(135deg, #4f7cff 0%, #4ed1cf 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 14px;
}

.logo-text {
  font-size: 14px;
  font-weight: 600;
  white-space: nowrap;
}

.aside :deep(.el-menu) {
  border-right: none;
  flex: 1;
}

.header {
  background: #fff;
  border-bottom: 1px solid #e8eaee;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 56px;
  flex-shrink: 0;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 12px;
}

.user-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  font-size: 13px;
  color: #4a4a4a;
}

.user-name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.main {
  background-color: #fafaf7;
  padding: 24px 32px;
  overflow-y: auto;
}
</style>
