# Deploy - 部署与基础设施

> 文档:开发文档/05-部署运维与安全.md

---

## 目录

```
deploy/
├── docker-compose.yml           # 本地开发(MySQL + Redis + MinIO + 应用)
├── docker-compose.prod.yml      # 生产模板(M9 完善)
├── mysql/init/01-init.sql       # MySQL 启动时初始化
├── nginx/
│   ├── api.conf                 # 业务 API 反代(M9 完善)
│   └── admin.conf               # 管理后台静态(M9 完善)
├── prometheus/prometheus.yml    # Prometheus 抓取配置(M9 完善)
└── scripts/                     # 备份 / 清理 / 归档脚本(M9 完善)
```

---

## 本地开发常用命令

```bash
# 仅起基础设施
pnpm infra:up
# 等价于:
# docker compose -f deploy/docker-compose.yml up -d mysql redis minio

# 全部起(含 backend + ai-service, 需要先把 .env 配好)
docker compose -f deploy/docker-compose.yml --profile app up -d

# 查看日志
pnpm infra:logs

# 停止
pnpm infra:down

# 完全重置(慎用,会清空数据卷)
pnpm infra:reset
```

---

## 端口映射(本地)

| 服务 | 端口 | 说明 |
|---|---|---|
| MySQL | 3306 | `mysql://app:dev_app@localhost:3306/ai_quiz` |
| Redis | 6379 | `redis://localhost:6379` |
| MinIO API | 9000 | S3 兼容 API |
| MinIO Console | 9001 | Web UI(默认账号:`minioadmin / minioadmin`) |
| Backend(可选) | 3000 | NestJS |
| AI Service(可选) | 8000 | FastAPI |

---

## MinIO 初始化

`docker-compose.yml` 中 `minio-init` 容器会在 MinIO 健康后自动:

1. 配置 `mc` 别名指向 `local` MinIO
2. 创建 bucket `ai-quiz-dev`
3. 设置 bucket 为 download 公开(本地调试方便,**生产严禁**)

---

## 生产部署

由 M9 里程碑完善:

- Dockerfile 已就绪(`backend/Dockerfile`、`ai-service/Dockerfile`)
- 镜像构建 + 推送私有仓库的 CI(M9)
- 蓝绿部署脚本(M9)
- Nginx SSL + WAF + 限流配置(M9)
- Prometheus + Grafana Dashboard(M9)
- 备份 / 归档脚本(M9)
