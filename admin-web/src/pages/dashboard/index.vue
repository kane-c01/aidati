<template>
  <div class="dashboard-placeholder">
    <div class="card">
      <h1 class="title">AI 出题学习 · 管理后台</h1>
      <p class="subtitle">M0 项目脚手架已就绪</p>
      <ul class="checklist">
        <li>✓ Vue 3 + Vite + Element Plus + Pinia</li>
        <li>✓ TypeScript 严格模式</li>
        <li>✓ 自动 import / Element Plus 按需加载</li>
        <li>✓ Vite 代理 /v1 → http://localhost:3000</li>
      </ul>
      <p class="footnote">完整工作台(数据卡片 / 待办 / 快捷入口)将在 M7 里程碑实现。</p>
    </div>
  </div>
</template>

<script setup lang="ts">
// M7 起接入工作台数据;此页 M0 仅作占位用
</script>

<style scoped lang="scss">
.dashboard-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 100vh;
  background-color: #fafaf7;
  padding: 32px;
}

.card {
  max-width: 480px;
  width: 100%;
  background: #ffffff;
  border-radius: 16px;
  padding: 48px 40px;
  box-shadow: 0 2px 12px rgba(0, 0, 0, 0.04);
  text-align: center;
}

.title {
  font-size: 22px;
  font-weight: 700;
  color: #1a1a1a;
  margin: 0 0 8px;
}

.subtitle {
  font-size: 14px;
  color: #4a4a4a;
  margin: 0 0 24px;
}

.checklist {
  list-style: none;
  padding: 0;
  margin: 0 0 24px;
  text-align: left;
  color: #4a4a4a;
  line-height: 1.8;
  font-size: 13px;
}

.footnote {
  font-size: 12px;
  color: #8c8c8c;
  margin: 0;
}
</style>
