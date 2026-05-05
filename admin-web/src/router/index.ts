import { createRouter, createWebHistory, type RouteRecordRaw } from 'vue-router';

import { useAuthStore } from '@/stores/auth';

const routes: RouteRecordRaw[] = [
  {
    path: '/login',
    name: 'Login',
    component: () => import('@/pages/login/index.vue'),
    meta: { title: '登录', public: true },
  },
  {
    path: '/',
    component: () => import('@/layouts/AdminLayout.vue'),
    redirect: '/dashboard',
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
        path: 'audits',
        name: 'Audits',
        component: () => import('@/pages/audits/index.vue'),
        meta: { title: '内容审核日志' },
      },
      {
        path: 'configs',
        name: 'Configs',
        component: () => import('@/pages/configs/index.vue'),
        meta: { title: '系统配置', requiresSuperAdmin: true },
      },
    ],
  },
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
  document.title = title ? `${title} · AI 出题学习管理后台` : 'AI 出题学习 · 管理后台';

  if (to.meta?.public) {
    if (to.path === '/login' && auth.isLoggedIn) {
      next('/dashboard');
      return;
    }
    next();
    return;
  }

  if (!auth.isLoggedIn) {
    next({ path: '/login', query: { redirect: to.fullPath } });
    return;
  }

  if (!auth.isAdminLike) {
    // 普通用户(role=user)误进
    next({ path: '/login' });
    return;
  }

  if (to.meta?.requiresSuperAdmin && !auth.isSuperAdmin) {
    next({ path: '/dashboard' });
    return;
  }

  next();
});

export default router;
