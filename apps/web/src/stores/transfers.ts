import { computed, ref } from 'vue';
import { defineStore } from 'pinia';
import type { KnowledgeItem } from '@studydocs/shared';
import { api } from '../lib/api';

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
}

export const useTransferStore = defineStore('transfers', () => {
  const tasks = ref<TransferTask[]>([]);
  const floatingVisible = ref(false);
  let owner = '';
  let dismissTimer: ReturnType<typeof setTimeout> | null = null;
  const running = computed(() => tasks.value.filter((task) => task.status === 'running'));

  function persist() {
    if (owner) localStorage.setItem(`studydocs-transfers-${owner}`, JSON.stringify(tasks.value.slice(0, 100)));
  }
  function setOwner(id: string | null) {
    if (owner === (id ?? '')) return;
    owner = id ?? '';
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
    task.progress = total ? Math.min(task.type === 'upload' ? 99 : 100, Math.round(loaded / total * 100)) : null;
    if (task.type === 'upload' && total && loaded >= total) task.message = '正在保存文件…';
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
    try {
      const item = await api.upload(file, parentId, (loaded, total) => progress(task, loaded, total));
      finish(task);
      return item;
    } catch (error) { fail(task, error); return null; }
  }
  async function download(item: KnowledgeItem) {
    const name = item.fileName ?? item.name;
    const task = add(name, 'download');
    try {
      const blob = await api.download(item.id, (loaded, total) => progress(task, loaded, total));
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url; link.download = name;
      document.body.append(link); link.click(); link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
      task.loaded = blob.size; task.total = blob.size;
      finish(task);
    } catch (error) { fail(task, error); }
  }
  function clearCompleted() { tasks.value = tasks.value.filter((task) => task.status === 'running'); persist(); }
  return { tasks, running, floatingVisible, setOwner, upload, download, clearCompleted };
});
