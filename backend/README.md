# Backend - 业务后端(NestJS)

> AI 智能出题学习小程序 - 业务 API 服务
> 技术栈:NestJS 10 + TypeScript + Prisma + MySQL 8 + Redis 7 + BullMQ

---

## 模块规划(对应 02-/03- 文档)

```
src/
├── main.ts
├── app.module.ts
├── app.controller.ts        # /healthz /readyz /version (M0)
└── modules/                 # 业务模块,M1 起逐个实现
    ├── auth/                # 微信登录、JWT、权限守卫
    ├── user/                # 用户、资料、注销
    ├── book/                # 书库、收藏、上传 PDF (V2)
    ├── chapter/             # 章节解析与索引
    ├── photo/               # 拍照素材、OCR 调度
    ├── paper/               # 试卷生成、提交、计次
    ├── question/            # 题目实体、选项、答案
    ├── grading/             # 批改结果、申诉(V2)
    ├── mistake/             # 错题本
    ├── upload/              # 文件上传中心(图片/PDF)
    ├── notification/        # 订阅消息(V2)
    ├── admin/               # 管理后台 API(V1 Web 端)
    ├── audit/               # 内容审核日志
    └── stats/               # 数据统计
```

---

## 启动

```bash
# 安装依赖(在仓库根执行 pnpm install 即可)
pnpm install

# 复制环境变量
cp .env.example .env

# 启动(开发模式)
pnpm dev

# 验证
curl http://localhost:3000/healthz
curl http://localhost:3000/readyz
curl http://localhost:3000/version
```

---

## 当前状态

- **M0**:✅ 项目脚手架 + 健康检查 + Prisma 占位
- **M1**:✅ 数据库 schema(14 张 MVP 表)+ 微信登录 + JWT + 用户模块 + 全局基座
- **M2**:✅ 文件上传(MinIO/COS S3 直传)+ 拍照集 + 微信 OCR 主路径
- **M3**:✅ AI 出题 + 批改(BullMQ 异步 + LLM 主备链 + 客观题本地批 + 主观题 AI 批 + 错题自动入库)
- **M4**:⏳ 错题本 HTTP 接口 + 学习中心(M3 已联通自动入库)

### M1 已实现接口(均已通过本地 e2e 验证)

| 路径 | 方法 | 鉴权 | 说明 |
|---|---|---|---|
| `/healthz` `/readyz` `/version` | GET | 公开 | 探针 |
| `/v1/auth/wechat-login` | POST | 公开 | 微信登录(dev mock 支持 `code=mock-*`) |
| `/v1/auth/refresh` | POST | 公开 | 刷新 token(白名单 + 旋转) |
| `/v1/auth/logout` | POST | ✅ | 撤销当前 access(黑名单) |
| `/v1/auth/cancel-account` `/v1/user/cancel` | POST | ✅ | 注销账号(7 天冷静期) |
| `/v1/auth/cancel-account/cancel` `/v1/user/cancel/cancel` | POST | ✅ | 撤销注销 |
| `/v1/user/me` | GET | ✅ | 个人资料 + 学习统计 + 今日配额 |
| `/v1/user/me` | PATCH | ✅ | 更新昵称/头像/未成年人模式 |
| `/v1/user/me/privacy` | GET | ✅ | 隐私协议状态 |
| `/v1/user/me/privacy/agree` | POST | ✅ | 重新同意隐私协议 |
| `/v1/feedback` | POST | ✅ | 用户反馈(暂落 admin_log)|
| `/v1/upload/policy` | GET | ✅ | 申请预签直传(MinIO/COS, scene=photo\|cover\|pdf) |
| `/v1/upload` | POST | ✅ | multipart 后端转存(兜底) |
| `/v1/photos` | POST | ✅ | 直传后绑定:首次自动建 photo_set, 同时校验 OSS 对象存在 |
| `/v1/photos/:id` | PATCH/DELETE | ✅ | 重拍 / 删图 |
| `/v1/photo-sets/:id/reorder` | PATCH | ✅ | 拍照集排序 |
| `/v1/photo-sets/:id/ocr` | POST | ✅ | 触发 OCR(mode=`wechat`/`mock`/`tencent`-pending) |
| `/v1/photo-sets/:id/ocr` | GET | ✅ | 状态 + 合并文本 + 每张图的 ocr_text |
| `/v1/photo-sets/:id/ocr` | PATCH | ✅ | 客户端微信 OCR 写回 / 用户校对 |
| `/v1/papers` | POST | ✅ | 创建并触发出题(202, 走 BullMQ + ai-service)|
| `/v1/papers/:id` | GET | ✅ | 查询试卷 / 题目(graded 之后才返回 correct_answer)|
| `/v1/papers/:id/cancel` | POST | ✅ | 30s 内取消不扣额度 |
| `/v1/papers/:id/draft` | POST/GET | ✅ | 暂存 / 取回答题进度 |
| `/v1/papers/:id/submit` | POST | ✅ | 提交答卷, 客观题立即批 + 主观题入队 |
| `/v1/papers/:id/result` | GET | ✅ | 批改结果 + summary(total_score/max_score/accuracy) |

### 本地启动检查清单

```bash
# 0. 工具链
node -v          # v20.x
pnpm -v          # v9.x
docker ps        # 确认 docker 在跑

# 1. 安装(根目录执行)
pnpm install

# 2. 起本地中间件(MySQL 3307 / Redis 6380 / MinIO 9000-9001)
pnpm infra:up

# 3. 配置 backend 环境变量
cp backend/.env.example backend/.env

# 4. 数据库初始化(在 backend/ 下)
pnpm prisma:migrate:dev    # 应用 prisma/migrations
pnpm db:seed                # 写 system_config 13 项

# 5. 启动后端
pnpm dev                   # http://localhost:3000

# 6. 验证
curl localhost:3000/healthz
curl localhost:3000/readyz
curl -X POST localhost:3000/v1/auth/wechat-login \
  -H 'Content-Type: application/json' \
  -d '{"code":"mock-001","privacy_version":"v1.0","agreed_at":"2026-05-05T00:00:00Z"}'
```

---

## 接口规范

所有业务接口前缀 `/v1`,响应格式见《03-API接口文档.md》§1.2:

```jsonc
{
  "code": 0,
  "message": "ok",
  "data": { ... },
  "request_id": "..."
}
```

健康检查接口**不带 `/v1` 前缀**(便于探针直连)。

---

## 测试

```bash
pnpm test           # 单元测试
pnpm test:cov       # 覆盖率
pnpm lint           # ESLint
```
