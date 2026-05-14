# AI 智能出题学习小程序 — API 接口文档

> 版本:v1.0  
> 配套 PRD:v1.1  
> 协议:HTTPS / RESTful + JSON  
> 编码:UTF-8  
> Base URL:`https://api.yourdomain.com/v1`  
> 适用对象:前后端工程师 / 联调  
> 最后更新:2026-05-05

---

## 一、通用规范

### 1.1 请求规范

- **方法**:GET / POST / PUT / PATCH / DELETE
- **Content-Type**:`application/json; charset=utf-8`(文件上传用 `multipart/form-data`)
- **认证 Header**:`Authorization: Bearer <jwt_token>`
- **追踪 Header**:`X-Request-Id`(可选,客户端生成 uuid;后端日志透传)
- **幂等 Header**:`Idempotency-Key`(适用于创建类接口)
- **客户端版本**:`X-Client-Version: miniprogram/1.0.0`(便于灰度)

### 1.2 统一响应

```jsonc
{
  "code": 0,            // 0 成功;非 0 业务错误码
  "message": "ok",      // 错误信息
  "data": { ... },      // 业务数据
  "request_id": "..."   // 同 X-Request-Id
}
```

### 1.3 状态码与错误码

| HTTP Code | 含义 |
|---|---|
| 200 | 成功 |
| 201 | 创建成功 |
| 202 | 异步接受(出题/批改请求) |
| 400 | 参数错误 |
| 401 | 未认证 / token 失效 |
| 403 | 无权限 |
| 404 | 资源不存在 |
| 409 | 冲突(幂等键冲突) |
| 422 | 内容安全拦截 |
| 429 | 限流 / 额度耗尽 |
| 500 | 服务器内部错误 |
| 503 | 上游(LLM/OCR)不可用 |

#### 业务错误码(`code` 字段)

| code | 含义 |
|---|---|
| 0 | 成功 |
| 10001 | 参数校验失败 |
| 10002 | 资源不存在 |
| 10003 | 操作过快 |
| 20001 | token 无效或过期 |
| 20002 | 账号已被封禁 |
| 20003 | 账号已注销 |
| 30001 | 出题额度已用尽 |
| 30002 | LLM 服务不可用 |
| 30003 | LLM 输出格式错误 |
| 30004 | 出题任务已取消 |
| 40001 | 内容安全拦截(敏感) |
| 40002 | 内容安全拦截(违法) |
| 40003 | OCR 失败 |
| 50001 | 数据库错误 |

### 1.4 分页规范

请求:
```
GET /xxx?page=1&page_size=20&sort=created_at:desc
```

响应:
```jsonc
{
  "code": 0, "message": "ok",
  "data": {
    "list": [ ... ],
    "pagination": { "page": 1, "page_size": 20, "total": 156 }
  }
}
```

### 1.5 时间字段

- 输入/输出统一用 **ISO 8601 UTC** 字符串:`2026-05-05T12:34:56Z`
- 客户端转 Asia/Shanghai 显示

### 1.6 ID 类型

- 业务 ID 一律 BIGINT,**JSON 中以字符串返回**(避免 JS Number 精度丢失)

---

## 二、认证接口

### 2.1 微信登录

**`POST /auth/wechat-login`**

请求:
```jsonc
{
  "code": "wx_jscode_xxx",
  "user_info": {                  // 可选,首次登录时
    "nickname": "Karl",
    "avatar_url": "https://..."
  },
  "privacy_version": "v1.0",      // 当前隐私协议版本
  "agreed_at": "2026-05-05T03:00:00Z"
}
```

响应:
```jsonc
{
  "code": 0, "message": "ok",
  "data": {
    "access_token": "<jwt>",
    "refresh_token": "<jwt>",
    "expires_in": 604800,         // 7 天
    "user": {
      "id": "1001",
      "nickname": "Karl",
      "avatar_url": "https://...",
      "role": "user",
      "is_first_login": true       // 首次登录,客户端需展示引导
    }
  }
}
```

错误:
- 20002 账号已被封禁
- 20003 账号已注销

### 2.2 刷新 Token

**`POST /auth/refresh`**

```jsonc
{ "refresh_token": "..." }
```

### 2.3 退出登录

**`POST /auth/logout`** Header 必带 token

### 2.4 注销账号(申请)

**`POST /user/cancel`**(等同**`/auth/cancel-account`**)

```jsonc
{ "reason": "..." }       // 可选
```

返回:
```jsonc
{
  "code": 0,
  "data": {
    "scheduled_delete_at": "2026-05-12T03:00:00Z",
    "cancel_window_seconds": 604800
  }
}
```

### 2.5 取消注销

**`POST /user/cancel/cancel`**:7 天冷静期内可撤销。

---

## 三、用户与设置

### 3.1 获取个人资料

**`GET /user/me`**

返回字段同登录响应中的 `user` + 学习数据统计:
```jsonc
{
  "data": {
    "user": { ... },
    "stats": {
      "total_papers": 42,
      "total_questions": 380,
      "accuracy_rate": 0.78,
      "active_mistakes": 67,
      "mastered_mistakes": 25
    },
    "today": {
      "used_quota": 3,
      "limit": 10,
      "reset_at": "2026-05-06T00:00:00+08:00"
    }
  }
}
```

### 3.2 更新资料

**`PATCH /user/me`**
```jsonc
{ "nickname": "...", "avatar_url": "..." }
```

### 3.3 查看协议状态

**`GET /user/me/privacy`** → 是否需要重新同意

### 3.4 反馈

**`POST /feedback`**
```jsonc
{ "content": "...", "contact": "...", "screenshots": ["url1","url2"] }
```

---

## 四、书籍

### 4.1 书库列表

**`GET /books?keyword=&page=1&page_size=20&sort=recommended`**

参数:
- `keyword` 模糊匹配 title/author/isbn
- `sort` `recommended | latest | hot`

响应 list item:
```jsonc
{
  "id": "1",
  "title": "...",
  "author": "...",
  "cover_url": "...",
  "description": "...",
  "tags": ["公考","行测"],
  "is_recommended": true,
  "is_favorited": false        // V2,登录用户才有意义
}
```

> 2026-05-07 起 `category` 字段已下线(分类管理废弃,详见 02-数据库设计文档迁移记录),
> 老客户端如继续传 `?category=xxx` 后端会忽略不报错。

### 4.2 书籍详情

**`GET /books/{id}`**

包含 4.1 所有字段 + 章节列表(若有):
```jsonc
{
  "data": {
    "book": { ... },
    "chapters": [
      { "id":"11", "order_no":1, "title":"第一章", "start_page":1, "end_page":15 }
    ]
  }
}
```

### 4.3 ISBN 扫码搜索(V2)

**`GET /books/by-isbn/{isbn}`**

### 4.4 收藏(V2)

- **`POST /books/{id}/favorite`**
- **`DELETE /books/{id}/favorite`**
- **`GET /user/me/favorites?page=&page_size=`**

### 4.5 我的书库(M8 自建书)

**`GET /books/mine?page=1&page_size=20`** 列出当前用户上传的 PDF 自建书。

每个 list item:
```jsonc
{
  "id": "1024",
  "title": "...",
  "cover_url": "...",
  "tags": [],
  "is_recommended": false,
  "is_favorited": false,
  "import_status": "ready",         // preparing/extracting/splitting/ready/failed
  "import_progress": 100,
  "import_error": null,
  "linked_photo_set_id": "777",     // M8 PR2.6 双写, null 表示尚未生成 / 已被回收
  "chapters_count": 12,
  "pdf_url": "...",
  "created_at": "2026-05-07T..."
}
```

**`POST /books/upload`** 上传新书(异步双写)。

```jsonc
{
  "title": "...",
  "author": "...",
  "description": "...",
  "cover_url": "<oss_url>",
  "pdf_url": "<oss_url>",
  "max_chapters": 50               // 可选, 默认让 LLM 自决
}
```

返回 201:整本书的 `BookDetailView`,`import_status="preparing"`。
后台同时跑两条独立链路:
- **A 章节抽取**(原有):pdfplumber/VL → markdown → LLM 切章 → `import_status=ready` + chapters[]
- **B 拍照集双写**(M8 PR2.6 新增):ai-service 拆图 → 上传 OSS → 创建 photo_set + photos → 写入 `book.linked_photo_set_id`

任一失败仅影响那一路;前端轮询 `GET /books/mine` 查 `import_status` + `linked_photo_set_id` 即可。

**`POST /books/from-photo-set`** 由拍照集反向建书。

```jsonc
{
  "photo_set_id": "...",
  "title": "...",
  "author": "...",
  "description": "..."
}
```

**`PATCH /books/{id}`** 改名 / 换封面 / 改简介(只允许 owner)。

**`DELETE /books/{id}`** 软删自己的书;若有 `linked_photo_set_id` 同步把那个 photo_set 的 `expires_at` 推到 +7 天等定时清理。

---

## 五、文件上传

### 5.1 申请直传凭证(推荐方式)

**`GET /upload/policy?scene=photo|cover|pdf`**

返回腾讯云 COS / 阿里云 OSS 临时密钥(STS):
```jsonc
{
  "data": {
    "provider": "tencent_cos",
    "region": "ap-guangzhou",
    "bucket": "ai-quiz-prod",
    "credentials": {
      "tmp_secret_id": "...",
      "tmp_secret_key": "...",
      "session_token": "...",
      "expires_at": "2026-05-05T04:00:00Z"
    },
    "key_prefix": "photo/2026/05/05/",
    "max_size_mb": 10
  }
}
```

> 客户端直传 OSS,完成后调下面接口绑定。

### 5.2 直传后绑定(以拍照为例)

**`POST /photos`**
```jsonc
{
  "photo_set_id": null,        // 第一次上传时为空,系统自动创建 photo_set
  "image_url": "<oss_url>",
  "order_no": 1
}
```

返回:
```jsonc
{ "data": { "photo_id": "...", "photo_set_id": "..." } }
```

### 5.3 简单上传(后端转存,适合小文件)

**`POST /upload`**(`multipart/form-data`,file 字段)

### 5.4 删除/重拍

- **`DELETE /photos/{id}`**
- **`PATCH /photos/{id}`** 修改 image_url(重拍)
- **`PATCH /photo-sets/{id}/reorder`** 调整排序
  ```jsonc
  { "items": [{"id":"1","order_no":1},{"id":"2","order_no":2}] }
  ```

### 5.5 拍照集 meta(M8 PR2.6)

**`GET /photo-sets/{id}`** 返回拍照集元信息(不含 photos),用于反查源书。

```jsonc
{
  "data": {
    "id": "1024",
    "name": "高一物理 第三章 · 原始页面",
    "total_pages": 18,
    "ocr_status": "done",
    "source_kind": "book",     // capture / pdf / book
    "source_book_id": "201",   // 当 source_kind=book 时反查源书
    "expires_at": "2076-05-07T00:00:00Z",
    "created_at": "2026-05-07T19:00:00Z"
  }
}
```

### 5.6 PDF → 拍照集(M8 PR2.6)

**`POST /photo-sets/from-pdf`** 把已上传到 OSS 的 PDF 拆图建拍照集,实现「拍照统一入口」(微信聊天文件 / 本地 PDF 都走这条路径)。

```jsonc
{
  "pdf_url": "<oss_url>",        // 必须先经 /upload/policy?scene=pdf 上传
  "name": "数学第三章",          // 可选, 默认 "PDF 导入 · N 页"
  "max_pages": 50                // 可选, 默认 50, 上限 50; 超过则截断
}
```

返回 201:
```jsonc
{
  "data": {
    "photo_set_id": "1024",
    "total_pages": 78,            // PDF 实际总页数
    "truncated": true,            // 是否因 max_pages 截断
    "photos": [
      { "id":"1", "order_no":1, "image_url":"...", "ocr_text":null, "regions":[] },
      ...
    ]
  }
}
```

> 同步处理(50 页约 30s);失败抛 `30002 LLM_UNAVAILABLE`。
> 后端流程:校验 pdf_url 属本系统 OSS → ai-service 拆图 → 逐页上传 OSS → 创建 photo_set + photos → 异步触发内容审核。
> 自带 `source_kind='pdf'`,与拍照流程的 `source_kind='capture'` 区分;若由 `POST /books/upload` 双写而来则 `source_kind='book'`。

---

## 六、OCR 识别

### 6.1 触发 OCR

**`POST /photo-sets/{id}/ocr`**

返回 202:
```jsonc
{ "data": { "task_id": "...", "estimated_seconds": 25 } }
```

### 6.2 查询 OCR 状态(轮询)

**`GET /photo-sets/{id}/ocr`**

```jsonc
{
  "data": {
    "status": "done",         // pending / processing / done / failed
    "progress": 100,           // 0–100
    "ocr_text": "...合并文本...",
    "items": [
      { "photo_id":"...", "order_no":1, "ocr_text":"..." }
    ]
  }
}
```

> 推荐 WebSocket(可选);MVP 用轮询,1.5s 一次。

### 6.3 校对修改

**`PATCH /photo-sets/{id}/ocr`**
```jsonc
{
  "items": [
    { "photo_id": "...", "ocr_text": "用户校对后的文本" }
  ]
}
```

> 校对后可直接进入出题。

---

## 七、出题与答题

### 7.1 创建试卷(出题)

**`POST /papers`**

请求:
```jsonc
{
  "source_type": "book",                 // book | chapter | photo_set
  "book_id": "1",                        // source_type=book/chapter 时必填
  "chapter_ids": ["11","12"],            // chapter 模式时必填(可多选)
  "photo_set_id": null,                  // photo_set 模式时必填
  "config": {
    "question_types": ["single","judge","fill","short_answer"],
    "difficulty": "medium",
    "count": 10,
    "custom_prompt": null               // 可选,用户额外指令
  }
}
```

请求 Header:
- `Idempotency-Key: <user_id>-<book_id>-<config_hash>`

响应 202:
```jsonc
{
  "code": 0,
  "data": {
    "paper_id": "1001",
    "status": "generating",
    "estimated_seconds": 25
  }
}
```

错误:
- 30001 出题额度已用尽
- 422 内容安全拦截
- 30002 LLM 不可用(主备都失败)

### 7.2 查询试卷状态

**`GET /papers/{id}`**

```jsonc
{
  "data": {
    "paper": {
      "id": "1001",
      "status": "ready",                 // generating / ready / failed / submitted / graded
      "config": { ... },
      "total_questions": 10,
      "created_at": "...",
      "questions": [                     // status >= ready 时返回
        {
          "id": "Q1",
          "order_no": 1,
          "type": "single",
          "difficulty": "medium",
          "stem": "...",
          "options": [{"id":"A","text":"..."}, ...],
          "score": 10
          // 注意:correct_answer 只在 graded 后返回
        }
      ]
    }
  }
}
```

### 7.3 取消出题(用户主动)

**`POST /papers/{id}/cancel`**:30 秒内调用不扣额度

### 7.4 暂存进度

**`POST /papers/{id}/draft`**
```jsonc
{
  "answers": [
    { "question_id": "Q1", "user_answer": ["A"], "time_spent_sec": 12 }
  ]
}
```

> 服务端保存到 `answer` 表(`is_correct=NULL`)+ Redis 缓存,7 天过期。

### 7.5 查询暂存进度

**`GET /papers/{id}/draft`** → 返回最新暂存的答案

### 7.6 提交答卷

**`POST /papers/{id}/submit`**

```jsonc
{
  "answers": [
    { "question_id": "Q1", "user_answer": ["A"], "time_spent_sec": 12 },
    ...
  ],
  "total_time_sec": 320
}
```

Header:`Idempotency-Key: paper-{id}-submit`

响应 202:
```jsonc
{
  "data": {
    "result_id": "1001",
    "status": "grading",
    "estimated_seconds": 15
  }
}
```

### 7.7 查询批改结果

**`GET /papers/{id}/result`**

```jsonc
{
  "data": {
    "paper_id": "1001",
    "status": "graded",
    "summary": {
      "total_score": 85,
      "max_score": 100,
      "accuracy": 0.8,
      "time_spent_sec": 320,
      "rank_percentile": 0.62             // 击败 62% 用户
    },
    "questions": [
      {
        "id": "Q1",
        "stem": "...",
        "type": "single",
        "options": [...],
        "correct_answer": ["A"],
        "user_answer": ["B"],
        "is_correct": false,
        "score": 0,
        "ai_feedback": "...",
        "ai_confidence": 0.92,
        "knowledge_points": ["..."],
        "graded_by": "ai"
      }
    ]
  }
}
```

### 7.8 申诉(V2)

**`POST /answers/{id}/appeal`**
```jsonc
{ "reason": "我觉得这道题..." }
```

**`GET /user/me/appeals?status=`** 查看申诉列表

### 7.9 历史试卷(V2)

**`GET /user/me/papers?page=&page_size=&book_id=`**

---

## 八、错题本

### 8.1 错题列表

**`GET /mistakes?status=active|mastered&book_id=&page=&page_size=`**

```jsonc
{
  "data": {
    "list": [
      {
        "id": "M1",
        "question": { "id":"Q...", "stem":"...", "type":"single", ... },
        "wrong_count": 2,
        "consecutive_correct": 0,
        "first_wrong_at": "...",
        "last_wrong_at": "...",
        "status": "active"
      }
    ],
    "pagination": { ... },
    "summary": { "active": 67, "mastered": 25 }
  }
}
```

### 8.2 标记为已掌握 / 取消掌握

- **`POST /mistakes/{id}/master`**
- **`POST /mistakes/{id}/unmaster`**

### 8.3 错题重做(生成临时试卷)

**`POST /mistakes/practice`**
```jsonc
{ "mistake_ids": ["M1","M2"], "include_book_id": null }   // 二选一
```

返回 paper_id,后续走标准答题流程;系统记录:正确 → consecutive_correct +1;若 ≥ 2 → 自动 mastered。

### 8.4 删除错题

**`DELETE /mistakes/{id}`**

---

## 九、消息中心(V2)

### 9.1 列表

**`GET /notifications?is_read=&page=&page_size=`**

### 9.2 标记已读

- **`POST /notifications/{id}/read`**
- **`POST /notifications/read-all`**

### 9.3 订阅消息授权

**`POST /notifications/subscribe`**
```jsonc
{ "tmpl_ids": ["tmpl_id_1","tmpl_id_2"] }   // 与微信侧授权同步
```

---

## 十、举报(V2)

### 10.1 提交举报

**`POST /reports`**
```jsonc
{
  "target_type": "book",        // book / user / question / answer
  "target_id": "...",
  "reason": "copyright",        // copyright / spam / violation / other
  "description": "..."
}
```

---

## 十一、订阅消息事件 / WebSocket

### 11.1 用 WebSocket 接收任务完成事件(可选,V2)

**`WSS /ws?token=<jwt>`**

服务端推送格式:
```jsonc
{
  "event": "paper.ready" | "paper.failed" | "paper.graded" | "ocr.done" | "ocr.failed",
  "data": { "paper_id": "...", "status": "ready" }
}
```

> MVP 用轮询(`GET /papers/{id}` 每 1.5 秒),V2 上 WebSocket。

---

## 十二、管理员接口(后台 Web)

> 全部接口需 `role IN ('admin', 'super_admin')`

### 12.1 工作台

**`GET /admin/dashboard`** → 返回数据卡片(待审核数、待举报数、今日 DAU、今日出题数、今日 AI 成本估算)

### 12.2 书籍审核(V2)

- **`GET /admin/book-uploads?status=pending`**
- **`GET /admin/book-uploads/{id}`** → 详情
- **`POST /admin/book-uploads/{id}/approve`**
  ```jsonc
  { "edited": { "title":"...", "author":"...","tags":["公考","行测"] } }   // 编辑后通过
  ```
- **`POST /admin/book-uploads/{id}/reject`**
  ```jsonc
  { "comment": "驳回原因" }
  ```

### 12.3 书籍管理

- **`POST /admin/books`** 创建(同 4.5,但跳过审核)
- **`PATCH /admin/books/{id}`** 编辑
- **`DELETE /admin/books/{id}`** 软删除
- **`POST /admin/books/{id}/recommend`**
- **`POST /admin/books/{id}/unrecommend`**
- **`POST /admin/books/{id}/offline`**

### 12.4 用户管理

- **`GET /admin/users?keyword=&status=&page=&page_size=`**
- **`GET /admin/users/{id}`** → 含其上传/答题记录摘要
- **`POST /admin/users/{id}/ban`**
  ```jsonc
  { "reason": "...", "duration_days": 30 }   // duration_days=0 永久
  ```
- **`POST /admin/users/{id}/unban`**

### 12.5 管理员任命(超管)

- **`POST /admin/users/{id}/promote`** → role = admin
- **`POST /admin/users/{id}/demote`** → role = user

### 12.6 举报处理(V2)

- **`GET /admin/reports?status=pending`**
- **`POST /admin/reports/{id}/handle`**
  ```jsonc
  { "action": "ignore|warn|ban|remove", "comment": "..." }
  ```

### 12.7 系统配置(超管)

- **`GET /admin/configs`** 返回所有配置
- **`PUT /admin/configs/{key}`**
  ```jsonc
  { "value": ... }
  ```

### 12.8 内容审核日志

- **`GET /admin/moderation-logs?scene=&result=&user_id=&from=&to=&page=&page_size=`**

### 12.9 主观题申诉处理(V2)

- **`GET /admin/appeals?status=pending`**
- **`POST /admin/appeals/{id}/review`**
  ```jsonc
  { "accepted": true, "new_score": 85, "comment": "..." }
  ```

---

## 十三、健康检查与运维

| 路径 | 说明 |
|---|---|
| `GET /healthz` | 进程存活 |
| `GET /readyz` | 依赖(DB/Redis/Queue)就绪 |
| `GET /metrics` | Prometheus 指标(内网) |
| `GET /version` | 当前部署版本 |

---

## 十四、限流约定

| 接口分组 | 限制 |
|---|---|
| 全部 | 单 IP 100/min(Nginx) |
| 登录 | 单 IP 10/min |
| 出题 `POST /papers` | 单用户 1 个并发 + 当日额度规则 |
| 提交 `POST /papers/:id/submit` | 单用户 30/h |
| 上传 `POST /upload, /photos` | 单用户 60/min,文件 10/min |
| 反馈 | 单用户 5/h |

超限响应 429 + `Retry-After` Header。

---

## 十五、API 演进策略

- **URL 版本化**:`/v1`、`/v2`(完全不兼容时)
- **字段兼容**:`新增字段允许;不删除已用字段;改 enum 加新值`
- **弃用流程**:Header 标 `Deprecation: true; Sunset: 2026-12-01`,提前 60 天通知

---

## 附录:OpenAPI 文件

后端代码内置 Swagger,启动后访问 `https://api.yourdomain.com/v1/docs`(预发/开发环境开放,生产关闭)。

`openapi.json` 也会随 CI 产出,前端可基于此自动生成 TS 类型(`openapi-typescript`)。

---

**文档结束**
