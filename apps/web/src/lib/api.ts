import type { KnowledgeItem, CreateItemInput, PatchItemInput } from '@studydocs/shared';

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
export type Provider = 'local'|'r2'|'minio'|'qiniu'|'aliyun';
export interface StorageProfile {id:string;name:string;provider:Provider;active:boolean;endpoint?:string;region?:string;bucket?:string;prefix?:string;accessKeyId?:string;forcePathStyle?:boolean;hasSecret:boolean;createdAt:string}
export interface StorageInput {name:string;provider:Provider;endpoint:string;region:string;bucket:string;prefix:string;accessKeyId:string;secretAccessKey:string;forcePathStyle:boolean}
export const api = {
  sitePublic: () => request<PublicSite>('/site/public'),
  me: () => request<Account>('/auth/me'),
  login: (username:string,password:string) => request<Account>('/auth/login',{method:'POST',body:JSON.stringify({username,password})}),
  register: (username:string,password:string) => request<Account>('/auth/register',{method:'POST',body:JSON.stringify({username,password})}),
  logout: () => request<{success:boolean}>('/auth/logout',{method:'POST'}),
  changePassword: (oldPassword:string,newPassword:string) => request<{success:boolean}>('/auth/change-password',{method:'POST',body:JSON.stringify({oldPassword,newPassword})}),
  siteSettings: () => request<SiteSettings>('/site/settings'),
  saveSite: (data:Partial<SiteSettings>) => request<SiteSettings>('/site/settings',{method:'PATCH',body:JSON.stringify(data)}),
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
  async upload(file: File, parentId: string | null, onProgress?: (loaded: number, total: number) => void) {
    const form = new FormData();
    form.append('file', file, file.name);
    // 独立 UTF-8 表单字段，避免 multipart 文件头里的 filename 被 Busboy 按 Latin-1 解读。
    form.append('fileName', file.name);
    if (parentId) form.append('parentId', parentId);
    return new Promise<KnowledgeItem>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', '/api/items/upload/file');
      xhr.withCredentials = true;
      xhr.upload.onprogress = (event) => onProgress?.(event.loaded, event.lengthComputable ? event.total : file.size);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try { resolve(JSON.parse(xhr.responseText) as KnowledgeItem); }
          catch { reject(new Error('上传响应无法解析')); }
        } else {
          if (xhr.status === 401) window.dispatchEvent(new Event('studydocs:unauthorized'));
          let message = `上传失败（${xhr.status}）`;
          try { const info = JSON.parse(xhr.responseText); message = Array.isArray(info.message) ? info.message.join('，') : info.message || message; } catch { /* ignore */ }
          reject(new ApiError(message, xhr.status));
        }
      };
      xhr.onerror = () => reject(new Error('网络连接中断，上传失败'));
      xhr.send(form);
    });
  },
  download(id: string, onProgress?: (loaded: number, total: number) => void) {
    return new Promise<Blob>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', `/api/items/${id}/file?download=1`);
      xhr.responseType = 'blob';
      xhr.withCredentials = true;
      xhr.onprogress = (event) => onProgress?.(event.loaded, event.lengthComputable ? event.total : 0);
      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.response as Blob);
        else {
          if (xhr.status === 401) window.dispatchEvent(new Event('studydocs:unauthorized'));
          reject(new ApiError(`下载失败（${xhr.status}）`, xhr.status));
        }
      };
      xhr.onerror = () => reject(new Error('网络连接中断，下载失败'));
      xhr.send();
    });
  },
  fileUrl: (id: string, download = false) => `/api/items/${id}/file${download ? '?download=1' : ''}`,
};
