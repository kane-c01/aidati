# Admin Web - 管理后台前端(Vue 3)

> AI 智能出题学习小程序 - 管理后台 Web 端
> 技术栈:Vue 3 + Vite + Element Plus + Pinia + TypeScript

---

## 启动

```bash
# 安装(在仓库根 pnpm install 即可)
pnpm install

cp .env.example .env.development

# 开发
pnpm dev               # http://localhost:5173

# 构建
pnpm build

# 类型检查
pnpm type-check
```

---

## 当前状态(M0)

✅ 项目脚手架 + 路由占位
- `vite.config.ts` 已配 `/v1` 代理至 backend
- Element Plus 按需自动加载(unplugin-auto-import + unplugin-vue-components)
- TS 严格模式;`@/*` 路径别名指向 `src/`

### 后续里程碑

| # | 里程碑 | 内容 |
|---|---|---|
| M7 | 管理员后台核心 | 登录页 / 工作台 / 书籍 / 用户 / 系统配置 / 审核日志 |

---

## 目录(M7 完成后形态)

```
src/
├── main.ts
├── App.vue
├── router/
├── stores/                   # Pinia
├── pages/
│   ├── login/
│   ├── dashboard/
│   ├── book/
│   ├── book-upload/         # V2
│   ├── user/
│   ├── moderation/
│   ├── appeal/              # V2
│   └── settings/            # 仅超管
├── components/
├── services/                 # axios + 接口封装
├── utils/
├── styles/
└── types/
```
