# AI 智能出题学习小程序

> 一款基于微信小程序的 AI 学习辅助工具,通过拍照或共享书库,由 AI 自动出题、批改、解析,帮助用户高效学习任意书籍内容。
>
> 文档版本:PRD v1.1 + 开发文档 v1.0
> 当前里程碑:**M3 - AI 出题 + 批改主链路打通**

---

## 仓库结构

```
ai-quiz-app/
├── miniprogram/          # 微信小程序源代码(用户端 + V2 管理端,原生 + TS + TDesign + MobX)
├── admin-web/            # 管理后台 Web 端(Vue 3 + Vite + Element Plus)
├── backend/              # 业务后端(NestJS + TypeScript + Prisma + MySQL + Redis + BullMQ)
├── ai-service/           # AI 编排服务(Python 3.11 + FastAPI)
├── deploy/               # Docker / Nginx / Prometheus / 部署脚本
├── 开发文档/             # 6 篇技术文档(架构/数据库/API/前端/部署/UI)
└── PRD-AI智能出题学习小程序.md  # 产品需求文档
```

---

## 环境依赖

| 工具 | 版本 | 说明 |
|---|---|---|
| Node.js | >= 20 LTS | `nvm use` 即可读取 `.nvmrc` |
| pnpm | >= 9 | `corepack enable && corepack prepare pnpm@9.15.0 --activate` |
| Python | >= 3.11 | AI 编排服务 |
| Docker | >= 24 | 本地中间件(MySQL / Redis / MinIO) |
| 微信开发者工具 | 稳定版 | 调试小程序 |

---

## 一键启动

```bash
# 1. 安装 Node 端依赖(根 + miniprogram + admin-web + backend)
pnpm install

# 2. 安装 Python 端依赖
cd ai-service && pip install -r requirements.txt && cd ..

# 3. 启动本地中间件(MySQL / Redis / MinIO)
pnpm infra:up

# 4. 复制环境变量样例
cp backend/.env.example backend/.env
cp admin-web/.env.example admin-web/.env.development
cp ai-service/.env.example ai-service/.env

# 5. 初始化数据库 + 写入种子配置
pnpm --filter ai-quiz-backend prisma:migrate:dev
pnpm --filter ai-quiz-backend db:seed

# 6. 启动各应用(分别在不同 terminal)
pnpm dev:backend           # http://localhost:3000/healthz
pnpm dev:admin             # http://localhost:5173
cd ai-service && uvicorn app.main:app --reload --port 8000   # http://localhost:8000/healthz
# 小程序在「微信开发者工具」中打开 miniprogram/ 目录
```

---

## 里程碑路线(MVP)

| # | 里程碑 | 状态 |
|---|---|---|
| **M0** | 项目脚手架 | ✅ 已完成 |
| **M1** | DB + 后端基座 + 鉴权 | ✅ 已完成 |
| **M2** | 上传 + OCR | ✅ 已完成 |
| **M3** | AI 出题 + 批改(核心) | ✅ 已完成 |
| M4 | 错题本 + 学习中心 | ⏳ 待开始(自动入库已联通) |
| M5 | 书籍 + 章节 | ⏳ |
| M6 | 内容安全 + 合规中间件 | ⏳ |
| M7 | 管理员后台(API + Vue Web) | ⏳ |
| M8 | 小程序前端 14 页 | ⏳ |
| M9 | 部署 / CI / 监控 / 上线清单 | ⏳ |

---

## 仓库脚本速查

| 命令 | 作用 |
|---|---|
| `pnpm install` | 安装所有 workspace 依赖 |
| `pnpm dev:backend` | 启动后端 (NestJS) |
| `pnpm dev:admin` | 启动管理后台 (Vite) |
| `pnpm lint` | 全仓 ESLint(并行) |
| `pnpm format` | Prettier 全仓格式化 |
| `pnpm infra:up` | 启动本地中间件 |
| `pnpm infra:down` | 停止本地中间件 |
| `pnpm infra:reset` | 停止并清空数据卷 |
| `pnpm infra:logs` | 实时查看中间件日志 |

---

## 你需要自己准备的东西(代码外)

按 PRD §7.5 与开发文档 §5.1 列出,代码无法替你完成:

- [ ] 微信小程序 AppID/Secret(主体注册)
- [ ] 域名 ICP 备案 + 公安联网备案(20+ 工作日)
- [ ] LLM API Key:DeepSeek(主)、通义千问(备)、智谱 GLM(兜底)
- [ ] 腾讯云 / 阿里云账号 + OSS Bucket(与备案主体一致)
- [ ] 微信内容安全 API 开通(小程序后台 → 开发能力)
- [ ] 用户协议 / 隐私政策最终条款(建议律师过目)
- [ ] MVP 上线前预录入 50+ 公版书 / 教材

每个里程碑产出后我会单独写一份「使用说明」,告诉你需要把哪些密钥填到 `.env`。

---

## 文档导航

- [PRD](./PRD-AI智能出题学习小程序.md)
- [01-技术架构](./开发文档/01-技术架构文档.md)
- [02-数据库设计](./开发文档/02-数据库设计文档.md)
- [03-API 接口](./开发文档/03-API接口文档.md)
- [04-前端开发规范](./开发文档/04-前端开发规范.md)
- [05-部署运维与安全](./开发文档/05-部署运维与安全.md)
- [06-UI 设计规范](./开发文档/06-UI设计规范.md)

---

**最后更新**:2026-05-05(M3 完成)
