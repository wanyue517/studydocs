<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { Check, Database, ExternalLink, HardDrive, ImagePlus, Plus, ShieldCheck, Settings2, Trash2 } from 'lucide-vue-next';
import { api, type SiteSettings, type StorageProfile, type StorageInput, type Provider } from '../lib/api';
import { useAccountStore } from '../stores/account';
const account = useAccountStore();
const tab = ref<'site'|'storage'|'account'>('site');
const oldPassword = ref('');
const newPassword = ref('');
const site = ref<SiteSettings | null>(null);
const profiles = ref<StorageProfile[]>([]);
const editingId = ref<string|null>(null);
const saving = ref(false);
const formOpen = ref(false);
const logoVersion = ref(Date.now());
const error = ref('');
const message = ref('');
const labels:Record<Provider,string> = {local:'本地文件系统',r2:'Cloudflare R2',minio:'MinIO',qiniu:'七牛云 Kodo',aliyun:'阿里云 OSS'};
const empty:StorageInput = {name:'',provider:'r2',endpoint:'',region:'auto',bucket:'',prefix:'studydocs',accessKeyId:'',secretAccessKey:'',forcePathStyle:false};
const profile = ref<StorageInput>({...empty});
const active = computed(() => profiles.value.find((x)=>x.active));
function describe(e:unknown) { error.value = e instanceof Error?e.message:'操作失败';message.value=''; }
async function refresh() {
  try { [site.value,profiles.value] = await Promise.all([api.siteSettings(),api.storageList()]); }
  catch(e) { describe(e); }
}
onMounted(()=>{if(account.user?.role==='admin')void refresh();else tab.value='account';});
async function savePassword() {
  saving.value=true;error.value='';
  try {await api.changePassword(oldPassword.value,newPassword.value);oldPassword.value='';newPassword.value='';message.value='密码已更新，其他设备的会话已注销';}
  catch(e){describe(e);}finally{saving.value=false;}
}
async function saveSite() {
  if (!site.value) return;
  saving.value=true;error.value='';
  try { site.value=await api.saveSite(site.value);await account.refreshSite();message.value='网站配置已保存'; }
  catch(e) {describe(e);} finally {saving.value=false;}
}
async function uploadLogo(event:Event) {
  const input=event.target as HTMLInputElement;
  const file=input.files?.[0]; if(!file)return;
  try { await api.uploadLogo(file);await account.refreshSite();message.value='Logo 已更新';logoVersion.value=Date.now(); }
  catch(e) {describe(e);} finally {input.value='';}
}
async function clearLogo() {
  try {await api.clearLogo();await account.refreshSite();message.value='已移除 Logo';}catch(e){describe(e);}
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
  try { profiles.value=await api.activateStorage(id);message.value='已切换默认存储；之前上传的文件不会迁移'; }
  catch(e){describe(e);}
}
async function test(id:string) {
  try{const r=await api.testStorage(id);message.value=r.message;}catch(e){describe(e);}
}
async function remove(id:string) {
  if(!window.confirm('删除未使用的存储档案？已有关联文件的档案无法删除。'))return;
  try{await api.removeStorage(id);await refresh();message.value='存储配置已删除';}catch(e){describe(e);}
}
</script>
<template>
  <div class="settings-page">
    <div class="settings-header"><h1>系统设置</h1></div>
    <template v-if="account.user">
      <div class="settings-tabs"><button v-if="account.user.role==='admin'" :class="{active:tab==='site'}" @click="tab='site'"><Settings2 :size="16" />网站设置</button><button v-if="account.user.role==='admin'" :class="{active:tab==='storage'}" @click="tab='storage'"><Database :size="16" />文件存储</button><button :class="{active:tab==='account'}" @click="tab='account'"><ShieldCheck :size="16" />账号安全</button></div>
      <p v-if="error" class="settings-error">{{ error }}</p><p v-if="message" class="settings-success"><Check :size="16" />{{ message }}</p>
      <template v-if="tab==='account'">
        <form class="settings-card" @submit.prevent="savePassword">
          <div class="settings-card-title"><h2>修改登录密码</h2><p>当前账号：{{ account.user.username }}。修改后其他浏览器将需要重新登录。</p></div>
          <label>当前密码<input v-model="oldPassword" type="password" required autocomplete="current-password" /></label>
          <label>新密码<input v-model="newPassword" type="password" required minlength="10" maxlength="128" autocomplete="new-password" placeholder="至少 10 位字符" /></label>
          <div class="settings-actions"><button class="settings-primary" type="submit" :disabled="saving">更新密码</button></div>
        </form>
      </template>
      <template v-if="tab==='site' && site && account.user.role==='admin'">
        <form class="settings-card" @submit.prevent="saveSite">
          <div class="settings-card-title"><h2>品牌与展示</h2><p>这些信息将展示在登录页、浏览器标签及站点页脚。</p></div>
          <div class="settings-logo"><span class="settings-logo-preview"><img v-if="account.site.logoUrl" :src="`${account.site.logoUrl}?t=${logoVersion}`" alt="站点 Logo" /><ImagePlus v-else :size="27" /></span><div><label class="settings-upload">上传 Logo<input type="file" accept="image/png,image/jpeg,image/webp" hidden @change="uploadLogo" /></label><button v-if="account.site.logoUrl" type="button" class="text-button" @click="clearLogo">移除 Logo</button><small>支持 PNG、JPG、WebP，最大 2 MB</small></div></div>
          <div class="form-two"><label>站点名称<input v-model="site.siteName" required maxlength="140" /></label><label>站点副标题<input v-model="site.siteSubtitle" maxlength="140" /></label></div>
          <label>页脚文案<input v-model="site.footerText" maxlength="140" /></label>
          <div class="form-two"><label>ICP备案号<input v-model="site.icpNumber" placeholder="选填" maxlength="140" /></label><label>公安备案号<input v-model="site.policeRecordNumber" placeholder="选填" maxlength="140" /></label></div>
          <label>登录页公告<textarea v-model="site.loginNotice" rows="3" maxlength="500" placeholder="可选，显示在登录页面" /></label>
          <div class="settings-divider"></div>
          <div class="settings-card-title"><h2>用户与安全</h2><p>注册开关即时生效；关闭后仅现有账号可登录。</p></div>
          <label class="settings-toggle"><span><strong>允许用户自行注册</strong><small>关闭后注册接口也将拒绝请求</small></span><input v-model="site.allowRegistration" type="checkbox" /></label>
          <label>单文件上传大小上限 (MB)<input v-model.number="site.maxUploadMb" type="number" min="1" max="25" style="max-width:160px" /></label>
          <div class="settings-actions"><button class="settings-primary" type="submit" :disabled="saving">{{ saving?'保存中...':'保存网站设置' }}</button></div>
        </form>
      </template>
      <template v-if="tab==='storage' && account.user.role==='admin'">
        <div class="settings-card"><div class="settings-card-title"><h2>默认存储</h2><p>仅影响之后上传的文件；旧文件继续从原存储读取，不迁移。</p></div>
          <div class="current-storage"><HardDrive :size="23" /><div><strong>{{ active?.name??'尚未配置' }}</strong><small>{{ active?labels[active.provider]:'请选择一个有效存储档案' }}</small></div><span class="active-label">正在使用</span></div>
          <div class="storage-section-heading"><strong>已配置的存储空间</strong><button class="settings-add" @click="begin()"><Plus :size="15" />添加存储</button></div>
          <div v-for="p in profiles" :key="p.id" class="storage-row"><span class="storage-row-icon"><Database :size="18" /></span><div class="storage-details"><strong>{{ p.name }}</strong><small>{{ labels[p.provider] }} · {{ p.bucket||'本地目录' }} <span v-if="p.active">· 默认</span></small></div><div class="storage-actions"><button @click="begin(p)">编辑</button><button @click="test(p.id)">测试</button><button v-if="!p.active" @click="activate(p.id)">设为默认</button><button v-if="!p.active" title="删除配置" @click="remove(p.id)"><Trash2 :size="15" /></button></div></div>
          <p class="settings-hint"><ShieldCheck :size="15" />密钥在服务器加密存储，不能从设置页面读取。请永久保管服务端的 STORAGE_ENCRYPTION_KEY。</p>
        </div>
        <form v-if="formOpen" class="settings-card" @submit.prevent="saveProfile">
          <div class="settings-card-title"><h2>{{ editingId?'编辑存储配置':'新增存储配置' }}</h2><p>使用私有 Bucket。云存储上传、读取与删除均由 NestJS 服务端执行。</p></div>
          <label>配置名称<input v-model="profile.name" required placeholder="例如：R2 主存储" /></label>
          <label>存储厂商<select v-model="profile.provider"><option v-for="(name,key) in labels" :key="key" :value="key">{{ name }}</option></select></label>
          <template v-if="profile.provider!=='local'"><div class="form-two"><label>Endpoint<input v-model="profile.endpoint" type="url" required placeholder="https://..." /></label><label>Region<input v-model="profile.region" required placeholder="auto / cn-east-1" /></label></div><div class="form-two"><label>Bucket<input v-model="profile.bucket" required /></label><label>对象目录前缀<input v-model="profile.prefix" placeholder="studydocs" /></label></div><label>Access Key ID<input v-model="profile.accessKeyId" required autocomplete="off" /></label><label>Secret Access Key<input v-model="profile.secretAccessKey" type="password" autocomplete="new-password" :required="!editingId" :placeholder="editingId?'留空表示不修改':'请输入 Secret Key'" /></label><label class="settings-toggle"><span><strong>Path-style 地址</strong><small>MinIO 通常启用，R2/七牛根据 Endpoint 配置</small></span><input v-model="profile.forcePathStyle" type="checkbox" /></label></template>
          <p v-else class="settings-hint">本地上传目录位于服务端 STORAGE_DIR/uploads，不需要额外访问密钥。</p>
          <div class="settings-actions"><button type="button" class="settings-secondary" @click="cancelForm">取消</button><button type="submit" class="settings-primary" :disabled="saving">{{ saving?'保存中...':'保存存储档案' }}</button></div>
        </form>
        <div class="settings-info"><ExternalLink :size="16" />已被文档引用的存储配置不可删除；修改 Bucket 或路径可能导致旧文件失联。</div>
      </template>
    </template>
  </div>
</template>
