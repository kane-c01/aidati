# Miniprogram - 微信小程序前端

> AI 智能出题学习小程序 - 微信小程序原生 + TypeScript + TDesign + MobX

---

## 启动

### 1. 安装依赖
```bash
# 在仓库根 pnpm install 即可
pnpm install
```

### 2. 微信开发者工具
打开「微信开发者工具」→ 导入项目:
- 项目目录:`miniprogram/`
- AppID:**点击「测试号」**(或填入你自己的真实 AppID)
- 项目名称:`ai-quiz-miniprogram`

### 3. 构建 npm
工具菜单 → **工具 → 构建 npm**(MobX / TDesign 等三方库需要)

### 4. 体验
点击「编译」,即可看到 M0 占位首页。

---

## 当前状态(M0)

✅ 项目脚手架 + 一个占位 Home 页
- 全局样式 token 已落到 `app.wxss`(对应 06-UI 文档)
- TS 严格模式
- 已声明 `permission.scope.camera / scope.album`(M2 拍照需要)

### 后续里程碑

| # | 里程碑 | 内容 |
|---|---|---|
| M8 | 小程序前端 | services / stores / 公共组件 / 14 个页面 |

---

## 后续目录形态(M8 完成后)

```
miniprogram/
├── app.ts / app.json / app.wxss / sitemap.json
├── pages/
│   ├── login/                # U01
│   ├── onboarding/           # U02
│   ├── home/                 # U03 书库 Tab
│   ├── book-detail/          # U04
│   ├── photo/                # U05 拍照 Tab
│   ├── photo-review/         # U06 OCR 校对
│   ├── paper-config/         # U07
│   ├── paper-loading/        # U08
│   ├── paper-answer/         # U09
│   ├── paper-result/         # U11
│   ├── profile/              # U12 我的 Tab
│   ├── mistake/              # U13
│   └── settings/             # U14
├── components/                # 公共组件
├── services/                  # 接口层
├── stores/                    # MobX
├── utils/
├── config/
├── types/
└── assets/
```

---

## 重要事项

- **AppID**:M0 用「测试号」即可走通流程;真实上线前替换为你自己的 AppID(`project.config.json`)
- **业务域名 / 服务器域名**:在小程序后台「开发设置」中加白名单
- **包体积**:主包 ≤ 1.5MB,后续 V2 管理工作台走分包
