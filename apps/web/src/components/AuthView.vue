<script setup lang="ts">
import { ref } from 'vue';
import { BookOpenText, Eye, EyeOff, ArrowRight } from 'lucide-vue-next';
import { useAccountStore } from '../stores/account';
const account = useAccountStore();
const mode = ref<'login'|'register'>('login');
const username = ref('');
const password = ref('');
const showPassword = ref(false);
const pending = ref(false);
const error = ref('');
async function submit() {
  if (pending.value) return;
  pending.value = true; error.value='';
  try {
    if (mode.value === 'login') await account.login(username.value.trim(),password.value);
    else await account.register(username.value.trim(),password.value);
    password.value = '';
  } catch (e) { error.value = e instanceof Error ? e.message : '操作失败'; }
  finally { pending.value=false; }
}
</script>
<template>
  <div class="auth-screen">
    <div class="auth-shell">
      <div class="auth-brand">
        <img v-if="account.site.logoUrl" :src="account.site.logoUrl" alt="站点 Logo" />
        <span v-else class="auth-mark"><BookOpenText :size="27" /></span>
        <div><strong>{{ account.site.siteName }}</strong><span>{{ account.site.siteSubtitle }}</span></div>
      </div>
      <div class="auth-card">
        <div class="auth-heading"><h1>{{ mode==='login'?'欢迎回来':'创建新账号' }}</h1></div>
        <form @submit.prevent="submit" autocomplete="on">
          <label for="auth-user">用户名</label>
          <input id="auth-user" v-model="username" required minlength="3" maxlength="32" autocomplete="username" placeholder="输入用户名" />
          <label for="auth-pass">密码</label>
          <div class="auth-password"><input id="auth-pass" v-model="password" :type="showPassword?'text':'password'" minlength="10" maxlength="128" required :autocomplete="mode==='login'?'current-password':'new-password'" placeholder="至少 10 位字符" /><button type="button" :aria-label="showPassword?'隐藏密码':'显示密码'" @click="showPassword=!showPassword"><EyeOff v-if="showPassword" :size="18" /><Eye v-else :size="18" /></button></div>
          <div v-if="error || account.message" class="auth-error">{{ error || account.message }}</div>
          <button type="submit" class="auth-submit" :disabled="pending">{{ pending?'正在处理...':mode==='login'?'登录知识库':'创建账号' }}<ArrowRight :size="17" /></button>
        </form>
        <div v-if="account.site.allowRegistration" class="auth-switch">{{ mode==='login'?'还没有账号？':'已有账号？' }} <button @click="mode=mode==='login'?'register':'login';error=''">{{ mode==='login'?'立即注册':'返回登录' }}</button></div>
      </div>
      <div v-if="account.site.loginNotice" class="auth-notice">{{ account.site.loginNotice }}</div>
      <footer>{{ account.site.footerText }} <span v-if="account.site.icpNumber">· {{ account.site.icpNumber }}</span><span v-if="account.site.policeRecordNumber"> · {{ account.site.policeRecordNumber }}</span></footer>
    </div>
  </div>
</template>
