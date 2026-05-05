<template>
  <div class="login-page">
    <div class="login-card">
      <div class="brand">
        <div class="brand-mark">
          AI
        </div>
        <h1 class="brand-title">
          AI 出题学习 · 管理后台
        </h1>
        <p class="brand-subtitle">
          仅供 admin / super_admin 使用
        </p>
      </div>

      <el-form
        ref="formRef"
        :model="form"
        :rules="rules"
        label-position="top"
        @keyup.enter="onSubmit"
      >
        <el-form-item
          label="登录 Code"
          prop="code"
        >
          <el-input
            v-model="form.code"
            placeholder="生产请扫码;dev 模式直接填 mock-xxx"
            size="large"
            :prefix-icon="Lock"
          />
        </el-form-item>
        <el-form-item
          label="昵称(可选)"
          prop="nickname"
        >
          <el-input
            v-model="form.nickname"
            placeholder="第一次登录时建议填"
            size="large"
          />
        </el-form-item>

        <el-button
          type="primary"
          size="large"
          class="submit"
          :loading="submitting"
          @click="onSubmit"
        >
          登录
        </el-button>
      </el-form>

      <p class="hint">
        本地 dev:<code>mock-super-*</code> 直登超管,<code>mock-admin-*</code> 直登管理员;<br />
        真实环境需要扫描微信工作号 + 服务端校验。
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Lock } from '@element-plus/icons-vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { reactive, ref } from 'vue';
import { useRouter } from 'vue-router';

import { ApiError } from '@/api/http';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();

const formRef = ref<FormInstance>();
const submitting = ref(false);
const form = reactive({
  // dev 默认填超管 code, 后端识别 mock-super-* 前缀自动给 super_admin 角色
  code: 'mock-super-001',
  nickname: '',
});

const rules: FormRules = {
  code: [
    { required: true, message: '请输入登录 Code', trigger: 'blur' },
    { min: 4, max: 128, message: 'Code 长度 4~128', trigger: 'blur' },
  ],
};

async function onSubmit(): Promise<void> {
  if (!formRef.value) return;
  const ok = await formRef.value.validate().catch(() => false);
  if (!ok) return;
  submitting.value = true;
  try {
    await auth.login({
      code: form.code.trim(),
      user_info: form.nickname.trim() ? { nickname: form.nickname.trim() } : undefined,
      privacy_version: 'v1.0',
      agreed_at: new Date().toISOString(),
    });
    ElMessage.success(`欢迎,${auth.displayName}`);
    void router.replace('/dashboard');
  } catch (err) {
    if (err instanceof ApiError) {
      // ApiError 已经被 http 层统一弹过了, 这里不重复
    } else if (err instanceof Error) {
      ElMessage.error(err.message);
    }
  } finally {
    submitting.value = false;
  }
}
</script>

<style scoped lang="scss">
.login-page {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  background:
    radial-gradient(circle at 20% 20%, rgba(79, 124, 255, 0.18), transparent 40%),
    radial-gradient(circle at 80% 80%, rgba(78, 209, 207, 0.18), transparent 40%),
    #fafaf7;
  padding: 24px;
}

.login-card {
  background: #fff;
  width: 420px;
  max-width: 100%;
  padding: 36px 32px 28px;
  border-radius: 18px;
  box-shadow: 0 12px 36px rgba(20, 20, 20, 0.08);
}

.brand {
  text-align: center;
  margin-bottom: 24px;
}

.brand-mark {
  width: 48px;
  height: 48px;
  border-radius: 14px;
  background: linear-gradient(135deg, #4f7cff 0%, #4ed1cf 100%);
  color: #fff;
  font-weight: 700;
  font-size: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 12px;
}

.brand-title {
  font-size: 18px;
  font-weight: 600;
  margin: 0 0 4px;
}

.brand-subtitle {
  margin: 0;
  font-size: 12px;
  color: #8c8c8c;
}

.submit {
  width: 100%;
}

.hint {
  margin-top: 16px;
  text-align: center;
  font-size: 12px;
  color: #8c8c8c;

  code {
    background: #f4f5f7;
    padding: 2px 6px;
    border-radius: 4px;
    color: #4f7cff;
  }
}
</style>
