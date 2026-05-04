# ====================================================
# 管理后台前端 Dockerfile(多阶段)
# 文档:开发文档/05-部署运维与安全.md §3.4
# 生产环境通常构建后传 OSS + CDN, 本镜像作为容器化部署的备选
# ====================================================

FROM node:20-alpine AS builder
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate
COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build

FROM nginx:1.27-alpine AS runner
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
