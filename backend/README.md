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
- **M1**:⏳ 数据库 schema + 微信登录 + 用户模块

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
