# BUG 清单 & PRD 差异

> 版本：审计日期 2026-05-07（PRD v1.2 同步更新）
> 范围：基于 `PRD-AI智能出题学习小程序.md` v1.2 全文逐条对照
> 审计员：Cursor / Claude Opus 4.7（七路并行只读审计）
> 命名规则：`P0` = 合规 / 闭环硬伤；`P1` = 与 PRD 明显不符或缺核心功能；`P2` = 体验/工程细节
>
> **2026-05-07 变更**：产品决策**移除"未成年人模式"功能**, 故 BUG-004 / BUG-029 已作废, 相关代码已从前后端清理。
>
> **2026-05-07 PR2.6 增量(拍照入口统一 + PDF 双写)**:
> - 拍照页(U05)新增「从文件导入」入口, 走 `wx.chooseMessageFile`, 接受 PDF / 微信聊天图片
> - 新增 `POST /v1/photo-sets/from-pdf`:PDF → 后端拆图(ai-service `pdf-to-images`) → 上传 OSS → 建 photo_set + photos
> - `POST /v1/books/upload` 改为**双写**:同一份 PDF 既走章节抽取(原链路), 又异步生成可校对 photo_set, 写入 `book.linked_photo_set_id`
> - 书详情页新增「逐页校对原始页面」入口, 点了跳 `photo-review`
> - schema:`book.linked_photo_set_id` + `photo_set.source_kind` / `source_book_id` (迁移 `20260507060000_book_photo_set_link`)

---

## 目录

- [一、风险概览](#一风险概览)
- [二、P0 合规 / 闭环 级硬伤](#二p0-合规--闭环-级硬伤)
- [三、P1 与 PRD 明显不符 / 关键功能缺失](#三p1-与-prd-明显不符--关键功能缺失)
- [四、P2 体验 / 工程细节](#四p2-体验--工程细节)
- [五、修复优先级与排期建议](#五修复优先级与排期建议)
- [附录 A：全部条目索引](#附录-a全部条目索引)

---

## 一、风险概览

| 等级 | 数量 | 修复合计估时 | 上线影响 |
|---|---|---|---|
| **P0 合规 / 闭环硬伤** | 6（去除 BUG-004） | ~3-4 人天 | 阻塞上线 / 法律合规风险 |
| **P1 与 PRD 不符** | 13 | ~8-13 人天 | 功能闭环不全或与产品定义不符 |
| **P2 体验细节** | 11（去除 BUG-029） | ~2-3 人天 | 不阻塞，但影响打磨 |
| **合计** | 30 | ~13-20 人天 | — |

---

## 二、P0 合规 / 闭环 级硬伤

### BUG-001：AI 生成内容**未做内容安全检查**

- **PRD 依据**：7.2 第 5 条 — “AI 生成的题目和解析 → msgSecCheck → 拒绝展示, 自动重新生成一次; 仍命中则改用降级模板题”
- **现状**：
  - `backend/src/modules/paper/processors/paper-generate.processor.ts` 仅对 `context_text`、`custom_prompt` 做了前置审核
  - AI 输出的 `stem / options / explanation` 直接落库
  - 枚举 `ModerationScene.ai_explanation` 已定义但全仓零引用
- **风险**：违反生成式 AI 合规（监管 / 备案要求）
- **修复方向**：
  1. 在 `paper-generate.processor.ts` LLM 返回后、落库前对每题文本做 `moderation.checkOrThrow`
  2. 命中：以同 prompt 重新调用一次（最多 1 次）
  3. 仍命中：替换为本地降级模板题并打 `is_fallback = true`
- **涉及文件**：
  - `backend/src/modules/paper/processors/paper-generate.processor.ts`
  - `backend/src/modules/paper/services/answer-grader.service.ts`（如需复用模板题）
  - `backend/src/modules/moderation/moderation.service.ts`
- **预估工作量**：1 人天

---

### BUG-002：主观题答案**未做内容安全审核**

- **PRD 依据**：7.2 第 4 条 — “用户答题内容(主观题) → msgSecCheck → 答案改为「[内容已屏蔽]」, 不影响正常评分”
- **现状**：
  - `PaperService.submitPaper` 直接 upsert `userAnswer`，跳过审核
  - `PaperGradeProcessor` 把原始答案直接送给 LLM 批改
- **风险**：用户可借主观题作为违规内容载体
- **修复方向**：
  1. `submitPaper` 写入 short_answer 前 `moderation.check`
  2. 命中：持久化 `userAnswer = '[内容已屏蔽]'`，但传 `Answer.aiInputAnswer`（新增字段）原文给批改器
  3. 批改器读 `aiInputAnswer ?? userAnswer`
- **涉及文件**：
  - `backend/src/modules/paper/paper.service.ts:552-611`（submitPaper）
  - `backend/src/modules/paper/processors/paper-grade.processor.ts:182-210`
  - `backend/prisma/schema.prisma`（Answer 模型）
- **预估工作量**：0.5 人天

---

### BUG-003：协议变更后“强制重同意”链路**断了**

- **PRD 依据**：7.5.1 — “重大变更后再次弹出, 要求重新同意”
- **现状**：
  - 后端 `User.privacyVersion / privacyAgreedAt` 已建好
  - `GET /user/me/privacy` 接口可计算 `need_reagree`
  - **小程序端无任何代码调用此接口**，未在 `app.onLaunch` / `auth refresh` 后判断
  - **类型字段命名前后端不一致**：
    - 后端响应：`need_reagree`
    - 前端类型：`miniprogram/types/api.ts:98-103` 写为 `needs_reagree`
- **风险**：协议升版后老用户照常使用，违反个人信息保护法
- **修复方向**：
  1. 修正类型字段（前端改为 `need_reagree`）
  2. `app.ts` 在登录态恢复后调用一次该接口，命中则弹强制确认 modal，未确认禁用所有功能
  3. `pages/login/index.ts` 协议同意时在请求体携带 `privacy_version`
- **涉及文件**：
  - `miniprogram/app.ts`
  - `miniprogram/services/user.ts`
  - `miniprogram/types/api.ts:98-103`
  - `miniprogram/pages/login/index.ts:48-63`
- **预估工作量**：0.5 人天

---

### BUG-004：~~未成年人模式~~ **已作废**

> 产品于 2026-05-07 决策**移除**未成年人模式功能。`User.is_minor / minor_mode_enabled` 字段已 drop，
> 设置页开关、profile chip、admin-web 配置卡片、`minor_mode_window` config、`MINOR_TIME_LIMIT` 错误码全部清理。
> 见 migration `20260507010000_drop_minor_fields`。如未来恢复，需重新评估并补完整 5 条 PRD 业务联动。

---

### BUG-005：AI 调用日志**未保留 prompt + response ≥ 6 个月**

- **PRD 依据**：7.5.3 — "后台保留所有 AI 调用日志(prompt + response)≥ 6 个月"
- **现状**：
  - `ai-service/app/services/llm_client.py:71-77,119-125` 仅 `logger.info` 打印元数据
  - 业务后端 `AiService` 也未将完整请求-响应落库
- **风险**：生成式 AI 备案过不去（监管要求可追溯）
- **修复方向**：
  1. 新建 Prisma 模型 `AiCallLog { id, scene, model, promptText, responseText, tokensIn, tokensOut, cost, durationMs, status, createdAt }`
  2. `backend/src/infra/ai-service/ai-service.service.ts` 在每次 ai-service HTTP 调用前后落库
  3. 配套清理任务：cron 每日删除 createdAt > 180 天的记录（或迁移到归档表）
- **涉及文件**：
  - `backend/prisma/schema.prisma`（新增 AiCallLog）
  - `backend/src/infra/ai-service/ai-service.service.ts`
  - 新增 `backend/scripts/cron/cleanup-ai-call-log.ts`
- **预估工作量**：1 人天

---

### BUG-006：错题"全部重做"接口**调用方式与后端 DTO 不一致**（核心闭环 BUG）

- **PRD 依据**：7.6.1 — 错题重做模式
- **现状**：
  - `miniprogram/pages/mistake/index.ts` 调 `mistakeService.practice({ mistake_ids: undefined })`
  - 序列化后 body 等价 `{}`
  - `backend/src/modules/mistake/mistake.service.ts` 强制要求 `mistake_ids` 或 `include_book_id` 二选一
  - **现状：用户点"把全部 X 道错题组成一卷"**很可能直接 400 / 业务错**
- **风险**：核心闭环（错题重做）功能不可用
- **修复方向**：选其一
  - **A**（推荐）：传当前列表所有 `mistake_ids`
  - **B**：传 `include_book_id` 当用户已切到某本书时
- **涉及文件**：
  - `miniprogram/pages/mistake/index.ts`
- **预估工作量**：10 分钟

---

### BUG-007：用户上传 PDF**完全没做内容安全**

- **PRD 依据**：7.2 最后一行 — "用户上传的 PDF → msgSecCheck(逐页文本) + imgSecCheck(封面) → 整个 PDF 不入库, 通知上传者"
- **现状**：
  - `backend/src/modules/book/book.service.ts` 的 `uploadUserBook` 直接 `create` Book 行（status=preparing）再异步 `processBookPdf`
  - **没有 pdf 文本审核、没有封面审核、命中也不会"整份不入库"**
- **风险**：V2 上线 PDF 自传流程时违规内容会落库
- **修复方向**：
  1. PDF 抽取后逐页 `moderation.check(pdfText, scene='pdf_text')`
  2. 封面 URL `imgSecCheck(scene='pdf_cover')`
  3. 任一命中 → 删除 Book 行 + 删除 OSS 文件 + `notification.send` 通知上传者
- **涉及文件**：
  - `backend/src/modules/book/book.service.ts`
  - 新增 `backend/src/modules/notification/notification.service.ts`（如不存在）
- **预估工作量**：1 人天

---

## 三、P1 与 PRD 明显不符 / 关键功能缺失

### BUG-008：AI 评分阈值与 PRD 表述不一致

| 条款 | PRD | 实现 | 文件 |
|---|---|---|---|
| 主观题入错题本 | < 60 分 | 仅看 `is_correct === 0` | `mistake.service.ts` |
| 主观题判 `is_correct` | （PRD 隐含 60）| `score ≥ 0.8 × full_score` | `ai-service/app/services/prompt_builder.py` |
| 错误原因字数 | ≥ 20 字 | JSON Schema 仅 ≥ 8 字 | `ai-service/app/services/parser.py:GRADE_SCHEMA` |
| 主观题置信度警示文案 | 「⚠️ AI 评分置信度较低，建议自行判断」 | 「⚠ AI 评分置信度 N%」 | `miniprogram/pages/paper-result/index.ts:87-89` |

- **修复方向**：
  1. AI prompt 调 `is_correct` 阈值为 0.6
  2. `mistake.service.recordWrong` 改为读取 `score / fullScore < 0.6` 入库（不再依赖 `is_correct`）
  3. `parser.py.GRADE_SCHEMA.feedback.minLength = 20`，`GradeAnswerResult.feedback` 同步
  4. 结果页文案改为 PRD 字面
- **预估工作量**：0.5 人天

---

### BUG-009：错题"30 天后再次答错才重新加入"未实现

- **PRD 依据**：7.6.1 — "掌握后从默认重做列表隐藏；若 30 天后再次答错则重新加入"
- **现状**：
  - `mistake.service.recordWrong` 答错即 `status: active`
  - **完全不读 `masteredAt`**，已掌握的题再错就直接掉回错题本
- **修复方向**：
  ```ts
  if (status === 'mastered' || status === 'manual_mastered') {
    if (masteredAt && Date.now() - masteredAt.getTime() < 30 * 24 * 3600 * 1000) {
      // 30 天内不重新激活，仅累加错次
      return;
    }
  }
  status = 'active';
  ```
- **涉及文件**：`backend/src/modules/mistake/mistake.service.ts`
- **预估工作量**：0.5 人天

---

### BUG-010："击败 X% 用户"前端预留字段，后端**不返回**

- **PRD 依据**：4.6 — "顶部数据卡: 总分、正确率、用时、击败 X% 用户"
- **现状**：
  - `miniprogram/pages/paper-result/index.ts:114-117` 等 `summary.rank_percentile`
  - `PaperService.getResult` 的 `summary` 只返 `total_score / max_score / accuracy / time_spent_sec`
  - **结果页这个数据点永远空**
- **修复方向**：
  1. 在 `getResult` 中算 percentile：`SELECT COUNT(*) FROM paper WHERE bookId = ? AND status = 'graded' AND total_score < ?` / `SELECT COUNT(*) FROM paper WHERE bookId = ?`
  2. 字段加到 summary 返回；产品确认是 "同书读者" 还是 "全站用户" 口径
- **涉及文件**：`backend/src/modules/paper/paper.service.ts:716-724`
- **预估工作量**：0.5 人天

---

### BUG-011：跨设备草稿同步**未实现**

- **PRD 依据**：7.6.2 — "同账号在新设备登录可恢复"
- **现状**：
  - `paper-answer/onLoad` 只 `loadDraftFromLocal`
  - **不调** `GET /papers/:id/draft`
- **修复方向**：进入答题页时先拉服务端 draft → 与本地合并（取 updated 较新）
- **涉及文件**：`miniprogram/pages/paper-answer/index.ts`
- **预估工作量**：0.5 人天

---

### BUG-012：拍照流程多个核心 PRD 行为偏离

#### 12.a OCR 主路径在 `wechat` 模式下其实是空的

- **现状**：`backend/.../photo.service.startOcr` 只把状态改成 `processing`，**不写整图 OCR 文本**；前端 `photo-review` 也没接微信 OCR 插件 → 默认场景下"OCR 完成后给文本预览"这步**根本没文本**
- **修复方向**：
  1. 在 `photo-review/index.ts` 接入 `wx.getOCREngine`（小程序 OCR 插件 / `wx.serviceMarket.invokeService`）
  2. 或在后端切到 `tencent` 模式（需补 `tencent` 分支实现，目前 `throw new Error('not implemented')`）
- **预估工作量**：1-2 人天（含微信 OCR 插件接入）

#### 12.b 长按是删除而不是拖动排序

- **现状**：`pages/photo/index.ts:181-192` 长按 = 删除确认；后端 `reorder` 接口现成
- **修复方向**：把删除挪到角标 X，长按改用 `movable-view` 拖拽 → `photoService.reorder`
- **预估工作量**：0.5 人天

#### 12.c 单页 OCR 失败状态 + 红色重试图标缺失

- **现状**：`Photo` 表无 per-photo `ocrStatus`，UI 也没单页重试
- **修复方向**：Prisma 加 `Photo.ocrStatus`；前端缩略图根据 `ocr_status` 渲染失败角标 + 单页重试按钮
- **预估工作量**：1 人天

#### 12.d 拍照页崩溃恢复未实现

- **现状**：`STORAGE_KEYS.PHOTO_DRAFT` 只在 constants 定义，**全仓零引用**
- **修复方向**：`photoStore` 写入时镜像到 `wx.setStorageSync(PHOTO_DRAFT, …)`，`onLoad` 读取
- **预估工作量**：0.5 人天

#### 12.e 手写/外语提示、"跳过此页"文案与能力都缺

- **修复方向**：
  - 简单启发式：OCR 文本字数 < 5 → "未识别到文字, 请检查光线或重拍"
  - 校对页每条 `textarea` 旁加"跳过此页"按钮，将该页 `is_skipped = true` 不参与出题
- **预估工作量**：0.5 人天

---

### BUG-013：内容安全的"轻度/重度"分层缺失

- **PRD 依据**：4.7.4 — 轻度命中走 40001，重度命中走 40002 + 后台告警 + 用户次数 -1
- **现状**：
  - `moderation.service.mapSuggest` 把 `risky` 一律映射 `block`
  - `checkOrThrow` 走到 block 一律 `throw new ContentBlockedException(..., true)`
  - **结果一律变 40002**
- **修复方向**：
  1. 根据微信 `label / detail` 判断严重程度，映射 mild / severe
  2. mild → `ContentBlockedException(reason, false)` → 错误码 40001
  3. severe → `ContentBlockedException(reason, true)` → 错误码 40002 + 调 `quota.consume(userId, 'penalty', 1)` + 异步 webhook 告警
- **涉及文件**：`backend/src/modules/moderation/moderation.service.ts`
- **预估工作量**：1 人天

---

### BUG-014：出题配额相关问题（合 3 条）

#### 14.a 凌晨 0 点倒计时未做

- **现状**：API 已返回 `today.reset_at`，`miniprogram/types/domain.ts` 有 `QuotaSnapshot.reset_at`，但全小程序**零使用**
- **修复方向**：在 `quota-badge` 组件内部 `setInterval(60s)` 算到 `reset_at` 的剩余时间，0 配额时显示 "明日 06h 36m 重置"

#### 14.b 取消窗口前后端不一致

- **现状**：
  - 后端：`Date.now() - paper.createdAt < CANCEL_GRACE_MS(30s)`
  - 前端：用进入加载页**本地经过时间** `< CANCEL_WINDOW_MS`
- **修复方向**：前端拿 `paper.created_at` 算剩余可取消秒数

#### 14.c AI 输出题量 < 50% 不触发失败

- **现状**：`validate_and_repair_questions` 在题量不足时仅 `logger.warning`
- **修复方向**：题量 < `期望 × 50%` 抛 `InsufficientQuestionsError` → worker 走 `failed` + `quota.refund`

- **预估工作量**：合计 1 人天

---

### BUG-015：失败 Toast / 跳转目标与 PRD 不一致

- **PRD 依据**：4.7.1 — "Toast「AI 繁忙, 请稍后再试」+ 返回配置页"
- **现状**：通用文案 + `navigateBack`
- **修复方向**：
  - `paper-loading` 的失败分支：`toast('AI 繁忙, 请稍后再试', 'error')` → `wx.redirectTo('/pages/paper-config/index?...')`
- **涉及文件**：`miniprogram/pages/paper-loading/index.ts:87-88`
- **预估工作量**：10 分钟

---

### BUG-016：系统配置"仅超管"权限**前端、后端、PRD 三方对不上**

| 端 | 现状 |
|---|---|
| **PRD** | A09 明写"仅超管(super_admin)" |
| **后端** | `AdminConfigController` 是 `@Roles('admin', 'super_admin')` |
| **前端** | 文案"仅 super_admin"，但侧栏对所有 admin 都显示 |

- **修复方向**：与产品确认归一
  - 选择 A（按 PRD）：`AdminConfigController` 收紧到 `@Roles('super_admin')`，路由 meta 加 `superAdminOnly: true`，侧栏隐藏
  - 选择 B（按现状）：改 PRD + 前端文案
- **预估工作量**：0.5 人天

---

### BUG-017：简答题"改进建议必给"未实现

- **PRD 依据**：4.6.1 — "改进建议: 简答题必给, 填空题选给"
- **现状**：
  - `prompt_builder` 中 `suggestions` 是可选字段
  - `paper-grade.processor.ts:202-208` 读到 `suggestions` 但**没写入 DB**（`Answer` 表无对应字段）
  - 结果页**没有改进建议区块**
- **修复方向**：
  1. Prisma `Answer` 加 `aiSuggestions Json?`
  2. processor 写库
  3. `paper-result` 题目卡新增 "改进建议" 区
  4. prompt 中 short_answer 强制 `suggestions.length >= 1`
- **预估工作量**：0.5 人天

---

### BUG-018：设置页与"我的"信息架构与 PRD 对不上

- **PRD 依据**：U14 设置页含 "清缓存、反馈、关于、隐私协议、未成年人模式"
- **现状**：
  - 反馈入口在"我的"通用列表，不在设置页
  - 注销路径"设置 → 账号"，不是 PRD 写的"设置 → 账号与安全 → 注销账号"
  - 注销冷静期 7 天后**没有数据清理 job**
  - 注销**没有订阅消息通知确认**
- **修复方向**：
  1. 把"反馈"行从`profile/index.wxml` 移到 `settings/index.wxml`
  2. 注销做成二级 `pages/settings-account/index`
  3. 新建 cron `cleanup-cancelled-users.ts`：`status = -1 AND deletedAt < now()-7d` 的用户走"24h 内清理"
  4. 接 `wx.requestSubscribeMessage` 拿到一次性订阅，注销生效时下发
- **预估工作量**：1.5 人天

---

### BUG-019：数据保留策略**没有清理任务**

| 数据 | PRD | 实现 |
|---|---|---|
| 拍照临时内容 | 7 天后清理 | 只有 `expiresAt` 字段 + 业务侧拦截，**无物理删除 job** |
| OCR 文本 | 出题完成后保留 30 天 | 与 `PhotoSet` 同 7 天，**未拆开** |
| 审核日志 | ≥ 6 个月加密留存 | schema 注释建议分区，**无任何 cron** |

- **修复方向**：
  1. cron `cleanup-photo-set.ts`：`expiresAt < now()` → 删 OSS + 删行
  2. `PhotoSet.ocrExpiresAt` 字段（出题成功时设 +30 天）
  3. cron `cleanup-moderation-log.ts`：`createdAt < now() - 180d` → 归档/删
- **预估工作量**：1 人天

---

### BUG-020：新用户首次默认题量 = 5 未实现

- **PRD 依据**：4.4 — "题量: 5、10、20、自定义(上限 50); 单选; **新用户首次默认 5**"
- **现状**：所有用户的 `DEFAULT_CONFIG.count` = 10
- **修复方向**：
  ```ts
  const isFirstTime = userStore.stats.total_papers === 0;
  count: isFirstTime ? 5 : 10,
  ```
- **涉及文件**：`miniprogram/stores/paper.ts`、`miniprogram/pages/paper-config/index.ts`
- **预估工作量**：10 分钟

---

## 四、P2 体验 / 工程细节

| ID | 描述 | 关键文件 | 估时 |
|---|---|---|---|
| BUG-021 | "指定页码出题" 完全未实现（PRD 4.4 提了一句） | `CreatePaperDto`、`paper-config` | 0.5d |
| BUG-022 | A05 书籍编辑独立页 / A07 用户详情独立页：当前是弹窗 + 抽屉 | `admin-web/src/router` | 1d |
| BUG-023 | A07 用户记录：`AdminUserService.detail` 只返回 count，没"上传/答题"列表 | `backend/src/modules/admin/services/admin-user.service.ts:78-110` | 1d |
| BUG-024 | A01 工作台快捷入口缺失 | `admin-web/src/pages/dashboard/index.vue` | 0.5d |
| BUG-025 | A10 AI 内容快照在审核日志页未展示 | `admin-web/src/pages/audits/index.vue` | 0.5d |
| BUG-026 | API 成本聚合口径只算 `paper.llmCost`，不含批改 / 视觉链路 | `backend/.../admin-stats.service.ts:79-105` | 0.5d |
| BUG-027 | 关于页公示模型硬编码 "DeepSeek-Chat"，未读 `system_config.llm_runtime` | `miniprogram/pages/settings/index.wxml:52-55` | 0.25d |
| BUG-028 | 结果页"我的答案"红/绿：只有 chip 区分，没按对错统一着色 | `miniprogram/components/question-card/index.wxss` | 0.25d |
| BUG-029 | ~~儿童规则独立页~~ **已作废**（随未成年人模式移除） | — | — |
| BUG-030 | 境外未备案模型硬校验：现在配置随意填模型名，没有 allowlist | `admin-web/src/pages/configs`、`admin-config.service.ts` | 0.5d |
| BUG-031 | `pages/book-upload/index.ts:130` 一处 TS 类型错（`file.type !== 'pdf'` 与 IChooseMessageFileFile.type 类型不交） | `miniprogram/pages/book-upload/index.ts:130` | 5min |
| BUG-032 | 引导页"首次"判定仅看本地 `ONBOARDING_DONE`，老用户清缓存会重新过引导 | `miniprogram/pages/login/index.ts:67-69,116-121` | 0.25d |

---

## 五、修复优先级与排期建议

### 第一冲刺（合规 + 闭环修复）：~3-4 人天

| # | BUG | 估时 |
|---|---|---|
| 1 | BUG-006 错题"全部重做"调用 BUG | 10min |
| 2 | BUG-001 AI 输出 msgSecCheck + 重生成 + 降级 | 1d |
| 3 | BUG-002 主观答案 msgSecCheck + 屏蔽 | 0.5d |
| 4 | BUG-003 协议重同意链路接通 | 0.5d |
| 5 | BUG-005 LLM 全量请求/响应日志落库 | 1d |
| 6 | BUG-007 PDF 内容安全 | 1d |

### 第二冲刺（与 PRD 对齐功能闭环）：~5-8 人天

| # | BUG | 估时 |
|---|---|---|
| 1 | BUG-008 AI 评分阈值 / 字数 / 文案 | 0.5d |
| 2 | BUG-009 错题 30 天冷静期 | 0.5d |
| 3 | BUG-010 击败 X% percentile | 0.5d |
| 4 | BUG-011 跨设备草稿同步 | 0.5d |
| 5 | BUG-012 拍照流程 5 子项（按 12.a/12.b 优先） | 3-4d |
| 6 | BUG-014 配额 3 子项 | 1d |
| 7 | BUG-017 改进建议落库 + 展示 | 0.5d |
| 8 | BUG-020 首次默认 count=5 | 10min |

### 第三冲刺（合规细节 + 体验打磨）：~3-5 人天

| # | BUG | 估时 |
|---|---|---|
| 1 | BUG-013 内容安全轻度/重度分层 | 1d |
| 2 | BUG-015 失败文案 + 跳转 | 10min |
| 3 | BUG-016 系统配置权限对齐 | 0.5d |
| 4 | BUG-018 设置页信息架构 + 注销清理 | 1.5d |
| 5 | BUG-019 数据保留 cron | 1d |

### 第四冲刺（P2 打磨）：~3-4 人天

按上表 BUG-021 ~ BUG-032 顺序排即可。

---

## 附录 A：全部条目索引

| ID | 标题 | 等级 | 模块 | 估时 |
|---|---|---|---|---|
| BUG-001 | AI 生成内容未做内容安全检查 | P0 | backend / paper | 1d |
| BUG-002 | 主观题答案未做内容安全审核 | P0 | backend / paper | 0.5d |
| BUG-003 | 协议变更后强制重同意链路断了 | P0 | miniprogram / auth | 0.5d |
| BUG-004 | ~~未成年人模式~~ | **作废** | — | — |
| BUG-005 | AI 调用日志未保留 prompt+response ≥ 6 月 | P0 | backend / ai-service | 1d |
| BUG-006 | 错题"全部重做"接口调用方式错误 | P0 | miniprogram / mistake | 10min |
| BUG-007 | 用户上传 PDF 完全没做内容安全 | P0 | backend / book | 1d |
| BUG-008 | AI 评分阈值 / 字数 / 文案与 PRD 不一致 | P1 | ai-service / backend / mp | 0.5d |
| BUG-009 | 错题 30 天后再错才重新加入未实现 | P1 | backend / mistake | 0.5d |
| BUG-010 | 击败 X% 后端不返回 percentile | P1 | backend / paper | 0.5d |
| BUG-011 | 跨设备草稿同步未实现 | P1 | miniprogram / paper | 0.5d |
| BUG-012a | OCR 主路径在 wechat 模式下其实是空的 | P1 | mp / backend / photo | 1-2d |
| BUG-012b | 长按是删除而不是拖动排序 | P1 | mp / photo | 0.5d |
| BUG-012c | 单页 OCR 失败状态 + 重试缺失 | P1 | mp / backend / photo | 1d |
| BUG-012d | 拍照页崩溃恢复未实现 | P1 | mp / photo | 0.5d |
| BUG-012e | 手写/外语提示、跳过此页缺失 | P1 | mp / photo-review | 0.5d |
| BUG-013 | 内容安全轻度/重度分层缺失 | P1 | backend / moderation | 1d |
| BUG-014a | 凌晨 0 点倒计时未做 | P1 | mp / quota-badge | 0.3d |
| BUG-014b | 取消窗口前后端不一致 | P1 | mp / paper-loading | 0.3d |
| BUG-014c | AI 题量 < 50% 不触发失败 | P1 | ai-service / parser | 0.3d |
| BUG-015 | 失败 Toast / 跳转目标不一致 | P1 | mp / paper-loading | 10min |
| BUG-016 | 系统配置"仅超管"权限三方对不上 | P1 | backend / mp / 文档 | 0.5d |
| BUG-017 | 改进建议未落库 + 未展示 | P1 | backend / mp / ai-service | 0.5d |
| BUG-018 | 设置页信息架构 + 注销清理 | P1 | mp / backend cron | 1.5d |
| BUG-019 | 数据保留无清理任务 | P1 | backend cron | 1d |
| BUG-020 | 新用户首次默认题量 5 未实现 | P1 | mp | 10min |
| BUG-021 | 指定页码出题未实现 | P2 | 全栈 | 0.5d |
| BUG-022 | A05/A07 独立页 vs 弹窗 | P2 | admin-web | 1d |
| BUG-023 | A07 用户详情缺记录列表 | P2 | backend / admin-web | 1d |
| BUG-024 | A01 工作台缺快捷入口 | P2 | admin-web | 0.5d |
| BUG-025 | A10 AI 快照未展示 | P2 | admin-web | 0.5d |
| BUG-026 | API 成本聚合口径不全 | P2 | backend | 0.5d |
| BUG-027 | 关于页公示模型硬编码 | P2 | mp / settings | 0.25d |
| BUG-028 | 结果页用户答案红/绿语义 | P2 | mp / question-card | 0.25d |
| BUG-029 | ~~儿童规则独立页~~ | **作废** | — | — |
| BUG-030 | 境外未备案模型 allowlist | P2 | backend / admin-web | 0.5d |
| BUG-031 | book-upload TS 类型错 | P2 | mp | 5min |
| BUG-032 | 引导页首次判定不严 | P2 | mp / login | 0.25d |

---

> 文档结束。建议把每个 BUG 拆成 GitHub Issue（或对应工单系统），按"第一冲刺"开干。
