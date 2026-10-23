import { defineStore } from 'pinia';
import { computed, ref } from 'vue';
import type { KnowledgeItem, CreateItemInput, PatchItemInput } from '@studydocs/shared';
import { api } from '../lib/api';
import { useTransferStore } from './transfers';

type Panel = 'home' | 'favorites' | 'recent' | 'trash' | 'search' | 'document' | 'settings' | 'transfers' | 'folder';
export const useKnowledgeStore = defineStore('knowledge', () => {
  const items = ref<KnowledgeItem[]>([]);
  const deleted = ref<KnowledgeItem[]>([]);
  const activeId = ref<string | null>(null);
  const newItemId = ref<string | null>(null);
  const panel = ref<Panel>('home');
  const search = ref('');
  const loading = ref(false);
  const trashLoading = ref(false);
  const error = ref('');
  const toast = ref('');
  const expanded = ref<string[]>(readStorage('studydocs-expanded', []));
  const viewed = ref<string[]>(readStorage('studydocs-viewed', []));
  const active = computed(() => items.value.find((x) => x.id === activeId.value) ?? null);
  const recent = computed(() => viewed.value.map((id) => items.value.find((x) => x.id === id)).filter((v): v is KnowledgeItem => !!v && v.kind !== 'folder'));
  const favorites = computed(() => items.value.filter((x) => x.starred && x.kind !== 'folder'));
  const results = computed(() => {
    const query = search.value.trim().toLowerCase();
    return query ? items.value.filter((x) => x.kind !== 'folder' && `${x.name} ${x.content}`.toLowerCase().includes(query)) : [];
  });
  useTransferStore().setUploadComplete((doc,parentId) => {
    if (!items.value.some((item)=>item.id === doc.id)) items.value.push(doc);
    if (parentId) revealFolder(parentId);
    open(doc.id); notify(`已上传：${doc.fileName ?? doc.name}`);
  });

  function readStorage<T>(key: string, fallback: T): T {
    try { return JSON.parse(localStorage.getItem(key) ?? 'null') ?? fallback; } catch { return fallback; }
  }
  function reset() {items.value=[];deleted.value=[];activeId.value=null;panel.value='home';viewed.value=[];expanded.value=[];search.value='';}
  function notify(message: string) {
    toast.value = message;
    window.setTimeout(() => { if (toast.value === message) toast.value = ''; }, 3000);
  }
  function setError(err: unknown) {
    error.value = err instanceof Error ? err.message : '操作失败';
    notify(error.value);
  }
  async function load() {
    loading.value = true;
    try { items.value = await api.list(); error.value = ''; }
    catch (e) { setError(e); }
    finally { loading.value = false; }
  }
  async function loadTrash() { trashLoading.value = true; try { deleted.value = await api.trash(); } catch (e) { setError(e); } finally { trashLoading.value = false; } }
  function open(id: string, startEditing = false) {
    const item = items.value.find((x) => x.id === id);
    if (!item) return;
    if (item.kind === 'folder') {
      activeId.value = id; panel.value = 'folder'; newItemId.value = null;
      revealFolder(id);
    } else {
      newItemId.value = startEditing ? id : null;
      activeId.value = id; panel.value = 'document';
      viewed.value = [id, ...viewed.value.filter((v) => v !== id)].slice(0, 20);
      localStorage.setItem('studydocs-viewed', JSON.stringify(viewed.value));
    }
    let parent = item.parentId;
    while (parent) { if (!expanded.value.includes(parent)) expanded.value.push(parent); parent = items.value.find((x) => x.id === parent)?.parentId ?? null; }
    localStorage.setItem('studydocs-expanded', JSON.stringify(expanded.value));
  }
  function navigate(to: Panel) {
    panel.value = to;
    if (to === 'folder') activeId.value = null;
    if (to === 'trash') void loadTrash();
  }
  function toggleFolder(id: string) {
    const pos = expanded.value.indexOf(id);
    if (pos === -1) expanded.value.push(id);
    else {
      const collapsed = new Set([id]);
      const descendants = [id];
      for (const parentId of descendants) {
        for (const item of items.value) {
          if (item.parentId === parentId && item.kind === 'folder' && !collapsed.has(item.id)) {
            collapsed.add(item.id); descendants.push(item.id);
          }
        }
      }
      expanded.value = expanded.value.filter(key => !collapsed.has(key));
    }
    localStorage.setItem('studydocs-expanded', JSON.stringify(expanded.value));
  }
  function revealFolder(id: string) {
    if (!expanded.value.includes(id)) { expanded.value.push(id); localStorage.setItem('studydocs-expanded', JSON.stringify(expanded.value)); }
  }
  async function create(input: CreateItemInput) {
    try {
      const doc = await api.create(input); items.value.push(doc);
      if (doc.parentId) revealFolder(doc.parentId);
      if (doc.kind !== 'folder') open(doc.id, true);
      notify('创建成功'); return doc;
    } catch (e) { setError(e); return null; }
  }
  async function update(id: string, input: PatchItemInput, quiet = false) {
    try {
      const item = await api.patch(id, input);
      const idx = items.value.findIndex((x) => x.id === id);
      if (idx >= 0) items.value[idx] = item;
      if (!quiet) notify('已保存');
      return item;
    } catch (e) { setError(e); return null; }
  }
  async function upload(file: File, parentId: string | null) {
    try {
      const doc = await useTransferStore().upload(file, parentId);
      if (!doc) return null;
      items.value.push(doc);
      if (parentId) revealFolder(parentId);
      open(doc.id); notify(`已上传：${file.name}`); return doc;
    } catch (e) { setError(e); return null; }
  }
  async function remove(id: string) {
    try {
      await api.delete(id);
      const toRemove = new Set<string>([id]);
      let changed = true;
      while (changed) {
        changed = false;
        for (const item of items.value) {
          if (item.parentId && toRemove.has(item.parentId) && !toRemove.has(item.id)) { toRemove.add(item.id); changed = true; }
        }
      }
      items.value = items.value.filter((x) => !toRemove.has(x.id));
      if (activeId.value && toRemove.has(activeId.value)) navigate('home');
      notify('已移至回收站');
    } catch (e) { setError(e); }
  }
  async function restore(id: string) { try { await api.restore(id); await Promise.all([load(), loadTrash()]); notify('恢复成功'); } catch (e) { setError(e); } }
  async function forever(id: string) { try { await api.forever(id); await loadTrash(); notify('已永久删除'); } catch (e) { setError(e); } }
  async function move(itemId: string, folderId: string | null) {
    if (itemId === folderId) return false;
    const item = items.value.find((x) => x.id === itemId);
    if (!item) return false;
    if (item.parentId === folderId) return true;
    const result = await update(itemId, { parentId: folderId, version: item.version }, true);
    if (result) { if (folderId) revealFolder(folderId); notify('已移动'); }
    return !!result;
  }
  return { items, deleted, activeId, newItemId, panel, search, loading, trashLoading, error, toast, expanded, viewed, active,
    recent, favorites, results, reset, load, loadTrash, open, navigate, toggleFolder, revealFolder, notify, create, update, upload, remove, restore, forever, move };
});
