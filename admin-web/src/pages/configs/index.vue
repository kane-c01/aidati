<template>
  <div class="page app-container">
    <header class="page-hero">
      <div>
        <h2 class="page-hero__title">
          系统配置
        </h2>
        <p class="page-hero__subtitle">
          仅 super_admin 可见,修改保存后立即对全站生效。
        </p>
      </div>
      <div class="page-hero__actions">
        <el-button
          :icon="Refresh"
          :loading="loading"
          @click="load"
        >
          刷新
        </el-button>
      </div>
    </header>

    <el-skeleton
      v-if="loading && !ready"
      :rows="8"
      animated
    />

    <template v-else>
      <!-- 卡片 1:全站公告 & 首页轮播 -->
      <el-card
        shadow="never"
        class="config-card"
      >
        <template #header>
          <div class="card-header">
            <div>
              <span class="card-title">全站公告 & 首页轮播</span>
              <span class="card-tip">控制小程序首页的公告弹窗与轮播图位</span>
            </div>
            <div class="card-header-right">
              <el-tag
                v-if="cardDirty.announce"
                type="warning"
                size="small"
                effect="light"
              >
                未保存
              </el-tag>
              <el-button
                type="primary"
                :disabled="!cardDirty.announce"
                :loading="saving.announce"
                @click="saveAnnounceCard"
              >
                保存修改
              </el-button>
            </div>
          </div>
        </template>

        <!-- 公告 -->
        <div class="sub-block">
          <div class="sub-block-header">
            <span class="sub-title">全站公告</span>
            <el-switch
              v-model="form.announcement.active"
              active-text="开启"
              inactive-text="关闭"
              inline-prompt
            />
          </div>
          <p class="sub-desc">
            开启后,用户进入小程序首页会弹出该公告。建议大版本/重要变更才使用。
          </p>
          <el-form
            :disabled="!form.announcement.active"
            label-position="top"
          >
            <el-form-item label="公告标题">
              <el-input
                v-model="form.announcement.title"
                maxlength="40"
                show-word-limit
                placeholder="例:寒假活动开放,完成出题领勋章"
              />
            </el-form-item>
            <el-form-item label="公告内容">
              <el-input
                v-model="form.announcement.content"
                type="textarea"
                :rows="4"
                maxlength="500"
                show-word-limit
                placeholder="支持普通文字,客户端会自动换行展示"
              />
            </el-form-item>
          </el-form>
        </div>

        <el-divider />

        <!-- 轮播图 -->
        <div class="sub-block">
          <div class="sub-block-header">
            <span class="sub-title">首页轮播图</span>
            <el-button
              type="primary"
              :icon="Plus"
              size="small"
              plain
              @click="addBanner"
            >
              添加一张
            </el-button>
          </div>
          <p class="sub-desc">
            按"排序号"由小到大展示。留空表示不展示轮播位。
          </p>
          <el-empty
            v-if="form.home_banners.length === 0"
            description="暂未配置,点击右上角添加"
            :image-size="80"
          />
          <div
            v-else
            class="banner-list"
          >
            <div
              v-for="(b, idx) in form.home_banners"
              :key="idx"
              class="banner-row"
            >
              <div class="banner-thumb">
                <el-image
                  v-if="b.image_url"
                  :src="b.image_url"
                  fit="cover"
                  class="banner-img"
                  :preview-src-list="[b.image_url]"
                  preview-teleported
                  hide-on-click-modal
                >
                  <template #error>
                    <div class="banner-err">
                      <el-icon><Picture /></el-icon>
                      加载失败
                    </div>
                  </template>
                </el-image>
                <div
                  v-else
                  class="banner-err"
                >
                  <el-icon><Picture /></el-icon>
                  暂无图片
                </div>
              </div>
              <div class="banner-fields">
                <el-input
                  v-model="b.image_url"
                  placeholder="图片 URL,如 https://cdn.example.com/banner1.jpg"
                  size="small"
                >
                  <template #prepend>
                    图片
                  </template>
                </el-input>
                <el-input
                  v-model="b.link"
                  placeholder="点击跳转链接,可填小程序路径或 H5"
                  size="small"
                >
                  <template #prepend>
                    跳转
                  </template>
                </el-input>
                <el-input-number
                  v-model="b.sort_no"
                  :min="0"
                  :max="999"
                  size="small"
                  controls-position="right"
                  class="sort-input"
                />
              </div>
              <div class="banner-ops">
                <el-tooltip content="上移">
                  <el-button
                    :icon="ArrowUp"
                    text
                    :disabled="idx === 0"
                    @click="moveBanner(idx, -1)"
                  />
                </el-tooltip>
                <el-tooltip content="下移">
                  <el-button
                    :icon="ArrowDown"
                    text
                    :disabled="idx === form.home_banners.length - 1"
                    @click="moveBanner(idx, 1)"
                  />
                </el-tooltip>
                <el-tooltip content="删除">
                  <el-button
                    :icon="Delete"
                    text
                    type="danger"
                    @click="removeBanner(idx)"
                  />
                </el-tooltip>
              </div>
            </div>
          </div>
        </div>
      </el-card>

      <!-- 卡片 2:出题额度 & 单卷限制 -->
      <el-card
        shadow="never"
        class="config-card"
      >
        <template #header>
          <div class="card-header">
            <div>
              <span class="card-title">出题额度 & 单卷限制</span>
              <span class="card-tip">控制每日 AI 出题用量与单次最大题量</span>
            </div>
            <div class="card-header-right">
              <el-tag
                v-if="cardDirty.quota"
                type="warning"
                size="small"
                effect="light"
              >
                未保存
              </el-tag>
              <el-button
                type="primary"
                :disabled="!cardDirty.quota"
                :loading="saving.quota"
                @click="saveQuotaCard"
              >
                保存修改
              </el-button>
            </div>
          </div>
        </template>
        <el-row :gutter="20">
          <el-col
            :xs="24"
            :sm="12"
            :md="8"
          >
            <div class="num-item">
              <div class="num-label">
                新注册用户首日额度
              </div>
              <div class="num-desc">
                用户注册首日可出题次数,鼓励试用
              </div>
              <el-input-number
                v-model="form.daily_quota_user_first"
                :min="0"
                :max="9999"
                controls-position="right"
                class="num-input"
              />
            </div>
          </el-col>
          <el-col
            :xs="24"
            :sm="12"
            :md="8"
          >
            <div class="num-item">
              <div class="num-label">
                普通用户每日额度
              </div>
              <div class="num-desc">
                第二天起的常规额度
              </div>
              <el-input-number
                v-model="form.daily_quota_user"
                :min="0"
                :max="9999"
                controls-position="right"
                class="num-input"
              />
            </div>
          </el-col>
          <el-col
            :xs="24"
            :sm="12"
            :md="8"
          >
            <div class="num-item">
              <div class="num-label">
                管理员每日额度
              </div>
              <div class="num-desc">
                admin / super_admin 角色每日上限
              </div>
              <el-input-number
                v-model="form.daily_quota_admin"
                :min="0"
                :max="99999"
                controls-position="right"
                class="num-input"
              />
            </div>
          </el-col>
          <el-col
            :xs="24"
            :sm="12"
            :md="8"
          >
            <div class="num-item">
              <div class="num-label">
                单卷最大题量
              </div>
              <div class="num-desc">
                一次出题请求最多生成多少题
              </div>
              <el-input-number
                v-model="form.max_paper_questions"
                :min="1"
                :max="200"
                controls-position="right"
                class="num-input"
              />
            </div>
          </el-col>
          <el-col
            :xs="24"
            :sm="12"
            :md="8"
          >
            <div class="num-item">
              <div class="num-label">
                单次拍照集最大页数
              </div>
              <div class="num-desc">
                拍照出题一次最多上传多少张
              </div>
              <el-input-number
                v-model="form.max_photo_pages"
                :min="1"
                :max="50"
                controls-position="right"
                class="num-input"
              />
            </div>
          </el-col>
        </el-row>
      </el-card>

      <!-- 卡片 3:AI 模型 -->
      <el-card
        shadow="never"
        class="config-card"
      >
        <template #header>
          <div class="card-header">
            <div>
              <span class="card-title">AI 模型选择</span>
              <span class="card-tip">主备模型切换,主模型异常时自动降级到备用</span>
            </div>
            <div class="card-header-right">
              <el-tag
                v-if="cardDirty.llm"
                type="warning"
                size="small"
                effect="light"
              >
                未保存
              </el-tag>
              <el-button
                type="primary"
                :disabled="!cardDirty.llm"
                :loading="saving.llm"
                @click="saveLlmCard"
              >
                保存修改
              </el-button>
            </div>
          </div>
        </template>
        <el-alert
          type="warning"
          :closable="false"
          show-icon
          class="alert-tip"
          title="密钥以明文写入数据库 system_config；本页只展示 ••••••••<末 4 位> 占位,不显示真实值。输入框留空或保持占位提交,后端会拒绝覆盖。如需真正清除,请走 super_admin 工单流程。"
        />
        <el-row :gutter="20">
          <el-col
            :xs="24"
            :sm="12"
          >
            <div class="num-item">
              <div class="num-label">
                <el-icon><Star /></el-icon>
                主用模型
              </div>
              <div class="num-desc">
                正常情况下使用此模型出题/批改
              </div>
              <el-select
                v-model="form.current_llm_primary"
                filterable
                allow-create
                default-first-option
                placeholder="选择或输入模型 ID"
                class="num-input"
              >
                <el-option
                  v-for="m in LLM_PRESETS"
                  :key="m.value"
                  :label="m.label"
                  :value="m.value"
                />
              </el-select>
            </div>
          </el-col>
          <el-col
            :xs="24"
            :sm="12"
          >
            <div class="num-item">
              <div class="num-label">
                <el-icon><CopyDocument /></el-icon>
                备用模型
              </div>
              <div class="num-desc">
                主模型超时/失败时自动切换
              </div>
              <el-select
                v-model="form.current_llm_backup"
                filterable
                allow-create
                default-first-option
                placeholder="选择或输入模型 ID"
                class="num-input"
              >
                <el-option
                  v-for="m in LLM_PRESETS"
                  :key="m.value"
                  :label="m.label"
                  :value="m.value"
                />
              </el-select>
            </div>
          </el-col>
        </el-row>

        <el-divider content-position="left">
          厂商密钥与接口地址
        </el-divider>
        <p class="llm-key-tip">
          下列 Key 与 Base URL 可选填；非空时优先于 ai-service 进程环境变量。模型 ID 仍使用上方主/备下拉框。
        </p>
        <el-row
          :gutter="16"
          class="llm-key-row"
        >
          <el-col
            :xs="24"
            :sm="8"
          >
            <div class="num-item">
              <div class="num-label">
                DeepSeek API Key
              </div>
              <el-input
                v-model="form.llm_deepseek_api_key"
                type="password"
                show-password
                autocomplete="new-password"
                placeholder="留空或保持占位 = 不修改"
                class="num-input"
              />
            </div>
          </el-col>
          <el-col
            :xs="24"
            :sm="8"
          >
            <div class="num-item">
              <div class="num-label">
                通义千问 API Key
              </div>
              <el-input
                v-model="form.llm_qwen_api_key"
                type="password"
                show-password
                autocomplete="new-password"
                placeholder="留空或保持占位 = 不修改"
                class="num-input"
              />
            </div>
          </el-col>
          <el-col
            :xs="24"
            :sm="8"
          >
            <div class="num-item">
              <div class="num-label">
                智谱 GLM API Key
              </div>
              <el-input
                v-model="form.llm_glm_api_key"
                type="password"
                show-password
                autocomplete="new-password"
                placeholder="留空或保持占位 = 不修改"
                class="num-input"
              />
            </div>
          </el-col>
        </el-row>
        <el-row
          :gutter="16"
          class="llm-key-row"
        >
          <el-col
            :xs="24"
            :sm="8"
          >
            <div class="num-item">
              <div class="num-label">
                DeepSeek Base URL
              </div>
              <el-input
                v-model="form.llm_deepseek_base_url"
                type="text"
                clearable
                placeholder="可选覆盖，默认 https://api.deepseek.com"
                class="num-input"
              />
            </div>
          </el-col>
          <el-col
            :xs="24"
            :sm="8"
          >
            <div class="num-item">
              <div class="num-label">
                通义 Base URL
              </div>
              <el-input
                v-model="form.llm_qwen_base_url"
                type="text"
                clearable
                placeholder="可选覆盖 compatible-mode 地址"
                class="num-input"
              />
            </div>
          </el-col>
          <el-col
            :xs="24"
            :sm="8"
          >
            <div class="num-item">
              <div class="num-label">
                智谱 Base URL
              </div>
              <el-input
                v-model="form.llm_glm_base_url"
                type="text"
                clearable
                placeholder="可选覆盖 OpenAPI 地址"
                class="num-input"
              />
            </div>
          </el-col>
        </el-row>
        <el-alert
          v-if="form.current_llm_primary && form.current_llm_primary === form.current_llm_backup"
          type="warning"
          :closable="false"
          show-icon
          class="alert-tip"
          title="主备模型相同,失败时无法降级,请配置不同的备用模型"
        />

        <!-- 测试 AI 连接 -->
        <div class="test-row">
          <el-button
            :icon="Connection"
            :loading="testing"
            @click="onTestAi"
          >
            测试 AI 连接
          </el-button>
          <el-tag
            v-if="testResult === 'ok'"
            type="success"
            effect="plain"
            size="small"
          >
            ✅ ai-service 在线
          </el-tag>
          <el-tag
            v-else-if="testResult === 'fail'"
            type="danger"
            effect="plain"
            size="small"
          >
            ❌ ai-service 不通(检查后端 → ai-service 网络)
          </el-tag>
          <span
            v-if="testResult"
            class="test-hint"
          >测试时间 {{ testTs }}</span>
        </div>
      </el-card>

      <!-- 卡片 3.4:对象存储 OSS -->
      <el-card
        shadow="never"
        class="config-card"
      >
        <template #header>
          <div class="card-header">
            <div>
              <span class="card-title">对象存储 (OSS)</span>
              <span class="card-tip">图片、PDF 等文件的存储配置,支持腾讯云 COS / 阿里云 OSS / 本地 MinIO</span>
            </div>
            <div class="card-header-right">
              <el-tag
                v-if="cardDirty.oss"
                type="warning"
                size="small"
                effect="light"
              >
                未保存
              </el-tag>
              <el-button
                type="primary"
                :disabled="!cardDirty.oss"
                :loading="saving.oss"
                @click="saveOssCard"
              >
                保存修改
              </el-button>
            </div>
          </div>
        </template>
        <el-alert
          type="warning"
          :closable="false"
          show-icon
          class="alert-tip"
          title="修改存储配置后需要重启后端服务才能生效。留空的字段将使用服务器环境变量 (.env) 中的值。"
        />
        <el-row :gutter="20">
          <el-col
            :xs="24"
            :sm="12"
          >
            <div class="num-item">
              <div class="num-label">
                存储提供商
              </div>
              <div class="num-desc">
                minio (本地开发) / tencent_cos (腾讯云) / aliyun_oss (阿里云)
              </div>
              <el-select
                v-model="form.oss_provider"
                filterable
                allow-create
                default-first-option
                placeholder="留空使用环境变量"
                class="num-input"
              >
                <el-option
                  label="MinIO (本地开发)"
                  value="minio"
                />
                <el-option
                  label="腾讯云 COS"
                  value="tencent_cos"
                />
                <el-option
                  label="阿里云 OSS"
                  value="aliyun_oss"
                />
              </el-select>
            </div>
          </el-col>
          <el-col
            :xs="24"
            :sm="12"
          >
            <div class="num-item">
              <div class="num-label">
                Endpoint
              </div>
              <div class="num-desc">
                COS: https://cos.ap-guangzhou.myqcloud.com
              </div>
              <el-input
                v-model="form.oss_endpoint"
                clearable
                placeholder="留空使用环境变量"
                class="num-input"
              />
            </div>
          </el-col>
          <el-col
            :xs="24"
            :sm="12"
          >
            <div class="num-item">
              <div class="num-label">
                Bucket
              </div>
              <div class="num-desc">
                对象存储桶名称
              </div>
              <el-input
                v-model="form.oss_bucket"
                clearable
                placeholder="留空使用环境变量"
                class="num-input"
              />
            </div>
          </el-col>
          <el-col
            :xs="24"
            :sm="12"
          >
            <div class="num-item">
              <div class="num-label">
                Region
              </div>
              <div class="num-desc">
                COS: ap-guangzhou / OSS: oss-cn-hangzhou
              </div>
              <el-input
                v-model="form.oss_region"
                clearable
                placeholder="留空使用环境变量"
                class="num-input"
              />
            </div>
          </el-col>
          <el-col
            :xs="24"
            :sm="12"
          >
            <div class="num-item">
              <div class="num-label">
                Access Key
              </div>
              <div class="num-desc">
                COS: SecretId / OSS: AccessKeyId
              </div>
              <el-input
                v-model="form.oss_access_key"
                clearable
                placeholder="明文存储,留空使用环境变量"
                class="num-input"
              />
            </div>
          </el-col>
          <el-col
            :xs="24"
            :sm="12"
          >
            <div class="num-item">
              <div class="num-label">
                Secret Key
              </div>
              <div class="num-desc">
                COS: SecretKey / OSS: AccessKeySecret
              </div>
              <el-input
                v-model="form.oss_secret_key"
                type="password"
                show-password
                clearable
                placeholder="明文存储,留空使用环境变量"
                class="num-input"
              />
            </div>
          </el-col>
          <el-col :xs="24">
            <div class="num-item">
              <div class="num-label">
                公开访问基址 (Public Base URL)
              </div>
              <div class="num-desc">
                用于拼接可访问的文件 URL,如 https://your-bucket.cos.ap-guangzhou.myqcloud.com
              </div>
              <el-input
                v-model="form.oss_public_base"
                clearable
                placeholder="留空使用环境变量"
                class="num-input"
              />
            </div>
          </el-col>
        </el-row>
      </el-card>

      <!-- 卡片 3.5:视觉识别(OCR / 图表 / 公式 / 表格) -->
      <el-card
        shadow="never"
        class="config-card"
      >
        <template #header>
          <div class="card-header">
            <div>
              <span class="card-title">视觉识别(OCR / 图表 / 公式)</span>
              <span class="card-tip">框选区域识别、PDF 自动入章节、扫描件兜底都用它</span>
            </div>
            <div class="card-header-right">
              <el-tag
                v-if="cardDirty.vision"
                type="warning"
                size="small"
                effect="light"
              >
                未保存
              </el-tag>
              <el-button
                type="primary"
                :disabled="!cardDirty.vision"
                :loading="saving.vision"
                @click="saveVisionCard"
              >
                保存修改
              </el-button>
            </div>
          </div>
        </template>
        <el-alert
          type="info"
          :closable="false"
          show-icon
          class="alert-tip"
          title="去阿里云 DashScope 控制台开通通义千问 VL,生成 API Key 填入下面即可。如已经在「AI 模型」里填了通义千问 Key,这里可以留空(系统会复用)。"
        />
        <el-row :gutter="20">
          <el-col
            :xs="24"
            :sm="12"
          >
            <div class="num-item">
              <div class="num-label">
                视觉模型
              </div>
              <div class="num-desc">
                推荐 qwen-vl-max(精度顶);qwen-vl-plus 性价比;qwen-vl-ocr 仅做 OCR 但更便宜
              </div>
              <el-select
                v-model="form.vision_model"
                filterable
                allow-create
                default-first-option
                placeholder="选择或输入模型 ID"
                class="num-input"
              >
                <el-option
                  v-for="m in VISION_MODEL_PRESETS"
                  :key="m.value"
                  :label="m.label"
                  :value="m.value"
                />
              </el-select>
            </div>
          </el-col>
          <el-col
            :xs="24"
            :sm="12"
          >
            <div class="num-item">
              <div class="num-label">
                DashScope API Key
              </div>
              <div class="num-desc">
                <el-link
                  type="primary"
                  href="https://dashscope.console.aliyun.com/apiKey"
                  target="_blank"
                >
                  去阿里云开通 →
                </el-link>
                ,或留空,系统会复用上方"通义千问 API Key"
              </div>
              <el-input
                v-model="form.vision_api_key"
                type="password"
                show-password
                autocomplete="new-password"
                placeholder="留空或保持占位 = 不修改"
                class="num-input"
              />
            </div>
          </el-col>
          <el-col
            :xs="24"
            :sm="12"
          >
            <div class="num-item">
              <div class="num-label">
                Base URL(通常无需填)
              </div>
              <div class="num-desc">
                覆盖 DashScope 兼容模式接口地址,留空使用默认
              </div>
              <el-input
                v-model="form.vision_base_url"
                clearable
                placeholder="留空 = https://dashscope.aliyuncs.com/compatible-mode/v1"
                class="num-input"
              />
            </div>
          </el-col>
          <el-col
            :xs="24"
            :sm="12"
          >
            <div class="num-item">
              <div class="num-label">
                Provider 标识(高级)
              </div>
              <div class="num-desc">
                目前仅支持 qwen_vl,后续会增加腾讯/百度等
              </div>
              <el-input
                v-model="form.vision_provider"
                placeholder="qwen_vl"
                class="num-input"
              />
            </div>
          </el-col>
        </el-row>
      </el-card>

      <!-- 卡片 4:内容安全 -->
      <el-card
        shadow="never"
        class="config-card"
      >
        <template #header>
          <div class="card-header">
            <div>
              <span class="card-title">内容安全</span>
              <span class="card-tip">敏感词补充, 微信内容安全 + 自维护词库</span>
            </div>
            <div class="card-header-right">
              <el-tag
                v-if="cardDirty.safety"
                type="warning"
                size="small"
                effect="light"
              >
                未保存
              </el-tag>
              <el-button
                type="primary"
                :disabled="!cardDirty.safety"
                :loading="saving.safety"
                @click="saveSafetyCard"
              >
                保存修改
              </el-button>
            </div>
          </div>
        </template>

        <div class="sub-block">
          <div class="sub-block-header">
            <span class="sub-title">敏感词扩展</span>
          </div>
          <p class="sub-desc">
            微信内容安全 + 自维护词库,留空表示仅依赖微信。回车添加,叉号删除。
          </p>
          <el-select
            v-model="form.sensitive_words"
            multiple
            filterable
            allow-create
            default-first-option
            placeholder="输入敏感词后回车,可添加多个"
            class="sensitive-input"
            :reserve-keyword="false"
          />
          <p
            v-if="form.sensitive_words.length"
            class="sub-meta"
          >
            当前共 {{ form.sensitive_words.length }} 个词
          </p>
        </div>
      </el-card>

      <!-- 卡片 5:协议版本(高级) -->
      <el-card
        shadow="never"
        class="config-card"
      >
        <template #header>
          <div class="card-header">
            <div>
              <span class="card-title">
                协议版本
                <el-tag
                  type="danger"
                  size="small"
                  effect="plain"
                >
                  高风险
                </el-tag>
              </span>
              <span class="card-tip">修改后所有用户下次进入会被强制重新弹窗确认</span>
            </div>
            <div class="card-header-right">
              <el-tag
                v-if="cardDirty.versions"
                type="warning"
                size="small"
                effect="light"
              >
                未保存
              </el-tag>
              <el-button
                type="primary"
                :disabled="!cardDirty.versions"
                :loading="saving.versions"
                @click="saveVersionsCard"
              >
                保存修改
              </el-button>
            </div>
          </div>
        </template>
        <el-alert
          type="warning"
          :closable="false"
          show-icon
          class="alert-tip"
          title="只在协议正文真正变更时才升版本号(如 v1.0 → v1.1),否则会无故打扰用户"
        />
        <el-row :gutter="20">
          <el-col
            :xs="24"
            :sm="12"
          >
            <div class="num-item">
              <div class="num-label">
                隐私协议版本
              </div>
              <div class="num-desc">
                配套位置:小程序 /pages/agreement/privacy
              </div>
              <el-input
                v-model="form.privacy_version"
                placeholder="如 v1.0"
                maxlength="16"
                class="num-input"
              />
            </div>
          </el-col>
          <el-col
            :xs="24"
            :sm="12"
          >
            <div class="num-item">
              <div class="num-label">
                用户服务协议版本
              </div>
              <div class="num-desc">
                配套位置:小程序 /pages/agreement/terms
              </div>
              <el-input
                v-model="form.terms_version"
                placeholder="如 v1.0"
                maxlength="16"
                class="num-input"
              />
            </div>
          </el-col>
        </el-row>
      </el-card>

      <!-- 高级:原始 JSON 编辑 -->
      <el-collapse
        v-model="advancedOpen"
        class="advanced"
      >
        <el-collapse-item
          name="raw"
          title="高级 · 原始 JSON 编辑(适合开发者 / 兼容未知 key)"
        >
          <el-table
            :data="rows"
            stripe
            class="raw-table"
            row-key="key"
          >
            <el-table-column
              prop="key"
              label="Key"
              width="240"
            />
            <el-table-column
              label="Value"
              min-width="320"
            >
              <template #default="{ row }">
                <code class="code-value">{{ formatValue(row.value) }}</code>
              </template>
            </el-table-column>
            <el-table-column
              prop="description"
              label="描述"
              min-width="220"
              show-overflow-tooltip
            />
            <el-table-column
              prop="updated_at"
              label="更新时间"
              width="170"
            >
              <template #default="{ row }">
                {{ formatTime(row.updated_at) }}
              </template>
            </el-table-column>
            <el-table-column
              label="操作"
              width="100"
              fixed="right"
            >
              <template #default="{ row }">
                <el-button
                  text
                  type="primary"
                  size="small"
                  @click="openRawEdit(row)"
                >
                  改
                </el-button>
              </template>
            </el-table-column>
          </el-table>
        </el-collapse-item>
      </el-collapse>
    </template>

    <!-- 原始 JSON 编辑弹窗(兼容未知 key) -->
    <el-dialog
      v-model="rawVisible"
      :title="rawEditing ? `修改配置 ${rawEditing.key}` : '修改配置'"
      width="560px"
      :close-on-click-modal="false"
    >
      <p
        v-if="rawEditing"
        class="hint"
      >
        当前值:<code>{{ formatValue(rawEditing.value) }}</code>
      </p>
      <el-form label-position="top">
        <el-form-item label="新值(JSON)">
          <el-input
            v-model="rawValue"
            type="textarea"
            :rows="6"
            placeholder="例:10 / &quot;deepseek-chat&quot; / [&quot;a&quot;,&quot;b&quot;] / {&quot;k&quot;:&quot;v&quot;}"
          />
          <p
            v-if="parseError"
            class="error"
          >
            解析失败:{{ parseError }}
          </p>
        </el-form-item>
        <el-form-item label="备注">
          <el-input
            v-model="rawDescription"
            maxlength="200"
          />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="rawVisible = false">
          取消
        </el-button>
        <el-button
          type="primary"
          :loading="rawSaving"
          :disabled="!!parseError"
          @click="saveRaw"
        >
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup lang="ts">
import {
  ArrowDown,
  ArrowUp,
  Connection,
  CopyDocument,
  Delete,
  Picture,
  Plus,
  Refresh,
  Star,
} from '@element-plus/icons-vue';
import dayjs from 'dayjs';
import { ElMessage, ElMessageBox } from 'element-plus';
import { computed, onMounted, reactive, ref } from 'vue';

import { configApi, dashboardApi } from '@/api/admin';
import type { SystemConfigView } from '@/types/api';

interface AnnouncementValue {
  title: string;
  content: string;
  active: boolean;
}

interface BannerItem {
  image_url: string;
  link: string;
  sort_no: number;
}

interface ConfigForm {
  announcement: AnnouncementValue;
  home_banners: BannerItem[];
  daily_quota_user_first: number;
  daily_quota_user: number;
  daily_quota_admin: number;
  max_paper_questions: number;
  max_photo_pages: number;
  current_llm_primary: string;
  current_llm_backup: string;
  llm_deepseek_api_key: string;
  llm_qwen_api_key: string;
  llm_glm_api_key: string;
  llm_deepseek_base_url: string;
  llm_qwen_base_url: string;
  llm_glm_base_url: string;
  // 对象存储 OSS
  oss_provider: string;
  oss_endpoint: string;
  oss_bucket: string;
  oss_region: string;
  oss_access_key: string;
  oss_secret_key: string;
  oss_public_base: string;
  // M8 视觉模型(图片 OCR / 图表 / 公式 / 表格识别)
  vision_provider: string;
  vision_model: string;
  vision_api_key: string;
  vision_base_url: string;
  sensitive_words: string[];
  privacy_version: string;
  terms_version: string;
}

const LLM_PRESETS = [
  { value: 'deepseek-chat', label: 'DeepSeek Chat (deepseek-chat)' },
  { value: 'deepseek-reasoner', label: 'DeepSeek R1 (deepseek-reasoner)' },
  { value: 'qwen-plus', label: '通义千问 Plus (qwen-plus)' },
  { value: 'qwen-turbo', label: '通义千问 Turbo (qwen-turbo)' },
  { value: 'qwen-max', label: '通义千问 Max (qwen-max)' },
  { value: 'gpt-4o-mini', label: 'OpenAI GPT-4o mini' },
  { value: 'gpt-4o', label: 'OpenAI GPT-4o' },
  { value: 'claude-3-5-sonnet', label: 'Anthropic Claude 3.5 Sonnet' },
];

const VISION_MODEL_PRESETS = [
  { value: 'qwen-vl-max', label: '通义千问 VL Max(精度最高,推荐 · qwen-vl-max)' },
  { value: 'qwen-vl-plus', label: '通义千问 VL Plus(性价比 · qwen-vl-plus)' },
  { value: 'qwen-vl-ocr', label: '通义千问 OCR 专用模型(便宜 · qwen-vl-ocr)' },
];

// 已知字段集合(用于过滤"高级 JSON"列表里要不要重复展示)
const KNOWN_KEYS = new Set<string>([
  'announcement',
  'home_banners',
  'daily_quota_user_first',
  'daily_quota_user',
  'daily_quota_admin',
  'max_paper_questions',
  'max_photo_pages',
  'current_llm_primary',
  'current_llm_backup',
  'llm_deepseek_api_key',
  'llm_qwen_api_key',
  'llm_glm_api_key',
  'llm_deepseek_base_url',
  'llm_qwen_base_url',
  'llm_glm_base_url',
  'oss_provider',
  'oss_endpoint',
  'oss_bucket',
  'oss_region',
  'oss_access_key',
  'oss_secret_key',
  'oss_public_base',
  'vision_provider',
  'vision_model',
  'vision_api_key',
  'vision_base_url',
  'sensitive_words',
  'privacy_version',
  'terms_version',
]);

// ==== 默认值(用于缺失字段或解析失败的兜底) ====
function makeDefaultForm(): ConfigForm {
  return {
    announcement: { title: '', content: '', active: false },
    home_banners: [],
    daily_quota_user_first: 5,
    daily_quota_user: 10,
    daily_quota_admin: 50,
    max_paper_questions: 50,
    max_photo_pages: 20,
    current_llm_primary: 'deepseek-chat',
    current_llm_backup: 'qwen-plus',
    llm_deepseek_api_key: '',
    llm_qwen_api_key: '',
    llm_glm_api_key: '',
    llm_deepseek_base_url: '',
    llm_qwen_base_url: '',
    llm_glm_base_url: '',
    oss_provider: '',
    oss_endpoint: '',
    oss_bucket: '',
    oss_region: '',
    oss_access_key: '',
    oss_secret_key: '',
    oss_public_base: '',
    vision_provider: 'qwen_vl',
    vision_model: 'qwen-vl-max',
    vision_api_key: '',
    vision_base_url: '',
    sensitive_words: [],
    privacy_version: 'v1.0',
    terms_version: 'v1.0',
  };
}

const loading = ref(false);
const ready = ref(false);
const rows = ref<SystemConfigView[]>([]);
const advancedOpen = ref<string[]>([]);

// 当前编辑值与原始值(用于 diff 检测)
const form = reactive<ConfigForm>(makeDefaultForm());
const original = ref<ConfigForm>(makeDefaultForm());

const saving = reactive({
  announce: false,
  quota: false,
  llm: false,
  oss: false,
  vision: false,
  safety: false,
  versions: false,
});

// 测试 AI 连接状态
const testing = ref(false);
const testResult = ref<'ok' | 'fail' | ''>('');
const testTs = ref('');

async function onTestAi(): Promise<void> {
  testing.value = true;
  try {
    const r = await dashboardApi.aiHealth();
    testResult.value = r.ok ? 'ok' : 'fail';
    testTs.value = dayjs(r.ts).format('YYYY-MM-DD HH:mm:ss');
    if (r.ok) ElMessage.success('AI 服务已连通');
    else ElMessage.warning('AI 服务暂时不通,请检查 backend 与 ai-service 之间的网络与 X-Internal-Token');
  } catch (err) {
    testResult.value = 'fail';
    testTs.value = dayjs().format('YYYY-MM-DD HH:mm:ss');
    ElMessage.error((err as Error).message || '测试失败');
  } finally {
    testing.value = false;
  }
}

// === diff 检测(JSON 字符串比较即可,字段都是简单类型) ===
function isDirty(keys: (keyof ConfigForm)[]): boolean {
  for (const k of keys) {
    if (JSON.stringify(form[k]) !== JSON.stringify(original.value[k])) {
      return true;
    }
  }
  return false;
}

const cardDirty = computed(() => ({
  announce: isDirty(['announcement', 'home_banners']),
  quota: isDirty([
    'daily_quota_user_first',
    'daily_quota_user',
    'daily_quota_admin',
    'max_paper_questions',
    'max_photo_pages',
  ]),
  llm: isDirty([
    'current_llm_primary',
    'current_llm_backup',
    'llm_deepseek_api_key',
    'llm_qwen_api_key',
    'llm_glm_api_key',
    'llm_deepseek_base_url',
    'llm_qwen_base_url',
    'llm_glm_base_url',
  ]),
  oss: isDirty([
    'oss_provider',
    'oss_endpoint',
    'oss_bucket',
    'oss_region',
    'oss_access_key',
    'oss_secret_key',
    'oss_public_base',
  ]),
  vision: isDirty(['vision_provider', 'vision_model', 'vision_api_key', 'vision_base_url']),
  safety: isDirty(['sensitive_words']),
  versions: isDirty(['privacy_version', 'terms_version']),
}));

// === 数据加载 ===
async function load(): Promise<void> {
  loading.value = true;
  try {
    rows.value = await configApi.list();
    applyRowsToForm(rows.value);
    ready.value = true;
  } finally {
    loading.value = false;
  }
}

function applyRowsToForm(list: SystemConfigView[]): void {
  const fresh = makeDefaultForm();
  const map = new Map(list.map((r) => [r.key, r.value]));

  // announcement
  const ann = map.get('announcement');
  if (ann && typeof ann === 'object' && !Array.isArray(ann)) {
    const a = ann as Partial<AnnouncementValue>;
    fresh.announcement = {
      title: typeof a.title === 'string' ? a.title : '',
      content: typeof a.content === 'string' ? a.content : '',
      active: a.active === true,
    };
  }

  // home_banners
  const banners = map.get('home_banners');
  if (Array.isArray(banners)) {
    fresh.home_banners = banners.map((b: unknown) => {
      const item = (b ?? {}) as Partial<BannerItem>;
      return {
        image_url: typeof item.image_url === 'string' ? item.image_url : '',
        link: typeof item.link === 'string' ? item.link : '',
        sort_no: typeof item.sort_no === 'number' ? item.sort_no : 0,
      };
    });
  }

  // 数字类
  const numKeys: (keyof ConfigForm)[] = [
    'daily_quota_user_first',
    'daily_quota_user',
    'daily_quota_admin',
    'max_paper_questions',
    'max_photo_pages',
  ];
  for (const k of numKeys) {
    const v = map.get(k as string);
    if (typeof v === 'number' && Number.isFinite(v)) {
      (fresh as unknown as Record<string, number>)[k] = v;
    }
  }

  // 字符串类
  const strKeys: (keyof ConfigForm)[] = [
    'current_llm_primary',
    'current_llm_backup',
    'llm_deepseek_api_key',
    'llm_qwen_api_key',
    'llm_glm_api_key',
    'llm_deepseek_base_url',
    'llm_qwen_base_url',
    'llm_glm_base_url',
    'oss_provider',
    'oss_endpoint',
    'oss_bucket',
    'oss_region',
    'oss_access_key',
    'oss_secret_key',
    'oss_public_base',
    'vision_provider',
    'vision_model',
    'vision_api_key',
    'vision_base_url',
    'privacy_version',
    'terms_version',
  ];
  for (const k of strKeys) {
    const v = map.get(k as string);
    if (typeof v === 'string') {
      (fresh as unknown as Record<string, string>)[k] = v;
    }
  }

  // sensitive_words
  const sw = map.get('sensitive_words');
  if (Array.isArray(sw)) {
    fresh.sensitive_words = sw.filter((x): x is string => typeof x === 'string');
  }

  Object.assign(form, fresh);
  // 深拷贝快照
  original.value = JSON.parse(JSON.stringify(fresh)) as ConfigForm;
}

// === 敏感字段名集合(与后端 isSecretKey 保持一致) ===
const SECRET_KEYS = new Set<keyof ConfigForm>([
  'llm_deepseek_api_key',
  'llm_qwen_api_key',
  'llm_glm_api_key',
  'vision_api_key',
]);

/** 后端脱敏值: 全 • 或 ••••••••<最多 8 位明文尾> */
function isMaskedValue(v: unknown): boolean {
  if (typeof v !== 'string' || v.length === 0) return false;
  if (!v.startsWith('•')) return false;
  return /^•+[a-zA-Z0-9\-_=+/]{0,8}$/.test(v);
}

// === 卡片保存(逐 key 调用现有 PUT) ===
async function patchKeys(keys: (keyof ConfigForm)[]): Promise<void> {
  const changed = keys.filter(
    (k) => JSON.stringify(form[k]) !== JSON.stringify(original.value[k]),
  );
  for (const k of changed) {
    let value: unknown = form[k];

    // 敏感字段: 用户没动 / 把脱敏占位原样提交 / 仅删了一两位 → 一律视为"不修改", 不发请求
    if (SECRET_KEYS.has(k) && isMaskedValue(value)) {
      continue;
    }

    // 数字字段防止 NaN/null
    if (typeof original.value[k] === 'number' && (value === null || Number.isNaN(value))) {
      value = original.value[k];
    }
    await configApi.update(k, value);
  }
}

async function saveAnnounceCard(): Promise<void> {
  saving.announce = true;
  try {
    // 校验 banner
    for (const [i, b] of form.home_banners.entries()) {
      if (!b.image_url) {
        ElMessage.error(`第 ${i + 1} 条轮播图缺少图片 URL`);
        return;
      }
    }
    await patchKeys(['announcement', 'home_banners']);
    ElMessage.success('已保存公告 & 轮播');
    void load();
  } finally {
    saving.announce = false;
  }
}

async function saveQuotaCard(): Promise<void> {
  saving.quota = true;
  try {
    await patchKeys([
      'daily_quota_user_first',
      'daily_quota_user',
      'daily_quota_admin',
      'max_paper_questions',
      'max_photo_pages',
    ]);
    ElMessage.success('已保存额度配置');
    void load();
  } finally {
    saving.quota = false;
  }
}

async function saveLlmCard(): Promise<void> {
  saving.llm = true;
  try {
    await patchKeys([
      'current_llm_primary',
      'current_llm_backup',
      'llm_deepseek_api_key',
      'llm_qwen_api_key',
      'llm_glm_api_key',
      'llm_deepseek_base_url',
      'llm_qwen_base_url',
      'llm_glm_base_url',
    ]);
    ElMessage.success('已保存 AI 模型与密钥配置');
    void load();
  } finally {
    saving.llm = false;
  }
}

async function saveOssCard(): Promise<void> {
  saving.oss = true;
  try {
    await patchKeys([
      'oss_provider',
      'oss_endpoint',
      'oss_bucket',
      'oss_region',
      'oss_access_key',
      'oss_secret_key',
      'oss_public_base',
    ]);
    ElMessage.success('OSS 配置已保存,重启后端服务后生效');
    void load();
  } finally {
    saving.oss = false;
  }
}

async function saveVisionCard(): Promise<void> {
  saving.vision = true;
  try {
    await patchKeys(['vision_provider', 'vision_model', 'vision_api_key', 'vision_base_url']);
    ElMessage.success('已保存视觉模型配置');
    void load();
  } finally {
    saving.vision = false;
  }
}

async function saveSafetyCard(): Promise<void> {
  saving.safety = true;
  try {
    await patchKeys(['sensitive_words']);
    ElMessage.success('已保存内容安全配置');
    void load();
  } finally {
    saving.safety = false;
  }
}

async function saveVersionsCard(): Promise<void> {
  try {
    await ElMessageBox.confirm(
      '修改协议版本号会让所有用户下次进入小程序时被强制重新弹窗,确认继续吗?',
      '高风险操作',
      { type: 'warning', confirmButtonText: '确认升版本', cancelButtonText: '再想想' },
    );
  } catch {
    return;
  }
  saving.versions = true;
  try {
    await patchKeys(['privacy_version', 'terms_version']);
    ElMessage.success('协议版本已更新');
    void load();
  } finally {
    saving.versions = false;
  }
}

// === 轮播图操作 ===
function addBanner(): void {
  const nextSort = form.home_banners.reduce((m, b) => Math.max(m, b.sort_no || 0), 0) + 1;
  form.home_banners.push({ image_url: '', link: '', sort_no: nextSort });
}

function removeBanner(idx: number): void {
  form.home_banners.splice(idx, 1);
}

function moveBanner(idx: number, delta: number): void {
  const target = idx + delta;
  if (target < 0 || target >= form.home_banners.length) return;
  const arr = form.home_banners;
  [arr[idx], arr[target]] = [arr[target]!, arr[idx]!];
}

// === 高级:原始 JSON 编辑(兼容 KNOWN 之外的 key 或开发者直接修改) ===
const rawVisible = ref(false);
const rawSaving = ref(false);
const rawEditing = ref<SystemConfigView | null>(null);
const rawValue = ref('');
const rawDescription = ref('');

const parseError = computed<string | null>(() => {
  try {
    JSON.parse(rawValue.value || 'null');
    return null;
  } catch (err) {
    return (err as Error).message;
  }
});

function openRawEdit(row: SystemConfigView): void {
  rawEditing.value = row;
  rawValue.value = JSON.stringify(row.value, null, 2);
  rawDescription.value = row.description ?? '';
  rawVisible.value = true;
}

async function saveRaw(): Promise<void> {
  if (!rawEditing.value || parseError.value) return;
  if (KNOWN_KEYS.has(rawEditing.value.key)) {
    try {
      await ElMessageBox.confirm(
        `${rawEditing.value.key} 已经在上方有可视化编辑器,直接改 JSON 可能与表单状态冲突。仍然继续吗?`,
        '提示',
        { type: 'warning' },
      );
    } catch {
      return;
    }
  }
  rawSaving.value = true;
  try {
    const value = JSON.parse(rawValue.value || 'null');
    await configApi.update(
      rawEditing.value.key,
      value,
      rawDescription.value || undefined,
    );
    ElMessage.success('保存成功');
    rawVisible.value = false;
    void load();
  } finally {
    rawSaving.value = false;
  }
}

function formatValue(v: unknown): string {
  if (v === null || v === undefined) return 'null';
  if (typeof v === 'string') return v;
  return JSON.stringify(v);
}

function formatTime(ts: string): string {
  return dayjs(ts).format('YYYY-MM-DD HH:mm');
}

onMounted(load);
</script>

<style scoped lang="scss">
.config-card {
  margin-bottom: 16px;
  border: 1px solid var(--color-border-soft);
  background: var(--color-bg-card);

  :deep(.el-card__header) {
    background: var(--color-bg-soft);
    border-bottom: 1px solid var(--color-border-soft);
    padding: 14px 20px;
  }
}
.card-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--color-text-1);
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.card-tip {
  display: block;
  font-size: 12px;
  color: var(--color-text-3);
  margin-top: 4px;
}
.llm-key-tip {
  font-size: 12px;
  color: var(--color-text-3);
  margin: 0 0 12px;
  line-height: 1.5;
}
.llm-key-row {
  margin-bottom: 4px;
}
.card-header-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.sub-block {
  padding: 4px 0;
}
.sub-block-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 6px;
}
.sub-title {
  font-size: 14px;
  font-weight: 600;
  color: var(--color-text-1);
}
.sub-desc {
  font-size: 12px;
  color: var(--color-text-3);
  margin: 0 0 12px;
  line-height: 1.6;
}
.sub-meta {
  font-size: 12px;
  color: var(--color-text-2);
  margin: 8px 0 0;
}

.alert-tip {
  margin: 0 0 12px;
}

.test-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
  padding-top: 4px;
}

.test-hint {
  font-size: 12px;
  color: var(--color-text-3);
}

// 数字 / 单字段卡片项
.num-item {
  background: var(--color-bg-soft);
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-md);
  padding: 14px 16px;
  margin-bottom: 12px;
  transition: border-color var(--ease-quick), background var(--ease-quick);

  &:hover {
    border-color: var(--color-border);
    background: #fff;
  }
}
.num-label {
  font-size: 13.5px;
  font-weight: 600;
  color: var(--color-text-1);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.num-desc {
  font-size: 12px;
  color: var(--color-text-3);
  margin: 4px 0 10px;
}
.num-input {
  width: 100%;
}

// 轮播图列表
.banner-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.banner-row {
  display: flex;
  gap: 12px;
  align-items: center;
  padding: 12px;
  background: var(--color-bg-soft);
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-md);
}
.banner-thumb {
  width: 96px;
  height: 64px;
  border-radius: var(--radius-sm);
  overflow: hidden;
  background: #fff;
  border: 1px solid var(--color-border-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.banner-img {
  width: 100%;
  height: 100%;
}
.banner-err {
  font-size: 12px;
  color: var(--color-text-4);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
}
.banner-fields {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 6px;
  min-width: 0;
}
.sort-input {
  width: 140px;
}
.banner-ops {
  display: flex;
  gap: 2px;
}

.sensitive-input {
  width: 100%;
}

.time-row {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.time-cell {
  display: flex;
  align-items: center;
  gap: 8px;
}
.time-prefix {
  font-size: 13px;
  color: var(--color-text-2);
}
.time-sep {
  font-size: 13px;
  color: var(--color-text-3);
}

.advanced {
  margin-top: 24px;
  border: 1px solid var(--color-border-soft);
  border-radius: var(--radius-lg);
  background: var(--color-bg-card);

  :deep(.el-collapse-item__header) {
    background: var(--color-bg-soft);
    padding: 0 16px;
    color: var(--color-text-2);
    font-size: 13px;
    border-bottom: 1px solid var(--color-border-soft);
  }
  :deep(.el-collapse-item__wrap) {
    background: transparent;
    border-bottom: none;
  }
  :deep(.el-collapse-item:last-child .el-collapse-item__header) {
    border-bottom: none;
  }
}
.raw-table {
  background: #fff;
}
.code-value {
  background: var(--color-bg-soft);
  padding: 2px 8px;
  border-radius: var(--radius-xs);
  color: var(--color-brand);
  font-family: 'Menlo', 'Monaco', monospace;
  font-size: 12px;
  display: inline-block;
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
}
.hint {
  font-size: 13px;
  color: var(--color-text-2);
  margin: 0 0 12px;

  code {
    background: var(--color-bg-soft);
    padding: 1px 6px;
    border-radius: var(--radius-xs);
    color: var(--color-brand);
  }
}
.error {
  color: var(--color-danger);
  font-size: 12px;
  margin: 4px 0 0;
}
</style>
