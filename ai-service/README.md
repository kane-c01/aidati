# AI Service - AI 编排服务(FastAPI)

> AI 智能出题学习小程序 - LLM 调用编排
> 技术栈:Python 3.11 + FastAPI + httpx + structlog + Redis

---

## 启动

```bash
# 1. 创建虚拟环境(推荐)
python -m venv .venv
source .venv/bin/activate     # macOS/Linux
# .venv\Scripts\activate      # Windows

# 2. 安装依赖
pip install -r requirements-dev.txt

# 3. 复制环境变量
cp .env.example .env

# 4. 启动
uvicorn app.main:app --reload --port 8000

# 5. 验证
curl http://localhost:8000/healthz
curl http://localhost:8000/readyz
curl http://localhost:8000/docs        # OpenAPI Swagger
```

---

## 当前状态(M0)

✅ 项目脚手架 + 健康检查
- structlog JSON 日志,字段与 backend 对齐
- pydantic-settings 自动 .env 加载
- LLM Adapter / Prompt 模板 / 内容安全 / 路由 在 **M3 里程碑** 完成

---

## 模块规划(M3 完成后形态)

```
ai-service/
├── app/
│   ├── main.py
│   ├── core/
│   │   ├── config.py
│   │   └── logging.py
│   ├── routers/
│   │   ├── generate.py     # POST /generate-paper
│   │   ├── grade.py        # POST /grade-paper
│   │   └── ocr.py          # POST /ocr
│   ├── services/
│   │   ├── llm_client.py   # LLM 抽象 + 主备切换
│   │   ├── prompt_builder.py
│   │   ├── parser.py       # JSON Schema 校验 + 自动修复
│   │   └── moderation.py   # 微信内容安全
│   ├── adapters/
│   │   ├── deepseek.py
│   │   ├── qwen.py
│   │   └── glm.py
│   └── models/             # Pydantic 数据模型
└── tests/
```

---

## 端点契约

由业务后端 (NestJS) 通过内部网络调用,`X-Internal-Token` Header 校验。生产环境**不暴露公网**。

| 端点 | 说明 | 实现里程碑 |
|---|---|---|
| `GET /healthz` | 进程存活 | M0 ✅ |
| `GET /readyz` | 依赖就绪 | M0 ✅(占位) |
| `GET /version` | 版本信息 | M0 ✅ |
| `POST /generate-paper` | 出题 | M3 |
| `POST /grade-paper` | 主观题批改 | M3 |
| `POST /ocr` | OCR 兜底 | M2 |
