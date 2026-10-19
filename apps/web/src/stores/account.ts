import { defineStore } from 'pinia';
import { ref } from 'vue';
import { api, type PublicSite, type Account } from '../lib/api';

const defaults:PublicSite = {siteName:'拾页', siteSubtitle:'把知识整理成自己的体系',footerText:'拾页 StudyDocs',icpNumber:'',policeRecordNumber:'',loginNotice:'',allowRegistration:false,logoUrl:null};
export const useAccountStore = defineStore('account',()=>{
  const site = ref<PublicSite>({...defaults});
  const user = ref<Account|null>(null);
  const ready = ref(false);
  const message = ref('');
  async function bootstrap() {
    try { site.value = await api.sitePublic(); } catch { message.value='站点配置加载失败，请确认 API 已启动'; }
    try { user.value = await api.me(); } catch { user.value=null; }
    ready.value = true;
    syncTitle();
  }
  function syncTitle() {
    document.title = `${site.value.siteName} · 学习文档管理`;
    let favicon = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
    if (site.value.logoUrl) {
      if (!favicon) { favicon = document.createElement('link');favicon.rel='icon';document.head.appendChild(favicon); }
      favicon.href = site.value.logoUrl;
    } else if (favicon) favicon.remove();
  }
  async function login(username:string,password:string) { user.value = await api.login(username,password); message.value=''; }
  async function register(username:string,password:string) { await api.register(username,password); await login(username,password); }
  async function logout() { try { await api.logout(); } finally { user.value=null; } }
  async function refreshSite() { site.value=await api.sitePublic();syncTitle(); }
  return { site,user,ready,message,bootstrap,login,register,logout,refreshSite };
});
