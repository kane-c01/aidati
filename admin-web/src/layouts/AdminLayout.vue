<template>
  <el-container class="admin-layout">
    <!-- ========== 侧边栏 ========== -->
    <el-aside
      :width="collapsed ? '72px' : '232px'"
      class="aside"
      :class="{ 'aside--collapsed': collapsed }"
    >
      <!-- Logo -->
      <div class="brand">
        <div class="brand__mark">
          AQ
        </div>
        <div
          v-if="!collapsed"
          class="brand__text"
        >
          <div class="brand__title">
            考题魔盒
          </div>
          <div class="brand__sub">
            管理控制台
          </div>
        </div>
      </div>

      <!-- 导航分组 -->
      <div class="nav">
        <template
          v-for="group in navGroups"
          :key="group.title"
        >
          <div
            v-if="!collapsed && group.show !== false"
            class="nav__group-title"
          >
            {{ group.title }}
          </div>
          <a
            v-for="item in group.items.filter((i) => i.show !== false)"
            :key="item.path"
            class="nav__item"
            :class="{ 'nav__item--active': activePath === item.path }"
            @click="$router.push(item.path)"
          >
            <el-icon class="nav__icon">
              <component :is="item.icon" />
            </el-icon>
            <span
              v-if="!collapsed"
              class="nav__label"
            >{{ item.label }}</span>
            <el-tooltip
              v-if="collapsed"
              :content="item.label"
              placement="right"
            />
            <el-badge
              v-if="!collapsed && item.badge && item.badge > 0"
              :value="item.badge"
              :max="99"
              class="nav__badge"
            />
          </a>
        </template>
      </div>

      <!-- 底部:用户迷你卡 -->
      <div class="aside-footer">
        <el-dropdown
          v-if="!collapsed"
          trigger="click"
          placement="top-start"
          @command="onCmd"
        >
          <div class="user-mini">
            <el-avatar
              :src="auth.user?.avatar_url ?? undefined"
              :size="32"
            >
              {{ initial }}
            </el-avatar>
            <div class="user-mini__meta">
              <div class="user-mini__name">
                {{ auth.displayName }}
              </div>
              <div class="user-mini__role">
                {{ roleLabel }}
              </div>
            </div>
            <el-icon class="user-mini__more">
              <MoreFilled />
            </el-icon>
          </div>
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

        <el-tooltip
          v-else
          :content="auth.displayName"
          placement="right"
        >
          <el-avatar
            :src="auth.user?.avatar_url ?? undefined"
            :size="32"
            class="user-mini__avatar-collapsed"
          >
            {{ initial }}
          </el-avatar>
        </el-tooltip>
      </div>
    </el-aside>

    <!-- ========== 主内容区 ========== -->
    <el-container class="main-wrap">
      <el-header class="topbar">
        <div class="topbar__left">
          <el-button
            text
            class="topbar__collapse"
            :icon="collapsed ? Expand : Fold"
            @click="collapsed = !collapsed"
          />
          <el-breadcrumb
            separator="/"
            class="topbar__crumb"
          >
            <el-breadcrumb-item :to="{ path: '/dashboard' }">
              控制台
            </el-breadcrumb-item>
            <el-breadcrumb-item>{{ pageTitle }}</el-breadcrumb-item>
          </el-breadcrumb>
        </div>

        <div class="topbar__right">
          <!-- 通知铃铛 -->
          <el-popover
            placement="bottom-end"
            :width="320"
            trigger="click"
            popper-class="bell-popover"
          >
            <template #reference>
              <el-badge
                :value="totalPending"
                :hidden="totalPending === 0"
                :max="99"
                class="bell-badge"
              >
                <el-button
                  text
                  circle
                  class="topbar__icon-btn"
                  :icon="Bell"
                />
              </el-badge>
            </template>
            <div class="bell-list">
              <div class="bell-list__head">
                待办与风险
              </div>
              <div class="bell-list__body">
                <div
                  v-for="row in pendingRows"
                  :key="row.label"
                  class="bell-row"
                  :class="`bell-row--${row.tone}`"
                >
                  <span
                    class="bell-row__dot"
                    :class="`bell-row__dot--${row.tone}`"
                  />
                  <span class="bell-row__label">{{ row.label }}</span>
                  <span class="bell-row__value">{{ row.value }}</span>
                </div>
                <div
                  v-if="!hasPending"
                  class="bell-empty"
                >
                  暂无待办,平台运行良好
                </div>
              </div>
              <div class="bell-list__foot">
                <el-button
                  text
                  type="primary"
                  size="small"
                  @click="$router.push('/dashboard')"
                >
                  前往工作台 →
                </el-button>
              </div>
            </div>
          </el-popover>

          <!-- 角色徽章 -->
          <el-tag
            v-if="auth.isSuperAdmin"
            type="danger"
            effect="plain"
            round
            class="role-chip"
          >
            SUPER ADMIN
          </el-tag>
          <el-tag
            v-else-if="auth.role === 'admin'"
            type="warning"
            effect="plain"
            round
            class="role-chip"
          >
            ADMIN
          </el-tag>

          <!-- 用户下拉(顶栏快捷) -->
          <el-dropdown
            trigger="click"
            @command="onCmd"
          >
            <span class="user-trigger">
              <el-avatar
                :src="auth.user?.avatar_url ?? undefined"
                :size="30"
              >
                {{ initial }}
              </el-avatar>
              <span class="user-trigger__name">{{ auth.displayName }}</span>
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
        <router-view v-slot="{ Component }">
          <transition
            name="fade-up"
            mode="out-in"
          >
            <component :is="Component" />
          </transition>
        </router-view>
      </el-main>
    </el-container>
  </el-container>
</template>

<script setup lang="ts">
import {
  ArrowDown,
  Bell,
  Camera,
  Expand,
  Fold,
  MoreFilled,
  Odometer,
  Reading,
  Refresh,
  Setting,
  SwitchButton,
  User,
  Warning,
} from '@element-plus/icons-vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, onMounted, ref, type Component as VueComponent } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { dashboardApi } from '@/api/admin';
import { useAuthStore } from '@/stores/auth';
import type { AdminDashboard } from '@/types/api';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();

const collapsed = ref(false);

interface NavItem {
  path: string;
  label: string;
  icon: VueComponent;
  badge?: number;
  show?: boolean;
}

interface NavGroup {
  title: string;
  items: NavItem[];
  show?: boolean;
}

// === 顶栏徽标 / 通知:复用 dashboard 数据 ===
const dashData = ref<AdminDashboard | null>(null);

async function loadDashboard(): Promise<void> {
  try {
    dashData.value = await dashboardApi.get();
  } catch {
    /* 顶栏徽标失败不阻塞 */
  }
}
onMounted(loadDashboard);

const totalPending = computed<number>(() => {
  const p = dashData.value?.pending;
  if (!p) return 0;
  return (
    (p.moderation_block_24h ?? 0) +
    (p.book_uploads_pending ?? 0) +
    (p.reports_pending ?? 0) +
    (p.appeals_pending ?? 0)
  );
});
const hasPending = computed<boolean>(() => totalPending.value > 0);

const pendingRows = computed<{ label: string; value: number; tone: 'danger' | 'warning' | 'info' }[]>(() => {
  const p = dashData.value?.pending;
  return [
    { label: '24h 内容拦截', value: p?.moderation_block_24h ?? 0, tone: 'danger' },
    { label: '7d 内容拦截', value: p?.moderation_block_7d ?? 0, tone: 'warning' },
    { label: '待审用户书籍', value: p?.book_uploads_pending ?? 0, tone: 'info' },
    { label: '待处理举报', value: p?.reports_pending ?? 0, tone: 'info' },
    { label: '待处理申诉', value: p?.appeals_pending ?? 0, tone: 'info' },
  ];
});

const navGroups = computed<NavGroup[]>(() => [
  {
    title: '数据中心',
    items: [
      { path: '/dashboard', label: '工作台', icon: Odometer },
    ],
  },
  {
    title: '内容运营',
    items: [
      { path: '/books', label: '书籍管理', icon: Reading },
      { path: '/photos', label: '拍照集', icon: Camera },
      { path: '/users', label: '用户管理', icon: User },
      {
        path: '/audits',
        label: '内容审核',
        icon: Warning,
        badge: dashData.value?.pending?.moderation_block_24h ?? 0,
      },
    ],
  },
  {
    title: '系统',
    items: [{ path: '/configs', label: '系统配置 · AI 密钥', icon: Setting }],
  },
]);

const activePath = computed<string>(() => {
  const m = route.path.match(/^\/[\w-]+/);
  return m ? m[0] : '/dashboard';
});

const pageTitle = computed<string>(
  () => (route.meta?.title as string | undefined) ?? '工作台',
);

const initial = computed<string>(
  () => (auth.user?.nickname?.[0] ?? 'A').toUpperCase(),
);

const roleLabel = computed<string>(() => {
  if (auth.isSuperAdmin) return '超级管理员';
  if (auth.role === 'admin') return '管理员';
  return '访客';
});

async function onCmd(cmd: string | number | object): Promise<void> {
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
  background: var(--color-bg-page);
}

// ====== 侧边栏 ======
.aside {
  background: var(--color-sidebar-bg, #0f1419);
  background-image: radial-gradient(
    600px circle at 0% 0%,
    rgba(91, 91, 214, 0.08),
    transparent 60%
  );
  transition: width 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border-right: 1px solid rgba(0, 0, 0, 0.04);

  &--collapsed {
    .nav {
      padding: 12px 8px;
    }
  }
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 18px 18px 14px;
  border-bottom: 1px solid var(--color-sidebar-border, rgba(255, 255, 255, 0.06));
}

.brand__mark {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, #6c6cf0 0%, #5b5bd6 50%, #4ed1cf 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  font-weight: 700;
  font-size: 13px;
  color: #fff;
  letter-spacing: 0.5px;
  box-shadow: 0 4px 14px rgba(91, 91, 214, 0.4);
  flex-shrink: 0;
}

.brand__title {
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  letter-spacing: 0.02em;
  white-space: nowrap;
}

.brand__sub {
  color: var(--color-sidebar-text-muted, #6a7280);
  font-size: 11px;
  margin-top: 2px;
  white-space: nowrap;
}

.nav {
  flex: 1;
  padding: 14px 12px;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.nav__group-title {
  color: var(--color-sidebar-text-muted, #6a7280);
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 14px 10px 6px;
}

.nav__item {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 9px 10px;
  border-radius: 10px;
  color: var(--color-sidebar-text, #c8ccd2);
  cursor: pointer;
  font-size: 13.5px;
  text-decoration: none;
  position: relative;
  transition: background 0.15s ease, color 0.15s ease;

  &:hover {
    background: var(--color-sidebar-bg-hover, rgba(255, 255, 255, 0.06));
    color: #fff;
  }

  &--active {
    background: var(--color-sidebar-bg-active, rgba(91, 91, 214, 0.18));
    color: #fff;
    font-weight: 500;

    &::before {
      content: '';
      position: absolute;
      left: -12px;
      top: 50%;
      transform: translateY(-50%);
      width: 3px;
      height: 18px;
      border-radius: 0 2px 2px 0;
      background: var(--color-brand, #5b5bd6);
    }
  }
}

.nav__icon {
  font-size: 16px;
  flex-shrink: 0;
}

.nav__label {
  flex: 1;
  white-space: nowrap;
}

.nav__badge {
  margin-left: auto;
  :deep(.el-badge__content) {
    background: var(--color-danger, #e14c4c);
    border: none;
    box-shadow: none;
  }
}

.aside-footer {
  padding: 12px;
  border-top: 1px solid var(--color-sidebar-border, rgba(255, 255, 255, 0.06));
}

.user-mini {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.06);
  }
}

.user-mini__meta {
  flex: 1;
  min-width: 0;
}

.user-mini__name {
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.user-mini__role {
  color: var(--color-sidebar-text-muted, #6a7280);
  font-size: 11px;
  margin-top: 1px;
}

.user-mini__more {
  color: var(--color-sidebar-text-muted, #6a7280);
  font-size: 14px;
}

.user-mini__avatar-collapsed {
  display: block;
  margin: 0 auto;
  cursor: pointer;
}

// ====== 顶栏 ======
.main-wrap {
  background: var(--color-bg-page);
  display: flex;
  flex-direction: column;
  flex: 1;
  min-width: 0;
}

.topbar {
  background: var(--color-topbar-bg, rgba(255, 255, 255, 0.78));
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
  border-bottom: 1px solid var(--color-topbar-border, rgba(232, 230, 225, 0.8));
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 24px;
  height: 56px;
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 50;
}

.topbar__left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.topbar__collapse {
  font-size: 18px;
  color: var(--color-text-2, #4a4a4a);
}

.topbar__crumb {
  :deep(.el-breadcrumb__inner),
  :deep(.el-breadcrumb__separator) {
    font-size: 13px;
    color: var(--color-text-3, #8c8c8c);
  }
  :deep(.el-breadcrumb__item:last-child .el-breadcrumb__inner) {
    color: var(--color-text-1, #1a1a1a);
    font-weight: 500;
  }
}

.topbar__right {
  display: flex;
  align-items: center;
  gap: 14px;
}

.topbar__icon-btn {
  font-size: 18px;
  color: var(--color-text-2, #4a4a4a);
  width: 36px;
  height: 36px;

  &:hover {
    color: var(--color-brand, #5b5bd6);
    background: var(--color-brand-soft, #eeeefc) !important;
  }
}

.bell-badge {
  :deep(.el-badge__content) {
    background: var(--color-danger, #e14c4c);
    border: 2px solid #fff;
    transform: translate(20%, -10%);
  }
}

.role-chip {
  font-weight: 600;
  letter-spacing: 0.04em;
  font-size: 11px;
}

.user-trigger {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  cursor: pointer;
  user-select: none;
  font-size: 13px;
  color: var(--color-text-2, #4a4a4a);
  padding: 4px 8px 4px 4px;
  border-radius: 999px;
  transition: background 0.15s ease;

  &:hover {
    background: var(--color-brand-soft, #eeeefc);
  }
}

.user-trigger__name {
  max-width: 120px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}

// ====== 主区域 ======
.main {
  flex: 1;
  padding: 24px 32px 36px;
  overflow-y: auto;
}

// 路由切换动效
.fade-up-enter-active,
.fade-up-leave-active {
  transition: opacity 0.25s, transform 0.25s;
}
.fade-up-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.fade-up-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>

<style lang="scss">
// ====== 通知铃铛 popover(全局,因为 popover 在 body) ======
.bell-popover {
  padding: 0 !important;
  border-radius: 14px !important;
  overflow: hidden;
  box-shadow: 0 16px 40px rgba(15, 20, 25, 0.12) !important;

  .bell-list__head {
    padding: 14px 16px;
    border-bottom: 1px solid #f0eeea;
    font-weight: 600;
    color: #1a1a1a;
    font-size: 13px;
  }

  .bell-list__body {
    padding: 8px;
    max-height: 320px;
    overflow-y: auto;
  }

  .bell-list__foot {
    border-top: 1px solid #f0eeea;
    padding: 6px 12px;
    text-align: right;
  }

  .bell-row {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 8px 10px;
    border-radius: 8px;
    font-size: 13px;
    color: #4a4a4a;

    &:hover {
      background: #f7f6f1;
    }
  }

  .bell-row__dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;

    &--danger {
      background: #e14c4c;
      box-shadow: 0 0 0 3px rgba(225, 76, 76, 0.16);
    }
    &--warning {
      background: #f5a623;
      box-shadow: 0 0 0 3px rgba(245, 166, 35, 0.16);
    }
    &--info {
      background: #4a6fa5;
      box-shadow: 0 0 0 3px rgba(74, 111, 165, 0.16);
    }
  }

  .bell-row__label {
    flex: 1;
  }

  .bell-row__value {
    font-weight: 600;
    color: #1a1a1a;
    font-variant-numeric: tabular-nums;
  }

  .bell-empty {
    padding: 24px 12px;
    text-align: center;
    font-size: 12.5px;
    color: #b0b3b8;
  }
}
</style>
