# Miniprogram - 微信小程序前端

> AI 智能出题学习小程序 · 微信原生 + TypeScript + TDesign + MobX

---

## 启动

### 1. 安装依赖
```bash
# 在仓库根
pnpm install
```

### 2. 微信开发者工具
打开「微信开发者工具」→ 导入项目:
- 项目目录:`miniprogram/`
- AppID:**点击「测试号」**(或填入你自己的真实 AppID)
- 项目名称:`ai-quiz-miniprogram`

### 3. 构建 npm
工具菜单 → **工具 → 构建 npm**(MobX / TDesign 等三方库需要)

### 4. 后端就绪
- `backend` 起在 `http://localhost:3000`(M3 已就绪)
- 登录用 `code=mock-001`(后端 M1 已支持 dev mock)
- 出题 / 批改 / 错题: 后端 M3 已提供完整链路(`/v1/papers/*`)

### 5. 体验
点击「编译」即可走完 14 个用户端页面。

---

## 当前状态(M8 完成)

✅ 14 个用户端页面、网络层、MobX store、20+ 公共组件全部就绪
✅ `pnpm --filter ai-quiz-miniprogram lint` 全绿
✅ `pnpm --filter ai-quiz-miniprogram type-check` 全绿(strict + noImplicitAny)

| 编号 | 页面 | 路径 | 状态 |
|---|---|---|---|
| U01 | 登录 | `pages/login/` | ✅ |
| U02 | 引导 | `pages/onboarding/` | ✅ 3 屏 swiper |
| U03 | 首页/书库 Tab | `pages/home/` | ✅ 搜索 + 分类 + 推荐 |
| U04 | 书籍详情 | `pages/book-detail/` | ✅ 章节多选 |
| U05 | 拍照 Tab | `pages/photo/` | ✅ 连拍 + 缩略图 + 直传 OSS |
| U06 | OCR 校对 | `pages/photo-review/` | ✅ 1.5s 轮询 + 编辑回写 |
| U07 | 出题配置 | `pages/paper-config/` | ✅ 配额联动 |
| U08 | 出题加载 | `pages/paper-loading/` | ✅ 指数退避 + 阶段文案 + 30s 取消 |
| U09 | 答题 | `pages/paper-answer/` | ✅ 5 题型 + 计时 + 暂存 |
| U10 | 提交确认 | (Modal) | ✅ confirm 弹窗 |
| U11 | 结果报告 | `pages/paper-result/` | ✅ 分数环 + 逐题解析 |
| U12 | 我的 Tab | `pages/profile/` | ✅ 资料 + 数据 + 入口 |
| U13 | 错题本 | `pages/mistake/` | ✅ 列表 + 筛选 + 重做 |
| U14 | 设置 | `pages/settings/` | ✅ 偏好/数据/协议/账号 |
| — | 反馈 | `pages/feedback/` | ✅(从「我的」入口) |

---

## 目录形态(M8 落地)

```
miniprogram/
├── app.ts                     # 全局入口 + 启动钩子
├── app.json                   # 14 页路由(无原生 tabBar, 见下文)
├── app.wxss                   # 全局 token + utility
├── sitemap.json
├── pages/                     # 14 个用户端页面(见上表)
├── components/
│   ├── ai-disclaimer/         # AI 内容标识 chip(合规必备)
│   ├── book-card/             # 书籍卡片
│   ├── chip-group/            # 多选 chip
│   ├── custom-tab-bar/        # 自定义 TabBar(见下文)
│   ├── empty-state/
│   ├── error-state/
│   ├── loading-stage/         # 出题加载页动效
│   ├── mistake-card/
│   ├── question-card/         # 5 种题型一体, value 双向绑
│   ├── quota-badge/
│   ├── safe-area-bottom/
│   ├── score-display/         # 圆形分数环
│   ├── segmented/             # 分段控件
│   └── skeleton-list/
├── services/                  # 网络层 + 7 个业务 service
│   ├── http.ts                # 请求封装(401 自动 refresh + 单飞)
│   ├── auth.ts / user.ts / book.ts / upload.ts /
│   ├── photo.ts / paper.ts / mistake.ts
│   └── index.ts               # 统一出口
├── stores/                    # MobX 全局 store
│   ├── user.ts                # 登录态/统计/配额
│   ├── paper.ts               # 跨页试卷流转
│   ├── photo.ts               # 拍照本地队列 + 上传态
│   ├── mistake.ts             # 错题分页
│   └── index.ts
├── utils/
│   ├── storage.ts / time.ts / share.ts / uuid.ts /
│   ├── network.ts             # 全局断网监听
│   ├── moderation.ts          # 客户端敏感词前置过滤(预留接口)
│   ├── tracker.ts             # 埋点采集(批量上报)
│   └── toast.ts               # toast/loading/confirm
├── config/
│   ├── env.ts                 # 三档环境(develop/trial/release)
│   └── constants.ts           # 错误码 / 题型 / 难度 / 轮询参数
├── types/
│   ├── domain.ts              # 业务领域类型
│   ├── api.ts                 # HTTP 请求/响应契约
│   ├── app.d.ts               # IAppOption 全局类型
│   └── index.ts
└── README.md
```

---

## 架构要点

### 1. 网络层(services/http.ts)
- 统一注入 `Authorization` / `X-Request-Id` / `X-Client-Version`
- **401 自动 refresh + 单飞**:并发请求只发一次 refresh, 防雪崩
- 业务码非 0 抛 `HttpError` 子类:`TokenExpiredError` / `RateLimitError` / `ContentBlockedError` / `QuotaExceededError`
- 创建类接口(出题/提交) 自动加 `Idempotency-Key` 头
- `wx.request` 不支持 PATCH 在 typings 里,代码中已 cast 为可用 method
- 文件直传:`uploadToOss(filePath, putUrl)` 走 `wx.uploadFile`

### 2. MobX Store
- `mobx-miniprogram` 的 observable + 页面用 `mobx-miniprogram-bindings.createStoreBindings` 镜像到 `Page.data`
- 所有 store 都用 `as Store` 断言保留 setter 类型(避免 strict 模式下字面量推导)
- Page 解绑放在 `onUnload`

### 3. 出题/批改异步流转
- 创建试卷 → `paper-loading` 指数退避轮询(1.5s → 3s, 60s 超时), 30s 内可取消
- 提交 → `paper-result` 同样轮询, 直到 `status=graded`
- OCR → `photo-review` 同样轮询

### 4. TabBar 自定义方案 ⚠️
**当前实现:不走原生 tabBar**, 因没有 PNG 图标资产,采用 `components/custom-tab-bar/` 组件 + `wx.reLaunch` 切换。
3 个 Tab:书库 / 拍照 / 我的(在 `home`、`photo`、`profile` 三页面 wxml 里挂载)。

正式发版前请补 6 张 PNG 图标(普通/高亮 × 3 tab),改回原生 tabBar:
1. 准备 6 张 24×24 PNG 放 `assets/tabbar/`
2. `app.json` 加 `tabBar: { custom: false, list: [...] }`
3. 三个 tab 页面去掉 `<custom-tab-bar />`,导航改用 `wx.switchTab`

### 5. 设计 Token
全部落到 `app.wxss` CSS 变量(`--color-*` / `--font-*` / `--space-*` 等),组件直接消费,不写硬编码颜色字号。

---

## 后端接口缺口报告

(对照 03-API 文档 + backend/README, 下列项还需要后端补)

### 必补(M8 → 上线必需)

| 缺口 | 影响 | 建议优先级 |
|---|---|---|
| `GET /v1/upload/policy` 返回 `put_url` 字段 | 直传 OSS 流程依赖 | P0 |
| `GET /v1/books` / `GET /v1/books/{id}` | M5 范围, 当前书库列表/详情还没有 | P0 |
| `GET /v1/mistakes` / `master` / `unmaster` / `practice` | M4 错题本 HTTP 接口 | P0 |
| `POST /v1/feedback` 字段 `content/contact/screenshots` | 03-API §3.4, 已在 backend M1 存 admin_log, 但需正式建表 | P1 |

### 建议补(MVP 内可加)

| 缺口 | 说明 |
|---|---|
| `GET /v1/system/sensitive-words` | 客户端敏感词前置过滤词典(`utils/moderation.ts` 预留 setter) |
| `POST /v1/tracker/events` | 批量埋点上报通道(`utils/tracker.ts` 预留 flush) |
| `GET /v1/papers/{id}` 中 `book_id` / `book.title` 回带 | 结果页分享时拼标题需要 |

### V2 再说

| 缺口 | 说明 |
|---|---|
| `WSS /ws` | 任务完成事件订阅, MVP 用轮询替代 |
| `POST /v1/answers/{id}/appeal` | 主观题申诉 |
| 历史试卷 / 收藏 / 上传书籍 | PRD 已标 V2 |

---

## 体验 / 自测要点

### 必测(发版前)
- [ ] 登录:勾协议前按钮灰显;`code=mock-001` 走通
- [ ] 引导页:跳过 / 走完 都能进首页
- [ ] 出题完整链路:选书 → 配置 → 加载 → 答题 → 提交 → 结果
- [ ] 答题暂存:答到一半退出, 再进可看到暂存
- [ ] 配额耗尽:按钮 disabled + 「今日额度已用尽」
- [ ] 内容拦截:模拟 422 返回时, 出题/拍照都有友好弹窗
- [ ] 网络断开:全局有提示
- [ ] AI 标识:出题加载 / 答题顶部 / 结果区 都有「内容由 AI 生成,仅供参考」

### 已知 MVP 妥协
- TabBar 是自定义组件,不是原生(见上文)
- 客户端微信 OCR 没接`wx.basicOcr` 插件,先靠后端 mode='wechat' 兜底
- `utils/moderation.ts` 的敏感词词典为空, 占位接口已给, 等后端下发
- 埋点没真实通道, 仅 console.log

---

## 重要事项

- **AppID**: 测试期用「测试号」即可走通流程; 真实上线前替换 (`project.config.json`)
- **业务域名 / Web 业务域名**: 在小程序后台「开发设置」加白名单(api / OSS / 微信内容安全)
- **包体积**: 主包 ≤ 1.5MB(预算 0.5MB 余量), V2 管理工作台走分包
- **隐私协议**: `config/env.ts` 的 `PRIVACY_VERSION` 与后端 `system_config[privacy_version]` 必须一致
