import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { KnowledgeItem } from '@studydocs/shared';
import { api } from '../lib/api';
import { cachedChunk, clearChunks, saveChunk } from '../lib/download-cache';
import { joinChunks, yieldToBrowser } from '../lib/transfer-work';

export interface TransferTask {
  id: string;
  name: string;
  type: 'upload' | 'download';
  status: 'running' | 'done' | 'failed';
  progress: number | null;
  loaded: number;
  total: number;
  message: string;
  createdAt: string;
  itemId?: string;
  cachePrefix?: string;
  chunkCount?: number;
}

export const useTransferStore = defineStore('transfers', () => {
  const tasks = ref<TransferTask[]>([]);
  const floatingVisible = ref(false);
  let owner = '';
  let dismissTimer: ReturnType<typeof setTimeout> | null = null;
  const retryUploads = new Map<string,{file:File;parentId:string|null}>();
  let onUploadComplete: ((item:KnowledgeItem,parentId:string|null)=>void)|null = null;
  const running = computed(() => tasks.value.filter((task) => task.status === 'running'));

  function persist() {
    if (owner) localStorage.setItem(`studydocs-transfers-${owner}`, JSON.stringify(tasks.value.slice(0, 100)));
  }
  function setOwner(id: string | null) {
    if (owner === (id ?? '')) return;
    owner = id ?? '';
    retryUploads.clear();
    if (dismissTimer) clearTimeout(dismissTimer);
    floatingVisible.value = false;
    try {
      const saved = owner ? JSON.parse(localStorage.getItem(`studydocs-transfers-${owner}`) ?? '[]') : [];
      tasks.value = Array.isArray(saved) ? saved.map((task: TransferTask) => task.status === 'running'
        ? { ...task, status: 'failed', message: '页面关闭，传输已中断' } : task) : [];
    } catch { tasks.value = []; }
    persist();
  }
  function add(name: string, type: TransferTask['type'], total = 0) {
    if (dismissTimer) clearTimeout(dismissTimer);
    const task: TransferTask = { id: crypto.randomUUID(), name, type, status: 'running', progress: total ? 0 : null, loaded: 0, total, message: '', createdAt: new Date().toISOString() };
    tasks.value.unshift(task);
    floatingVisible.value = true;
    persist();
    // 返回数组中的响应式代理，后续进度和状态变化才能立即更新浮窗。
    return tasks.value[0];
  }
  function progress(task: TransferTask, loaded: number, total: number) {
    task.loaded = loaded;
    task.total = total;
    task.progress = total ? (loaded >= total ? 100 : Math.floor(loaded / total * 100)) : null;
    if (task.type === 'upload') task.message = total && loaded >= total ? '传输完成，正在处理文件…' : '';
  }
  function finish(task: TransferTask, message = '') {
    task.status = 'done'; task.progress = 100; task.message = message; persist();
    if (!running.value.length) dismissTimer = setTimeout(() => { if (!running.value.length) floatingVisible.value = false; }, 4000);
  }
  function fail(task: TransferTask, error: unknown) {
    task.status = 'failed'; task.message = error instanceof Error ? error.message : '传输失败'; persist();
  }
  async function upload(file: File, parentId: string | null): Promise<KnowledgeItem | null> {
    const task = add(file.name, 'upload', file.size);
    retryUploads.set(task.id,{file,parentId});
    try {
      const item = await api.upload(file, parentId, (loaded, total) => progress(task, loaded, total), (message) => { task.message = message; persist(); }, owner);
      finish(task);
      retryUploads.delete(task.id);
      return item;
    } catch (error) { fail(task, error); return null; }
  }
  async function download(item: KnowledgeItem) {
    const name = item.fileName ?? item.name;
    const task = add(name, 'download');
    task.itemId = item.id;
    persist();
    try {
      const chunkSize = 4 * 1024 * 1024;
      const prefix = `${owner}:${item.id}:${item.version}:${item.updatedAt}`;
      let ticket = await api.downloadTicket(item.id);
      const retry = async (start:number,end:number) => {
        for (let attempt=0;;attempt++) {
          try { return await api.downloadRange(item.id,start,end,ticket); }
          catch (error) {
            if (attempt >= 3 || error instanceof Error && 'status' in error && typeof error.status === 'number' && error.status < 500 && error.status !== 408 && error.status !== 429 && !(ticket.url && error.status === 403)) throw error;
            task.message = `网络中断，正在重试（${attempt+1}/3）`;
            if (ticket.url) ticket = await api.downloadTicket(item.id);
            await new Promise((resolve)=>setTimeout(resolve,Math.min(1000*2**attempt,4000)));
          }
        }
      };
      const first = await retry(0,chunkSize-1);
      const total = first.total;
      await saveChunk(`${prefix}:0`,first.data);
      progress(task,first.data.size,total);
      const count = Math.ceil(total/chunkSize);
      task.cachePrefix = prefix;
      task.chunkCount = count;
      persist();
      const chunks:Blob[] = [first.data];
      for (let i=1;i<count;i++) {
        await yieldToBrowser();
        const start = i*chunkSize;
        let chunk = await cachedChunk(`${prefix}:${i}`);
        if (!chunk || chunk.size !== Math.min(chunkSize,total-start)) {
          const result = await retry(start,Math.min(total-1,start+chunkSize-1));
          if (result.total !== total) throw new Error('文件在下载期间发生变化');
          chunk = result.data;
          await saveChunk(`${prefix}:${i}`,chunk);
        }
        chunks.push(chunk);
        progress(task,start+chunk.size,total);
        task.message = '';
      }
      task.message = '下载完成，正在生成文件…';
      const blob = await joinChunks(chunks);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = name;
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      task.loaded = blob.size; task.total = blob.size;
      finish(task);
      void clearChunks(prefix,count).catch(() => {});
    } catch (error) { fail(task, error); }
  }
  function canRetry(task:TransferTask) { return task.status === 'failed' && (task.type === 'download' && !!task.itemId || retryUploads.has(task.id)); }
  async function retry(task:TransferTask) {
    try {
      if (task.type === 'upload') {
        const saved = retryUploads.get(task.id);
        if (saved) {
          retryUploads.delete(task.id);
          const item = await upload(saved.file,saved.parentId);
          if (item) onUploadComplete?.(item,saved.parentId);
        }
      } else if (task.itemId) {
        const item = (await api.list()).find((entry)=>entry.id === task.itemId);
        if (item) await download(item);
        else task.message = '文件已不存在';
      }
    } catch (error) { task.message = error instanceof Error ? error.message : '重试失败'; persist(); }
  }
  function clearCompleted() {
    for (const task of tasks.value) {
      if (task.status !== 'running') {
        retryUploads.delete(task.id);
        if (task.cachePrefix && task.chunkCount) void clearChunks(task.cachePrefix,task.chunkCount).catch(() => {});
      }
    }
    tasks.value = tasks.value.filter((task) => task.status === 'running'); persist();
  }
  function setUploadComplete(callback:(item:KnowledgeItem,parentId:string|null)=>void) { onUploadComplete = callback; }
  return { tasks, running, floatingVisible, setOwner, upload, download, canRetry, retry, clearCompleted, setUploadComplete };
});
