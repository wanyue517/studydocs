import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api, type PublicSite, type Account } from '../lib/api';

const defaults:PublicSite = {siteName:'', siteSubtitle:'',footerText:'',icpNumber:'',policeRecordNumber:'',loginNotice:'',allowRegistration:false,logoUrl:null};
export const useAccountStore = defineStore('account',()=>{
  const site = ref<PublicSite>({...defaults});
  const user = ref<Account|null>(null);
  const ready = ref(false);
  const siteLoaded = ref(false);
  const message = ref('');
  async function bootstrap() {
    ready.value = false; message.value = '';
    try { site.value = await api.sitePublic(); siteLoaded.value = true; } catch { siteLoaded.value = false; message.value='网站配置加载失败，请重试'; }
    try { user.value = await api.me(); } catch { user.value=null; }
    ready.value = true;
    syncTitle();
  }
  function syncTitle() {
    document.title = siteLoaded.value ? site.value.siteName : '网站配置加载失败';
    let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (site.value.logoUrl) {
      if (!favicon) { favicon = document.createElement('link');favicon.rel='icon';document.head.appendChild(favicon); }
      favicon.href = site.value.logoUrl;
    } else if (favicon) favicon.remove();
  }
  async function login(username:string,password:string) { user.value = await api.login(username,password); message.value=''; }
  async function register(username:string,password:string) { await api.register(username,password); await login(username,password); }
  async function logout() { try { await api.logout(); } finally { user.value=null; } }
  async function refreshSite() { site.value=await api.sitePublic();siteLoaded.value=true;syncTitle(); }
  return { site,user,ready,siteLoaded,message,bootstrap,login,register,logout,refreshSite };
});
