# Admin Web - 管理后台前端(Vue 3)

> AI 智能出题学习小程序 - 管理后台 Web 端
> 技术栈:Vue 3 + Vite + Element Plus + Pinia + axios + TypeScript
> **状态:M7 完成**, 全部页面 + API 已就绪

---

## 页面清单

| 路径 | 页面 | 角色 |
|---|---|---|
| `/login` | 登录(dev `mock-*` 快登,生产换扫码) | 公开 |
| `/dashboard` | 工作台:今日 / 待办 / 累计 三组卡片 | admin / super_admin |
| `/books` | 书籍管理:列表 + 创建/编辑 + 章节批量导入 + 上下架 + 推荐 | admin / super_admin |
| `/users` | 用户管理:列表 + 详情抽屉 + ban/unban + 任命 admin / 免职(后两者仅 super_admin) | admin / super_admin |
| `/audits` | 内容审核日志:scene / result / user_id 过滤 | admin / super_admin |
| `/configs` | 系统配置:JSON 在线编辑 | **super_admin only** |

路由守卫:
- 未登录 → 跳 `/login`
- role=user(普通用户)→ 强制踢回 `/login`
- 非 super_admin 访问 `/configs` → 跳 `/dashboard`

---

## 启动(对接 backend M0–M7)

```bash
# 1. 装依赖(仓库根)
pnpm install

# 2. 起后端 + 基础设施
pnpm infra:up                              # MySQL 3307 / Redis 6380 / MinIO 9000
pnpm --filter ai-quiz-backend dev          # http://localhost:3000

# 3. admin-web
cd admin-web
cp .env.example .env.development           # 默认 VITE_API_BASE=http://localhost:3000
pnpm dev                                   # http://localhost:5173

# 4. 登录
#   登录页填 code=mock-admin-001(任何 mock-* 开头都行,后端 dev 直通)
#   首次登录创建的是 role=user, 必须先用 SQL 提到 admin/super_admin:
#     docker exec ai-quiz-mysql mysql -uapp -pdev_app ai_quiz \
#       -e "UPDATE user SET role='super_admin' WHERE id=<id>;"
#   然后重新登录拿到新角色的 JWT
```

---

## 工程构成

```
src/
├── main.ts / App.vue
├── router/index.ts             # 5 个一级路由 + 全局守卫
├── layouts/AdminLayout.vue     # 顶部 + 侧边栏 + 面包屑 + 退出
├── pages/
│   ├── login/                  # 登录
│   ├── dashboard/              # 工作台
│   ├── books/                  # 列表 + _BookEditDialog + _ChapterImportDialog
│   ├── users/                  # 列表 + _UserDetailDrawer
│   ├── audits/                 # 内容审核
│   └── configs/                # 系统配置(super_admin)
├── api/
│   ├── http.ts                 # axios 实例 + 401 单飞 refresh + 业务码错误
│   └── admin.ts                # 全部 admin 接口封装
├── stores/auth.ts              # Pinia: token / user / role 守卫
├── types/api.ts                # 与后端 DTO 严格对齐
├── styles/global.scss
└── vite-env.d.ts               # ImportMetaEnv 类型
```

---

## 校验

```bash
pnpm --filter ai-quiz-admin-web type-check     # vue-tsc 严格类型
pnpm --filter ai-quiz-admin-web lint            # ESLint v9 (FlatCompat 桥接旧 plugin)
pnpm --filter ai-quiz-admin-web build           # 生产产物 dist/
```
