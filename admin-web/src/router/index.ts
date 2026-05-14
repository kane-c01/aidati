import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

import AdminLayout from '@/layouts/AdminLayout.vue';
import { useAuthStore } from '@/stores/auth';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/pages/login/index.vue'),
    meta: { title: '登录', public: true },
  },
  {
    // 所有需要登录态 + 后台外壳的页面挂在 AdminLayout 下
    path: '/',
    component: AdminLayout,
    redirect: '/dashboard',
    meta: { requiresAuth: true },
    children: [
      {
        path: 'dashboard',
        name: 'Dashboard',
        component: () => import('@/pages/dashboard/index.vue'),
        meta: { title: '工作台' },
      },
      {
        path: 'books',
        name: 'Books',
        component: () => import('@/pages/books/list.vue'),
        meta: { title: '书籍管理' },
      },
      {
        path: 'users',
        name: 'Users',
        component: () => import('@/pages/users/list.vue'),
        meta: { title: '用户管理' },
      },
      {
        path: 'photos',
        name: 'PhotoSets',
        component: () => import('@/pages/photos/index.vue'),
        meta: { title: '拍照集' },
      },
      {
        path: 'audits',
        name: 'Audits',
        component: () => import('@/pages/audits/index.vue'),
        meta: { title: '内容审核' },
      },
      {
        path: 'configs',
        name: 'Configs',
        component: () => import('@/pages/configs/index.vue'),
        meta: { title: '系统配置 · AI 密钥' },
      },
    ],
  },
  // 兜底 404 → 跳工作台(已登录)或登录页(未登录), 由守卫决定
  {
    path: '/:pathMatch(.*)*',
    redirect: '/dashboard',
  },
];

const router = createRouter({
  history: createWebHistory(),
  routes,
});

router.beforeEach((to, _from, next) => {
  const auth = useAuthStore();
  if (!auth.hydrated) auth.hydrate();

  const title = to.meta?.title as string | undefined;
  document.title = title ? `${title} · 考题魔盒` : '考题魔盒 · 管理后台';

  const isPublic = to.meta?.public === true;
  const requiresAuth = to.matched.some((r) => r.meta?.requiresAuth);

  if (isPublic) {
    // 已登录用户进 /login 直接送到工作台
    if (to.path === '/login' && auth.isLoggedIn) {
      next({ path: '/dashboard', replace: true });
      return;
    }
    next();
    return;
  }

  if (requiresAuth && !auth.isLoggedIn) {
    next({ path: '/login', query: { redirect: to.fullPath } });
    return;
  }

  if (to.meta?.superAdminOnly === true && !auth.isSuperAdmin) {
    next({ path: '/dashboard' });
    return;
  }

  next();
});

export default router;
