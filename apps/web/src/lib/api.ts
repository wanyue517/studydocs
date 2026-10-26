import type { KnowledgeItem, CreateItemInput, PatchItemInput, AiProfile, AiProfileInput, PdfOutlineState, PdfOutlineEntry, PdfTextPage, PdfOutlineDraft } from '@studydocs/shared';
import { hashChunk, yieldToBrowser } from './transfer-work';

export class ApiError extends Error { constructor(message: string, public status: number) { super(message); } }

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init, credentials:'same-origin', headers: { ...(init.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }), ...init.headers },
  });
  if (!response.ok) {
    let message = `请求失败（${response.status}）`;
    try { const info = await response.json(); message = Array.isArray(info.message) ? info.message.join('，') : info.message || message; } catch { /* ignore */ }
    if (response.status === 401 && path !== '/auth/me' && path !== '/auth/login') window.dispatchEvent(new Event('studydocs:unauthorized'));
    throw new ApiError(message, response.status);
  }
  return response.json() as Promise<T>;
}

export interface Account { id:string; username:string; role:'admin'|'user' }
export interface PublicSite {siteName:string;siteSubtitle:string;footerText:string;icpNumber:string;policeRecordNumber:string;loginNotice:string;allowRegistration:boolean;logoUrl:string|null}
export interface SiteSettings extends Omit<PublicSite,'logoUrl'> {maxUploadMb:number;logoStorageId:string|null;logoObjectKey:string|null}
export type EditableSiteSettings = Pick<SiteSettings,'siteName'|'siteSubtitle'|'footerText'|'icpNumber'|'policeRecordNumber'|'loginNotice'|'allowRegistration'|'maxUploadMb'>;
export type Provider = 'local'|'r2'|'minio'|'qiniu'|'aliyun';
export interface StorageProfile {id:string;name:string;provider:Provider;active:boolean;endpoint?:string;region?:string;bucket?:string;prefix?:string;accessKeyId?:string;forcePathStyle?:boolean;hasSecret:boolean;createdAt:string}
export interface StorageInput {name:string;provider:Provider;endpoint:string;region:string;bucket:string;prefix:string;accessKeyId:string;secretAccessKey:string;forcePathStyle:boolean}
export const api = {
  aiProfiles: () => request<AiProfile[]>('/ai/profiles'),
  saveAi: (data: AiProfileInput, id?: string) => request<AiProfile>(id ? `/ai/profiles/${id}` : '/ai/profiles', { method: id ? 'PATCH' : 'POST', body: JSON.stringify(data) }),
  activateAi: (id: string) => request<AiProfile[]>(`/ai/profiles/${id}/activate`, { method: 'POST' }),
  testAi: (id: string) => request<{ message: string }>(`/ai/profiles/${id}/test`, { method: 'POST' }),
  removeAi: (id: string) => request<{ success: boolean }>(`/ai/profiles/${id}`, { method: 'DELETE' }),
  aiAvailability: () => request<{ configured: boolean; name: string; model: string }>('/ai/availability'),
  pdfOutline: (id: string) => request<PdfOutlineState>(`/items/${id}/pdf-outline`),
  recognizeTocPage: (id: string, image: string, engine: 'local' | 'vision', language: string) => request<{ entries: PdfOutlineEntry[]; cached: boolean }>(`/items/${id}/pdf-outline/recognize-page`, { method: 'POST', body: JSON.stringify({ image, engine, language }) }),
  bodyHeadings: (id: string, page: number, text: string, image: string | undefined, language: string) => request<{ entries: PdfOutlineEntry[] }>(`/items/${id}/pdf-outline/body-page`, { method: 'POST', body: JSON.stringify({ page, text, image, language }) }),
  saveOutlineDraft: (id: string, entries: PdfOutlineEntry[], baseUpdatedAt: string | null, updatedAt: string | null) => request<PdfOutlineDraft>(`/items/${id}/pdf-outline/draft`, { method: 'PATCH', body: JSON.stringify({ entries, baseUpdatedAt, updatedAt }) }),
  resumePdfOutline: (id: string) => request<PdfOutlineState>(`/items/${id}/pdf-outline/resume`, { method: 'POST' }),
  generatePdfOutline: (id: string, pages: PdfTextPage[], pageCount: number) => request<PdfOutlineState>(`/items/${id}/pdf-outline/generate`, { method: 'POST', body: JSON.stringify({ pages, pageCount }) }),
  savePdfOutline: (id: string, entries: PdfOutlineEntry[], pageCount: number, updatedAt: string | null, draftUpdatedAt?: string | null) => request<PdfOutlineState>(`/items/${id}/pdf-outline`, { method: 'PATCH', body: JSON.stringify({ entries, pageCount, updatedAt, draftUpdatedAt }) }),
  sitePublic: () => request<PublicSite>('/site/public'),
  me: () => request<Account>('/auth/me'),
  login: (username:string,password:string) => request<Account>('/auth/login',{method:'POST',body:JSON.stringify({username,password})}),
  register: (username:string,password:string) => request<Account>('/auth/register',{method:'POST',body:JSON.stringify({username,password})}),
  logout: () => request<{success:boolean}>('/auth/logout',{method:'POST'}),
  changePassword: (oldPassword:string,newPassword:string) => request<{success:boolean}>('/auth/change-password',{method:'POST',body:JSON.stringify({oldPassword,newPassword})}),
  siteSettings: () => request<SiteSettings>('/site/settings'),
  saveSite: (data:EditableSiteSettings) => request<SiteSettings>('/site/settings',{method:'PATCH',body:JSON.stringify(data)}),
  storageList: () => request<StorageProfile[]>('/storage'),
  saveStorage: (data:StorageInput,id?:string) => request<StorageProfile>(id?`/storage/${id}`:'/storage',{method:id?'PATCH':'POST',body:JSON.stringify(data)}),
  activateStorage: (id:string) => request<StorageProfile[]>(`/storage/${id}/activate`,{method:'POST'}),
  testStorage: (id:string) => request<{success:boolean;message:string}>(`/storage/${id}/test`,{method:'POST'}),
  removeStorage: (id:string) => request<{success:boolean}>(`/storage/${id}`,{method:'DELETE'}),
  clearLogo: () => request<PublicSite>('/site/logo/clear',{method:'POST'}),
  uploadLogo: (file:File) => { const form = new FormData(); form.append('file',file,file.name); return request<PublicSite>('/site/logo',{method:'POST',body:form}); },
  list: () => request<KnowledgeItem[]>('/items'),
  trash: () => request<KnowledgeItem[]>('/items?trash=true'),
  create: (data: CreateItemInput) => request<KnowledgeItem>('/items', { method: 'POST', body: JSON.stringify(data) }),
  patch: (id: string, data: PatchItemInput) => request<KnowledgeItem>(`/items/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  delete: (id: string) => request<void>(`/items/${id}`, { method: 'DELETE' }),
  restore: (id: string) => request<KnowledgeItem>(`/items/${id}/restore`, { method: 'POST' }),
  forever: (id: string) => request<void>(`/items/${id}/forever`, { method: 'DELETE' }),
  async upload(file: File, parentId: string | null, onProgress?: (loaded: number, total: number) => void, onStage?: (stage:string) => void, owner = '') {
    const sessionKey = `studydocs-upload-${owner}-${file.name}-${file.size}-${file.lastModified}-${parentId ?? ''}`;
    const send = async <T>(path:string, init:RequestInit):Promise<T> => {
      const response = await fetch(`/api${path}`,{credentials:'same-origin',...init});
      if (!response.ok) {
        if (response.status === 401) window.dispatchEvent(new Event('studydocs:unauthorized'));
        let message = `上传失败（${response.status}）`;
        try { const info = await response.json(); message = Array.isArray(info.message) ? info.message.join('；') : info.message || message; } catch { /* ignore */ }
        throw new ApiError(message,response.status);
      }
      return response.json() as Promise<T>;
    };
    type Session = {id:string;received:number;size:number;chunkSize:number;status:string;mode:'local'|'cloud';storageChanged?:boolean;itemId?:string};
    const retry = async <T>(action:()=>Promise<T>, label:string):Promise<T> => {
      for (let attempt=0;;attempt++) {
        try { return await action(); }
        catch (error) {
          if (attempt >= 3 || error instanceof ApiError && error.status < 500 && error.status !== 408 && error.status !== 429) throw error;
          onStage?.(`${label}失败，正在重试（${attempt+1}/3）`);
          await new Promise((resolve) => setTimeout(resolve,Math.min(1000*2**attempt,4000)));
        }
      }
    };
    let session:Session|undefined;
    let saved = localStorage.getItem(sessionKey);
    if (saved) {
      try { session = await retry(()=>send<Session>(`/items/upload/sessions/${saved}`,{method:'GET'}),'查询续传任务'); }
      catch (error) { if (!(error instanceof ApiError && error.status === 404)) throw error; }
    }
    if (session && session.size !== file.size) { localStorage.removeItem(sessionKey); session = undefined; }
    if (session?.storageChanged && session.received === 0 && session.status === 'uploading') {
      localStorage.removeItem(sessionKey);
      saved = null;
      session = undefined;
    }
    if (!session) {
      const id = saved ?? crypto.randomUUID();
      localStorage.setItem(sessionKey,id);
      session = await retry(()=>send<Session>('/items/upload/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,name:file.name,size:file.size,parentId})}),'创建续传任务');
      localStorage.setItem(sessionKey,session.id);
    }
    let current = session as Session;
    if (current.mode !== 'cloud' && current.mode !== 'local') throw new Error('上传客户端版本已过期，请刷新页面后重试');
    onProgress?.(current.received,file.size);
    while (current.received < file.size) {
      await yieldToBrowser();
      const offset:number = current.received;
      const chunk = file.slice(offset,offset+current.chunkSize);
      if (current.mode === 'cloud') {
        const number = Math.floor(offset/current.chunkSize)+1;
        current = await retry(async()=>{
          const signed = await send<{url:string}>(`/items/upload/sessions/${current.id}/parts/${number}/sign`,{method:'POST'});
          const uploaded = await fetch(signed.url,{method:'PUT',body:chunk});
          if (!uploaded.ok) throw new Error(`云端分片上传失败（${uploaded.status}）`);
          const verified = await send<Session>(`/items/upload/sessions/${current.id}`,{method:'GET'});
          if (verified.received < offset+chunk.size) throw new Error('云端尚未确认分片');
          return verified;
        },'云端分片上传');
      } else {
        const hash = await hashChunk(chunk);
        current = await retry(()=>send<Session>(`/items/upload/sessions/${current.id}/chunk?offset=${offset}`,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Chunk-SHA256':hash},body:chunk}),'分片上传');
      }
      onProgress?.(current.received,file.size);
    }
    onStage?.(current.mode === 'cloud' ? '传输完成，云端正在合并并登记文档…' : '传输完成，服务端正在保存文件…');
    const item = await retry(()=>send<KnowledgeItem>(`/items/upload/sessions/${current.id}/finish`,{method:'POST'}),'保存文件');
    localStorage.removeItem(sessionKey);
    return item;
  },
  downloadTicket: (id:string) => request<{url:string|null;size:number}>(`/items/${id}/download-ticket`),
  async downloadRange(id:string,start:number,end:number,ticket?:{url:string|null;size:number}):Promise<{data:Blob;total:number}> {
    const response = await fetch(ticket?.url ?? `/api/items/${id}/file?download=1`,{credentials:ticket?.url?'omit':'same-origin',headers:{Range:`bytes=${start}-${end}`}});
    if (response.status === 401) window.dispatchEvent(new Event('studydocs:unauthorized'));
    if (!response.ok) throw new ApiError(`下载失败（${response.status}）`,response.status);
    if (response.status !== 206) throw new Error('服务器未返回分段数据');
    if (ticket?.url) {
      const data = await response.blob();
      if (data.size !== Math.min(end-start+1,ticket.size-start)) throw new Error('云端下载数据不完整');
      return {data,total:ticket.size};
    }
    const match = /^bytes (\d+)-(\d+)\/(\d+)$/.exec(response.headers.get('Content-Range') ?? '');
    if (!match || Number(match[1]) !== start) throw new Error('下载范围校验失败');
    const data = await response.blob();
    if (data.size !== Number(match[2])-start+1) throw new Error('下载数据不完整');
    return {data,total:Number(match[3])};
  },
  fileUrl: (id: string, download = false) => `/api/items/${id}/file${download ? '?download=1' : ''}`,
};
