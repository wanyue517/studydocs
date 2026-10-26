<script setup lang="ts">
import { onMounted, ref } from 'vue';
import type { AiProfile, AiProfileInput, AiProvider } from '@studydocs/shared';
import { api } from '../lib/api';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import Password from 'primevue/password';
import Message from 'primevue/message';
import { useConfirm } from 'primevue/useconfirm';
const confirm = useConfirm();
const profiles = ref<AiProfile[]>([]);
const loading = ref(true);
const busy = ref(false);
const open = ref(false);
const editing = ref<string>();
const error = ref('');
const success = ref('');
const errors = ref<Record<string, string>>({});
const providers = [ { label: 'DeepSeek', value: 'deepseek' }, { label: 'OpenAI', value: 'openai' }, { label: '豆包 / 火山方舟', value: 'doubao' }, { label: 'Qwen / 阿里云百炼', value: 'qwen' }, { label: 'OpenAI 兼容接口', value: 'compatible' } ];
const presets: Record<AiProvider, { baseUrl: string; model: string }> = {
  deepseek: { baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash' },
  openai: { baseUrl: 'https://api.openai.com/v1', model: '' },
  doubao: { baseUrl: 'https://ark.cn-beijing.volces.com/api/v3', model: '' },
  qwen: { baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1', model: 'qwen-plus' },
  compatible: { baseUrl: '', model: '' },
};
const form = ref<AiProfileInput>({ name: '', provider: 'deepseek', ...presets.deepseek, apiKey: '' });
async function refresh() { profiles.value = await api.aiProfiles(); }
onMounted(async () => { try { await refresh(); } catch (e) { error.value = (e as Error).message; } finally { loading.value = false; } });
function begin(profile?: AiProfile) {
  editing.value = profile?.id;
  form.value = profile ? { name: profile.name, provider: profile.provider, baseUrl: profile.baseUrl, model: profile.model, apiKey: '' } : { name: 'DeepSeek', provider: 'deepseek', ...presets.deepseek, apiKey: '' };
  errors.value = {}; error.value = ''; success.value = ''; open.value = true;
}
function changeProvider() {
  Object.assign(form.value, presets[form.value.provider], { name: providers.find(p => p.value === form.value.provider)?.label ?? '', apiKey: '' });
  errors.value = {};
}
function validate() {
  const next: Record<string,string> = {};
  const value = form.value;
  if (!value.name.trim() || value.name.length > 120) next.name = '请输入 1～120 字的配置名称';
  try {
    const url = new URL(value.baseUrl);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || /[{}]/.test(value.baseUrl)) throw new Error();
    if (url.protocol !== 'https:' && value.provider !== 'compatible') throw new Error();
  } catch { next.baseUrl = '请输入完整的 HTTPS Base URL；自定义兼容接口也支持 HTTP'; }
  if (!value.model.trim() || value.model.length > 120) next.model = '请输入服务商提供的模型 ID（最多 120 字符）';
  const previous = profiles.value.find(p => p.id === editing.value);
  if (!value.apiKey?.trim() && (!previous || previous.provider !== value.provider)) next.apiKey = '请输入此服务商的 API Key';
  errors.value = next;
  return !Object.keys(next).length;
}
async function action(fn: () => Promise<unknown>, message: string) {
  busy.value = true; error.value = ''; success.value = '';
  try { await fn(); await refresh(); success.value = message; }
  catch (e) { error.value = (e as Error).message; }
  finally { busy.value = false; }
}
async function save() {
  if (!validate()) return;
  await action(async () => { await api.saveAi(form.value, editing.value); form.value.apiKey = ''; open.value = false; }, 'AI 配置已保存，可测试连接并设为默认');
}
function remove(profile: AiProfile) {
  confirm.require({ header: '删除 AI 配置', message: `确定删除“${profile.name}”吗？`, rejectProps: { label: '取消', severity: 'secondary' }, acceptProps: { label: '删除', severity: 'danger' }, accept: () => { void action(() => api.removeAi(profile.id), 'AI 配置已删除'); } });
}
</script>
<template>
  <section class="settings-card">
    <div class="settings-card-title"><h2>AI 模型服务</h2><p>用于用户主动生成 PDF 目录。支持 Chat Completions 协议，可为不同服务商分别保存配置。</p></div>
    <Message v-if="error && !open" severity="error">{{ error }}</Message>
    <Message v-if="success" severity="success">{{ success }}</Message>
    <div v-if="loading" class="preview-loading" role="status">正在读取 AI 配置…</div>
    <div class="storage-section-heading"><strong>模型配置</strong><Button label="添加 AI 配置" size="small" outlined :disabled="busy" @click="begin()" /></div>
    <p v-if="!profiles.length && !loading" class="settings-hint">尚未配置 AI。添加配置并设为默认后，即可在 PDF 右侧生成目录。</p>
    <div v-for="profile in profiles" :key="profile.id" class="storage-row">
      <div class="storage-details"><strong>{{ profile.name }} <span v-if="profile.active" class="active-label">默认</span></strong><small>{{ profile.model }}</small></div>
      <div class="storage-actions">
        <Button text size="small" label="编辑" :disabled="busy" @click="begin(profile)" />
        <Button text size="small" label="测试连接" :disabled="busy" @click="action(() => api.testAi(profile.id), 'AI 连接测试成功')" />
        <Button v-if="!profile.active" text size="small" label="设为默认" :disabled="busy" @click="action(() => api.activateAi(profile.id), '默认 AI 已更新')" />
        <Button v-if="!profile.active" text severity="danger" size="small" label="删除" :disabled="busy" @click="remove(profile)" />
      </div>
    </div>
    <p v-if="busy" role="status" class="settings-hint">正在处理，请稍候…</p>
    <p class="settings-hint">API Key 在后端加密保存，不会返回浏览器。连接测试会发送一次简短模型请求。</p>
    <Dialog v-model:visible="open" modal :draggable="false" :closable="!busy" :close-on-escape="!busy" :header="editing ? '编辑 AI 配置' : '添加 AI 配置'" class="study-dialog" :style="{ width: 'min(620px, calc(100vw - 32px))' }" @hide="form.apiKey = ''">
      <form class="ai-config-form" @submit.prevent="save">
        <Message v-if="error" severity="error">{{ error }}</Message>
        <label>服务商<Select v-model="form.provider" :options="providers" option-label="label" option-value="value" @change="changeProvider" /></label>
        <label>配置名称<InputText v-model="form.name" :invalid="!!errors.name" /><small v-if="errors.name" class="field-error">{{ errors.name }}</small></label>
        <label>接口地址（Base URL）<InputText v-model="form.baseUrl" :invalid="!!errors.baseUrl" placeholder="https://api.example.com/v1" /><small v-if="errors.baseUrl" class="field-error">{{ errors.baseUrl }}</small><small>填写 Base URL 或完整 /chat/completions 地址。Qwen 可按地域替换为业务空间专属域名。</small></label>
        <label>模型 ID<InputText v-model="form.model" :invalid="!!errors.model" :placeholder="form.provider === 'doubao' ? '填入已开通的模型 ID 或 ep-… 推理接入点' : '填写服务商控制台中可用的模型 ID'" /><small v-if="errors.model" class="field-error">{{ errors.model }}</small></label>
        <label>API Key<Password v-model="form.apiKey" :invalid="!!errors.apiKey" :feedback="false" toggle-mask fluid autocomplete="new-password" :placeholder="editing ? '留空保留已保存的密钥' : '请输入 API Key'" /><small v-if="errors.apiKey" class="field-error">{{ errors.apiKey }}</small></label>
        <div class="study-dialog-actions"><Button type="button" label="取消" severity="secondary" outlined :disabled="busy" @click="open = false" /><Button type="submit" label="保存配置" :loading="busy" :disabled="busy" /></div>
      </form>
    </Dialog>
  </section>
</template>
