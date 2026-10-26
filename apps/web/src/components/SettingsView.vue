<script setup lang="ts">
import AiSettings from './AiSettings.vue';
import { computed, onMounted, ref, watch } from 'vue';
import { Database, ExternalLink, HardDrive, ImagePlus, LoaderCircle, ShieldCheck, Trash2 } from 'lucide-vue-next';
import { api, type SiteSettings, type EditableSiteSettings, type StorageProfile, type StorageInput, type Provider } from '../lib/api';
import { useAccountStore } from '../stores/account';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Select from 'primevue/select';
import ToggleSwitch from 'primevue/toggleswitch';
import Password from 'primevue/password';
import Textarea from 'primevue/textarea';
import InputNumber from 'primevue/inputnumber';
import SelectButton from 'primevue/selectbutton';
import Message from 'primevue/message';
import { useConfirm } from 'primevue/useconfirm';
import FileUpload from 'primevue/fileupload';
const account = useAccountStore();
const confirm = useConfirm();
const tabOptions = computed(() => [
  ...(account.user?.role === 'admin' ? [{ label: '网站设置', value: 'site' }, { label: '文件存储', value: 'storage' }, { label: 'AI 配置', value: 'ai' }] : []),
  { label: '账号安全', value: 'account' },
]);
const tab = ref<'site'|'storage'|'ai'|'account'>('site');
const oldPassword = ref('');
const newPassword = ref('');
const site = ref<SiteSettings | null>(null);
const profiles = ref<StorageProfile[]>([]);
const editingId = ref<string|null>(null);
const saving = ref(false);
const loading = ref(false);
const logoSaving = ref(false);
const busyStorageId = ref<string|null>(null);
const formOpen = ref(false);
const logoVersion = ref(Date.now());
const logoUploadRef = ref<InstanceType<typeof FileUpload> | null>(null);
const error = ref('');
const message = ref('');
type SiteField = keyof EditableSiteSettings;
const siteErrors = ref<Partial<Record<SiteField,string>>>({});
const siteRules: Partial<Record<SiteField,(value: never)=>string>> = {
  siteName: (value) => !String(value ?? '').trim() ? '请输入站点名称' : String(value).length > 140 ? '站点名称不能超过 140 个字符' : '',
  siteSubtitle: (value) => String(value ?? '').length > 140 ? '站点副标题不能超过 140 个字符' : '',
  footerText: (value) => String(value ?? '').length > 140 ? '页脚文案不能超过 140 个字符' : '',
  icpNumber: (value) => String(value ?? '').length > 140 ? 'ICP备案号不能超过 140 个字符' : '',
  policeRecordNumber: (value) => String(value ?? '').length > 140 ? '公安备案号不能超过 140 个字符' : '',
  loginNotice: (value) => String(value ?? '').length > 500 ? '登录页公告不能超过 500 个字符' : '',
  maxUploadMb: (value) => typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 2048 ? '请输入 1～2048 的整数（MB）' : '',
};
watch(site, () => { siteErrors.value = {}; }, { deep: true });
function validateSite(): boolean {
  if (!site.value) return false;
  const errors: Partial<Record<SiteField,string>> = {};
  for (const [field, rule] of Object.entries(siteRules) as [SiteField,(value: never)=>string][]) {
    const result = rule(site.value[field] as never);
    if (result) errors[field] = result;
  }
  siteErrors.value = errors;
  return !Object.keys(errors).length;
}
const labels:Record<Provider,string> = {local:'本地文件系统',r2:'Cloudflare R2',minio:'MinIO',qiniu:'七牛云 Kodo',aliyun:'阿里云 OSS'};
const providerOptions = (Object.entries(labels) as [Provider, string][]).map(([value, label]) => ({ value, label }));
const empty:StorageInput = {name:'',provider:'r2',endpoint:'',region:'auto',bucket:'',prefix:'studydocs',accessKeyId:'',secretAccessKey:'',forcePathStyle:false};
const profile = ref<StorageInput>({...empty});
const active = computed(() => profiles.value.find((x)=>x.active));
function describe(e:unknown) { error.value = e instanceof Error?e.message:'操作失败';message.value=''; }
async function refresh() {
  loading.value = true;
  try { [site.value,profiles.value] = await Promise.all([api.siteSettings(),api.storageList()]); }
  catch(e) { describe(e); }
  finally { loading.value = false; }
}
onMounted(()=>{if(account.user?.role==='admin')void refresh();else tab.value='account';});
async function savePassword() {
  saving.value=true;error.value='';
  try {await api.changePassword(oldPassword.value,newPassword.value);oldPassword.value='';newPassword.value='';message.value='密码已更新，其他设备的会话已注销';}
  catch(e){describe(e);}finally{saving.value=false;}
}
async function saveSite() {
  if (!site.value || !validateSite()) return;
  saving.value=true;error.value='';
  const {siteName,siteSubtitle,footerText,icpNumber,policeRecordNumber,loginNotice,allowRegistration,maxUploadMb} = site.value;
  try { site.value=await api.saveSite({siteName,siteSubtitle,footerText,icpNumber,policeRecordNumber,loginNotice,allowRegistration,maxUploadMb});await account.refreshSite();message.value='网站配置已保存'; }
  catch(e) {describe(e);} finally {saving.value=false;}
}
async function uploadLogo(event: { files: File[] | File }) {
  const files = Array.isArray(event.files) ? event.files : [event.files];
  const file = files[0];
  if (!file) return;
  logoSaving.value = true;
  try { await api.uploadLogo(file); await account.refreshSite(); message.value='Logo 已更新'; logoVersion.value=Date.now(); }
  catch(e) { describe(e); }
  finally { logoSaving.value = false; (logoUploadRef.value as unknown as { clear: () => void } | null)?.clear(); }
}
async function clearLogo() {
  logoSaving.value = true;
  try {await api.clearLogo();await account.refreshSite();message.value='已移除 Logo';}catch(e){describe(e);}finally{logoSaving.value = false;}
}
function begin(p?:StorageProfile) {
  formOpen.value=true;
  editingId.value=p?.id??null;
  profile.value=p?{name:p.name,provider:p.provider,endpoint:p.endpoint??'',region:p.region??'',bucket:p.bucket??'',prefix:p.prefix??'studydocs',accessKeyId:p.accessKeyId??'',secretAccessKey:'',forcePathStyle:p.forcePathStyle??false}:{...empty};
  message.value='';error.value='';
}
function cancelForm() {formOpen.value=false;editingId.value=null;profile.value={...empty};}
async function saveProfile() {
  saving.value=true;error.value='';
  try { await api.saveStorage(profile.value,editingId.value??undefined);await refresh();profile.value={...empty};editingId.value=null;formOpen.value=false;message.value='存储配置已保存；旧文件仍沿用原存储档案'; }
  catch(e) {describe(e);}finally{saving.value=false;}
}
async function activate(id:string) {
  busyStorageId.value = id;
  try { profiles.value=await api.activateStorage(id);message.value='已切换默认存储；之前上传的文件不会迁移'; }
  catch(e){describe(e);}finally{busyStorageId.value = null;}
}
async function test(id:string) {
  busyStorageId.value = id;
  try{const r=await api.testStorage(id);message.value=r.message;}catch(e){describe(e);}finally{busyStorageId.value = null;}
}
async function remove(id:string) {
  confirm.require({
    header: '删除存储配置',
    message: '确定删除此存储配置吗？已被文件引用的配置无法删除。',
    rejectProps: { label: '取消', severity: 'secondary', outlined: true },
    acceptProps: { label: '删除', severity: 'danger' },
    accept: async () => {
      busyStorageId.value = id;
      try { await api.removeStorage(id); await refresh(); message.value = '存储配置已删除'; }
      catch(e) { describe(e); }finally{busyStorageId.value = null;}
    },
  });
}
</script>
<template>
  <div class="settings-page">
    <div class="settings-header"><h1>系统设置</h1></div>
    <template v-if="account.user">
      <SelectButton v-model="tab" :options="tabOptions" option-label="label" option-value="value"
        :allow-empty="false" class="settings-tabs study-segmented" />
      <Message v-if="error" severity="error" class="settings-feedback">{{ error }}</Message>
      <Message v-if="message" severity="success" class="settings-feedback">{{ message }}</Message>
      <div v-if="loading && tab !== 'account'" class="preview-loading" role="status"><LoaderCircle :size="20" class="spin" />正在读取设置…</div>
      <AiSettings v-if="tab==='ai' && account.user.role==='admin'" />
      <template v-if="tab==='account'">
        <form class="settings-card" @submit.prevent="savePassword">
          <div class="settings-card-title"><h2>修改登录密码</h2><p>当前账号：{{ account.user.username }}。修改后其他浏览器将需要重新登录。</p></div>
          <label>当前密码<Password v-model="oldPassword" :feedback="false" toggle-mask required autocomplete="current-password" fluid /></label>
          <label>新密码<Password v-model="newPassword" :feedback="false" toggle-mask required minlength="10" maxlength="128" autocomplete="new-password" placeholder="至少 10 位字符" fluid /></label>
          <div class="settings-actions"><Button type="submit" label="更新密码" :loading="saving" :disabled="saving" /></div>
        </form>
      </template>
      <template v-if="tab==='site' && site && account.user.role==='admin'">
        <form class="settings-card" @submit.prevent="saveSite">
          <div class="settings-card-title"><h2>品牌与展示</h2><p>这些信息将展示在登录页、浏览器标签及站点页脚。</p></div>
          <div class="settings-logo"><span class="settings-logo-preview"><img v-if="account.site.logoUrl" :src="`${account.site.logoUrl}?t=${logoVersion}`" alt="站点 Logo" /><ImagePlus v-else :size="27" /></span><div><FileUpload ref="logoUploadRef" mode="basic" choose-label="上传 Logo" accept="image/png,image/jpeg,image/webp" :max-file-size="2097152" auto custom-upload :disabled="logoSaving" @uploader="uploadLogo" /><Button v-if="account.site.logoUrl" type="button" link size="small" label="移除 Logo" :loading="logoSaving" :disabled="logoSaving" @click="clearLogo" /><small>{{ logoSaving ? '正在更新 Logo…' : '支持 PNG、JPG、WebP，最大 2 MB' }}</small></div></div>
          <div class="form-two"><label>站点名称<InputText v-model="site.siteName" :invalid="!!siteErrors.siteName" /><small v-if="siteErrors.siteName" class="field-error">{{ siteErrors.siteName }}</small></label><label>站点副标题<InputText v-model="site.siteSubtitle" :invalid="!!siteErrors.siteSubtitle" /><small v-if="siteErrors.siteSubtitle" class="field-error">{{ siteErrors.siteSubtitle }}</small></label></div>
          <label>页脚文案<InputText v-model="site.footerText" :invalid="!!siteErrors.footerText" /><small v-if="siteErrors.footerText" class="field-error">{{ siteErrors.footerText }}</small></label>
          <div class="form-two"><label>ICP备案号<InputText v-model="site.icpNumber" placeholder="选填" :invalid="!!siteErrors.icpNumber" /><small v-if="siteErrors.icpNumber" class="field-error">{{ siteErrors.icpNumber }}</small></label><label>公安备案号<InputText v-model="site.policeRecordNumber" placeholder="选填" :invalid="!!siteErrors.policeRecordNumber" /><small v-if="siteErrors.policeRecordNumber" class="field-error">{{ siteErrors.policeRecordNumber }}</small></label></div>
          <label>登录页公告<Textarea v-model="site.loginNotice" rows="3" placeholder="可选，显示在登录页面" :invalid="!!siteErrors.loginNotice" /><small v-if="siteErrors.loginNotice" class="field-error">{{ siteErrors.loginNotice }}</small></label>
          <div class="settings-divider"></div>
          <div class="settings-card-title"><h2>用户与安全</h2><p>注册开关即时生效；关闭后仅现有账号可登录。</p></div>
          <label class="settings-toggle"><span><strong>允许用户自行注册</strong><small>关闭后注册接口也将拒绝请求</small></span><ToggleSwitch v-model="site.allowRegistration" /></label>
          <label>单文件上传大小上限 (MB)<InputNumber v-model="site.maxUploadMb" :min="1" :max="2048" :use-grouping="false" class="settings-number" :invalid="!!siteErrors.maxUploadMb" /><small v-if="siteErrors.maxUploadMb" class="field-error">{{ siteErrors.maxUploadMb }}</small></label>
          <div class="settings-actions"><Button type="submit" label="保存网站设置" :loading="saving" :disabled="saving" /></div>
        </form>
      </template>
      <template v-if="tab==='storage' && account.user.role==='admin'">
        <div class="settings-card"><div class="settings-card-title"><h2>默认存储</h2><p>仅影响之后上传的文件；旧文件继续从原存储读取，不迁移。</p></div>
          <div class="current-storage"><HardDrive :size="23" /><div><strong>{{ active?.name??'尚未配置' }}</strong><small>{{ active?labels[active.provider]:'请选择一个有效存储档案' }}</small></div><span class="active-label">正在使用</span></div>
          <div class="storage-section-heading"><strong>已配置的存储空间</strong><Button class="settings-add" label="添加存储" size="small" outlined @click="begin()" /></div>
          <div v-for="p in profiles" :key="p.id" class="storage-row"><span class="storage-row-icon"><Database :size="18" /></span><div class="storage-details"><strong>{{ p.name }}</strong><small>{{ labels[p.provider] }} · {{ p.bucket||'本地目录' }} <span v-if="p.active">· 默认</span></small></div><div class="storage-actions"><Button text size="small" label="编辑" :disabled="!!busyStorageId" @click="begin(p)" /><Button text size="small" label="测试" :loading="busyStorageId === p.id" :disabled="!!busyStorageId" @click="test(p.id)" /><Button v-if="!p.active" text size="small" label="设为默认" :disabled="!!busyStorageId" @click="activate(p.id)" /><Button v-if="!p.active" text size="small" severity="danger" aria-label="删除配置" :disabled="!!busyStorageId" @click="remove(p.id)"><Trash2 :size="15" /></Button></div></div>
          <p class="settings-hint"><ShieldCheck :size="15" />密钥在服务器加密存储，不能从设置页面读取。请永久保管服务端的 STORAGE_ENCRYPTION_KEY。</p>
        </div>
        <Dialog v-model:visible="formOpen" modal :draggable="false" :closable="!saving"
          :header="editingId ? '编辑存储配置' : '新增存储配置'" class="study-dialog storage-dialog"
          :style="{ width: 'min(660px, calc(100vw - 32px))' }" @hide="cancelForm">
          <form class="study-dialog-form storage-dialog-form" @submit.prevent="saveProfile">
            <div class="study-field"><label for="storage-name">配置名称</label><InputText id="storage-name" v-model="profile.name" required maxlength="140" placeholder="例如：R2 主存储" class="study-dialog-input" /></div>
            <div class="study-field"><label for="storage-provider">存储厂商</label><Select input-id="storage-provider" v-model="profile.provider" :options="providerOptions" option-label="label" option-value="value" class="study-dialog-input" :disabled="!!editingId" /></div>
            <template v-if="profile.provider !== 'local'">
              <div class="study-field-grid">
                <div class="study-field"><label for="storage-endpoint">服务地址</label><InputText id="storage-endpoint" v-model="profile.endpoint" type="url" required placeholder="https://..." class="study-dialog-input" /></div>
                <div class="study-field"><label for="storage-region">Region</label><InputText id="storage-region" v-model="profile.region" required placeholder="auto" class="study-dialog-input" /></div>
              </div>
              <div class="study-field-grid">
                <div class="study-field"><label for="storage-bucket">Bucket</label><InputText id="storage-bucket" v-model="profile.bucket" required class="study-dialog-input" /></div>
                <div class="study-field"><label for="storage-prefix">对象目录前缀</label><InputText id="storage-prefix" v-model="profile.prefix" placeholder="studydocs" class="study-dialog-input" /></div>
              </div>
              <div class="study-field"><label for="storage-key">Access Key ID</label><InputText id="storage-key" v-model="profile.accessKeyId" required autocomplete="off" class="study-dialog-input" /></div>
              <div class="study-field"><label for="storage-secret">Secret Access Key</label><InputText id="storage-secret" v-model="profile.secretAccessKey" type="password" autocomplete="new-password" :required="!editingId" :placeholder="editingId ? '留空表示不修改' : '请输入 Secret Key'" class="study-dialog-input" /></div>
              <div class="study-switch-row"><div><strong>Path-style 地址</strong><small>MinIO 通常需要开启</small></div><ToggleSwitch input-id="storage-path-style" v-model="profile.forcePathStyle" /></div>
            </template>
            <div class="study-dialog-actions">
              <Button type="button" label="取消" severity="secondary" outlined :disabled="saving" @click="cancelForm" />
              <Button type="submit" :loading="saving" label="保存配置" :disabled="saving" />
            </div>
          </form>
        </Dialog>
        <div class="settings-info"><ExternalLink :size="16" />已被文档引用的存储配置不可删除；修改 Bucket 或路径可能导致旧文件失联。</div>
      </template>
    </template>
  </div>
</template>
