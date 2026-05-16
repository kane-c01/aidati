<template>
  <div class="login-page">
    <div class="login-card">
      <div class="brand">
        <div class="brand-mark">
          AI
        </div>
        <h1 class="brand-title">
          考题魔盒 · 管理后台
        </h1>
        <p class="brand-subtitle">
          仅供管理员使用
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
          label="账号"
          prop="username"
        >
          <el-input
            v-model="form.username"
            placeholder="请输入管理员账号"
            size="large"
            :prefix-icon="User"
            autocomplete="username"
          />
        </el-form-item>
        <el-form-item
          label="密码"
          prop="password"
        >
          <el-input
            v-model="form.password"
            type="password"
            placeholder="请输入密码"
            size="large"
            :prefix-icon="Lock"
            show-password
            autocomplete="current-password"
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
        忘记账号或需要重置密码,请联系超级管理员。
      </p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { Lock, User } from '@element-plus/icons-vue';
import { ElMessage, type FormInstance, type FormRules } from 'element-plus';
import { reactive, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';

import { ApiError } from '@/api/http';
import { useAuthStore } from '@/stores/auth';

const auth = useAuthStore();
const router = useRouter();
const route = useRoute();

const formRef = ref<FormInstance>();
const submitting = ref(false);
const form = reactive({
  username: '',
  password: '',
});

const rules: FormRules = {
  username: [
    { required: true, message: '请输入账号', trigger: 'blur' },
    { min: 2, max: 64, message: '账号长度 2~64', trigger: 'blur' },
  ],
  password: [
    { required: true, message: '请输入密码', trigger: 'blur' },
    { min: 6, max: 128, message: '密码长度 6~128', trigger: 'blur' },
  ],
};

async function onSubmit(): Promise<void> {
  if (!formRef.value) return;
  const ok = await formRef.value.validate().catch(() => false);
  if (!ok) return;
  submitting.value = true;
  try {
    await auth.adminLogin(form.username.trim(), form.password);
    ElMessage.success(`欢迎,${auth.displayName}`);
    const target = (route.query.redirect as string | undefined) || '/dashboard';
    void router.replace(target);
  } catch (err) {
    if (err instanceof ApiError) {
      // ApiError 已经被 http 层 ElMessage 弹过了
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
