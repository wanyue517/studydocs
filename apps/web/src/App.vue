<script setup lang="ts">
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import {
  AlignLeft, ArrowLeft, BookOpenText, Check, ChevronRight, Clock3, CloudUpload,
  FileCode2, FilePlus2, FileText, FolderClosed, FolderPlus, Home, Link2,
  Menu, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings2, Star, Trash2, Upload, X, LogOut, ExternalLink, MoveRight, Download,
} from 'lucide-vue-next';
import type { KnowledgeItem } from '@studydocs/shared';
import { useKnowledgeStore } from './stores/knowledge';
import TreeNode from './components/TreeNode.vue';
import CollectionView from './components/CollectionView.vue';
import DocumentView from './components/DocumentView.vue';
import AuthView from './components/AuthView.vue';
import SettingsView from './components/SettingsView.vue';
import { useAccountStore } from './stores/account';
import { api } from './lib/api';

interface Heading { level: number; title: string; index: number }
type ModalType = 'folder' | 'markdown' | 'richtext' | 'web' | 'rename' | 'move';
const store = useKnowledgeStore();
const account = useAccountStore();
const modal = ref<ModalType | null>(null);
const modalName = ref('');
const modalUrl = ref('');
const modalParent = ref<string | null>(null);
const modalItem = ref<KnowledgeItem | null>(null);
const creating = ref(false);
const showAdd = ref(false);
const showActions = ref(false);
const sidebarVisible = ref(true);
const mobileSidebar = ref(false);
const menu = ref<{ item: KnowledgeItem | null; x: number; y: number } | null>(null);
const menuElement = ref<HTMLElement | null>(null);
const moveDestination = ref('');
const fileInput = ref<HTMLInputElement | null>(null);
const searchInput = ref<HTMLInputElement | null>(null);
const documentRef = ref<{ scrollToHeading: (i: number) => void } | null>(null);
const outline = ref<Heading[]>([]);

const roots = computed(() => store.items.filter((x) => !x.parentId).sort((a,b) => Number(b.kind === 'folder') - Number(a.kind === 'folder') || a.name.localeCompare(b.name, 'zh-CN')));
const active = computed(() => store.active);
const crumbs = computed(() => {
  const list: KnowledgeItem[] = [];
  let current = active.value;
  while (current) { list.unshift(current); current = store.items.find((x) => x.id === current?.parentId) ?? null; }
  return list;
});
const pageName = computed(() => store.panel === 'home' ? '我的知识库' : store.panel === 'favorites' ? '我的收藏' : store.panel === 'recent' ? '最近访问' : store.panel === 'trash' ? '回收站' : store.panel === 'search' ? '搜索' : store.panel === 'settings' ? '系统设置' : active.value?.name ?? '知识库');
const modalTitle = computed(() => ({ folder: '新建文件夹', markdown: '新建 Markdown', richtext: '新建富文本', web: '收藏网页', rename: '重命名', move: '移动到文件夹' } as Record<ModalType,string>)[modal.value ?? 'folder']);
const menuKind = computed(() => menu.value?.item?.kind);
const moveFolders = computed(() => store.items.filter((candidate) => {
  const item = modalItem.value;
  if (candidate.kind !== 'folder' || candidate.id === item?.id) return false;
  if (item?.kind !== 'folder') return true;
  let parent = candidate.parentId;
  while (parent) {
    if (parent === item.id) return false;
    parent = store.items.find((entry) => entry.id === parent)?.parentId ?? null;
  }
  return true;
}).sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')));
function folderPath(folder: KnowledgeItem): string {
  const parts = [folder.name];
  let parent = folder.parentId;
  while (parent) {
    const next = store.items.find((entry) => entry.id === parent);
    if (!next) break;
    parts.unshift(next.name); parent = next.parentId;
  }
  return parts.join(' / ');
}

function openModal(kind: ModalType, parentId: string | null = null, item: KnowledgeItem | null = null) {
  showAdd.value = false; menu.value = null; showActions.value = false;
  modal.value = kind; modalParent.value = parentId; modalItem.value = item;
  modalName.value = item?.name ?? (kind === 'folder' ? '新建文件夹' : kind === 'markdown' ? '未命名笔记' : kind === 'richtext' ? '未命名文档' : '网页收藏');
  modalUrl.value = item?.url ?? '';
  if (kind === 'move') moveDestination.value = item?.parentId ?? '';
}
async function submitModal() {
  if (!modal.value || (modal.value !== 'move' && !modalName.value.trim()) || creating.value) return;
  creating.value = true;
  try {
    if (modal.value === 'move' && modalItem.value) {
      const moved = await store.move(modalItem.value.id, moveDestination.value || null);
      if (moved) modal.value = null;
    } else if (modal.value === 'rename' && modalItem.value) {
      const done = await store.update(modalItem.value.id, { name: modalName.value.trim(), version: modalItem.value.version });
      if (done) modal.value = null;
    } else {
      const type = modal.value;
      if (type === 'rename' || type === 'move') return;
      const doc = await store.create({ kind: type, name: modalName.value.trim(), parentId: modalParent.value, ...(type === 'web' ? { url: modalUrl.value.trim() } : {}) });
      if (doc) { modal.value = null; mobileSidebar.value = false; }
    }
  } finally { creating.value = false; }
}
function openUpload(parent: string | null = null) { modalParent.value = parent; showAdd.value = false; menu.value = null; fileInput.value?.click(); }
async function handleFiles(event: Event) {
  const input = event.target as HTMLInputElement;
  for (const file of Array.from(input.files ?? [])) await store.upload(file, modalParent.value);
  input.value = '';
  mobileSidebar.value = false;
}
function showMenu(item: KnowledgeItem | null, x: number, y: number) {
  menu.value = { item, x: Math.max(8, x), y: Math.max(8, y) };
  const openedMenu = menu.value;
  showAdd.value = false;
  showActions.value = false;
  void nextTick(() => {
    if (menu.value !== openedMenu || !menuElement.value) return;
    const rect = menuElement.value.getBoundingClientRect();
    menu.value = {
      ...menu.value,
      x: Math.max(8, Math.min(x, window.innerWidth - rect.width - 8)),
      y: Math.max(8, Math.min(y, window.innerHeight - rect.height - 8)),
    };
  });
}
function openMenuItem() {
  const item = menu.value?.item;
  menu.value = null;
  if (!item) return;
  if (item.kind === 'folder') { store.toggleFolder(item.id); return; }
  store.open(item.id);
  mobileSidebar.value = false;
}
function closeContextMenu() { menu.value = null; }
function onGlobalScroll(event: Event) {
  if (!(event.target instanceof Node) || !menuElement.value?.contains(event.target)) closeContextMenu();
}
function onGlobalPointerDown(event: PointerEvent) {
  const target = event.target;
  if (!(target instanceof Element)) return;
  if (menu.value && !menuElement.value?.contains(target)) closeContextMenu();
  if (showAdd.value && !target.closest('.add-menu, .sidebar-title-actions')) showAdd.value = false;
  if (showActions.value && !target.closest('.more-anchor')) showActions.value = false;
}
function onGlobalContextMenu(event: MouseEvent) {
  const target = event.target;
  if (menu.value && (!(target instanceof Element) || !target.closest('.tree-line, .sidebar-tree, .context-menu'))) closeContextMenu();
}

function deleteMenuItem() {
  const item = menu.value?.item;
  if (!item) return;
  menu.value = null;
  if (window.confirm(`将「${item.name}」${item.kind === 'folder' ? '及其所有子项' : ''}移入回收站？`)) void store.remove(item.id);
}
function toggleStar() {
  const item = menu.value?.item ?? active.value;
  if (!item) return;
  void store.update(item.id, { starred: !item.starred });
  menu.value = null; showActions.value = false;
}
function removeActive() {
  const item = active.value;
  if (!item) return;
  if (window.confirm(`将「${item.name}」移入回收站？`)) void store.remove(item.id);
  showActions.value = false;
}
function onKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); store.navigate('search'); void nextTick(() => searchInput.value?.focus()); }
  if (event.key === 'Escape') { modal.value = null; menu.value = null; showAdd.value = false; showActions.value = false; mobileSidebar.value = false; }
}
function go(panel: 'home' | 'recent' | 'favorites' | 'trash') { store.navigate(panel); mobileSidebar.value = false; outline.value = []; }
function dropRoot(event: DragEvent) { const id = event.dataTransfer?.getData('text/plain'); if (id) void store.move(id, null); }
async function signOut() {
  await account.logout();
  store.reset();
  menu.value = null;
}
function unauthorized() { account.user = null;store.reset(); }
onMounted(async () => {
  window.addEventListener('keydown',onKeydown);
  window.addEventListener('pointerdown', onGlobalPointerDown, true);
  window.addEventListener('contextmenu', onGlobalContextMenu, true);
  window.addEventListener('scroll', onGlobalScroll, true);
  window.addEventListener('resize', closeContextMenu);
  window.addEventListener('studydocs:unauthorized',unauthorized);
  await account.bootstrap();
});
onUnmounted(() => {
  window.removeEventListener('keydown',onKeydown);
  window.removeEventListener('pointerdown', onGlobalPointerDown, true);
  window.removeEventListener('contextmenu', onGlobalContextMenu, true);
  window.removeEventListener('scroll', onGlobalScroll, true);
  window.removeEventListener('resize', closeContextMenu);
  window.removeEventListener('studydocs:unauthorized',unauthorized);
});
watch(() => account.user?.id, (id, oldId) => {
  if (id && id !== oldId) { store.reset(); void store.load(); }
});
</script>

<template>
  <div v-if="!account.ready" class="auth-loading">正在加载拾页...</div>
  <AuthView v-else-if="!account.user" />
  <div v-else class="app-shell" @click="menu = null; showActions = false; showAdd = false">
    <aside class="icon-rail">
      <button class="brand-mark" :title="account.site.siteName" @click.stop="go('home')"><img v-if="account.site.logoUrl" :src="account.site.logoUrl" alt="Logo" /><span v-else>拾</span></button>
      <div class="rail-separator"></div>
      <button class="rail-button" :class="{ active: store.panel === 'home' }" title="知识库首页" @click.stop="go('home')"><Home :size="21" :stroke-width="1.9" /></button>
      <button class="rail-button" :class="{ active: store.panel === 'favorites' }" title="我的收藏" @click.stop="go('favorites')"><Star :size="21" :stroke-width="1.8" /></button>
      <button class="rail-button" :class="{ active: store.panel === 'recent' }" title="最近访问" @click.stop="go('recent')"><Clock3 :size="21" :stroke-width="1.8" /></button>
      <div class="rail-bottom"><button class="rail-button" title="系统设置与账号安全" :class="{ active: store.panel==='settings' }" @click.stop="store.navigate('settings')"><Settings2 :size="20" /></button><button class="rail-button" :class="{ active: store.panel === 'trash' }" title="回收站" @click.stop="go('trash')"><Trash2 :size="20" /></button><button class="avatar" :title="account.user.username + ' · 退出登录'" @click.stop="signOut">{{ account.user.username.slice(0,1).toUpperCase() }}</button></div>
    </aside>

    <aside class="folder-sidebar" :class="{ closed: !sidebarVisible, 'mobile-open': mobileSidebar }" @click.stop>
      <div class="sidebar-inner">
      <div class="sidebar-top"><div class="workspace-logo"><span class="workspace-symbol"><BookOpenText :size="21" /></span><strong>{{ account.site.siteName }}</strong></div><button class="icon-btn collapse-sidebar" title="收起侧边栏" @click="sidebarVisible = false; mobileSidebar = false"><PanelLeftClose :size="18" /></button></div>
      <button class="search-trigger" @click="store.navigate('search'); nextTick(() => searchInput?.focus())"><Search :size="16" />搜索文档<kbd>Ctrl K</kbd></button>
      
      <div class="side-nav">
        <button :class="{ active: store.panel === 'home' }" @click="go('home')"><Home :size="17" />知识库首页</button>
        <button :class="{ active: store.panel === 'favorites' }" @click="go('favorites')"><Star :size="17" />我的收藏 <span class="nav-count">{{ store.favorites.length }}</span></button>
        <button :class="{ active: store.panel === 'recent' }" @click="go('recent')"><Clock3 :size="17" />最近访问</button>
      </div>
      <div class="sidebar-section-title"><span>我的文档</span><div class="sidebar-title-actions"><button title="上传文件" @click="openUpload()"><Upload :size="16" /></button><button title="创建内容" @click.stop="showAdd = !showAdd"><Plus :size="17" /></button></div></div>
      <div v-if="showAdd" class="add-menu floating-panel" @click.stop>
        <button @click="openModal('folder')"><FolderPlus :size="16" />新建文件夹</button>
        <button @click="openModal('markdown')"><FileCode2 :size="16" />Markdown 笔记</button>
        <button @click="openModal('richtext')"><FileText :size="16" />富文本文档</button>
        <button @click="openModal('web')"><Link2 :size="16" />收藏网页</button>
        <div class="dropdown-divider"></div>
        <button @click="openUpload()"><CloudUpload :size="16" />上传文件</button>
      </div>
      <div class="sidebar-tree custom-scroll" @contextmenu.prevent.stop="showMenu(null, $event.clientX, $event.clientY)"><TreeNode v-for="item in roots" :key="item.id" :item="item" @menu="showMenu" /><div v-if="!roots.length" class="tree-zero">右键新建文档</div></div>
      <div class="root-drop" @dragover.prevent @drop.prevent="dropRoot"><ArrowLeft :size="14" />拖到这里移至根目录</div>
      <div class="sidebar-foot"><div class="sidebar-foot-icon"><Settings2 :size="16" /></div><div><strong>{{ account.user.username }}</strong><small>{{ account.user.role==='admin'?'管理员':'个人知识空间' }}</small></div><button class="icon-btn" title="退出登录" @click="signOut"><LogOut :size="16" /></button></div>
      </div>
    </aside>

    <main class="main-area">
      <header class="topbar">
        <button v-if="!sidebarVisible" class="icon-btn reopen" title="打开侧边栏" @click.stop="sidebarVisible = true"><PanelLeftOpen :size="19" /></button>
        <button class="icon-btn mobile-menu-btn" title="打开文档目录" @click.stop="mobileSidebar = !mobileSidebar"><Menu :size="20" /></button>
        <div class="breadcrumbs"><button @click="go('home')">知识库</button><template v-if="store.panel === 'document' && active"><template v-for="crumb in crumbs" :key="crumb.id"><ChevronRight :size="14" /><button v-if="crumb.kind === 'folder'" @click="store.toggleFolder(crumb.id)">{{ crumb.name }}</button><strong v-else>{{ crumb.name }}</strong></template></template><template v-else><ChevronRight :size="14" /><strong>{{ pageName }}</strong></template></div>
        <div class="topbar-right">
          <button class="topbar-search icon-btn" title="搜索 Ctrl+K" @click.stop="store.navigate('search'); nextTick(() => searchInput?.focus())"><Search :size="19" /></button>
          <template v-if="store.panel === 'document' && active"><div class="topbar-split"></div><button class="icon-btn star-toggle" :class="{ 'is-starred': active.starred }" :title="active.starred ? '取消收藏' : '收藏文档'" @click.stop="toggleStar"><Star :size="19" :fill="active.starred ? 'currentColor' : 'none'" /></button><div class="more-anchor"><button class="icon-btn" title="更多操作" @click.stop="showActions = !showActions"><MoreHorizontal :size="21" /></button><div v-if="showActions" class="more-popup floating-panel" @click.stop><button @click="openModal('rename', null, active)"><FileText :size="16" />重命名</button><button @click="toggleStar"><Star :size="16" />{{ active.starred ? '取消收藏' : '加入收藏' }}</button><a v-if="active.fileName" :href="`/api/items/${active.id}/file?download=1`"><Upload :size="16" class="rotate-180" />下载文件</a><button class="danger" @click="removeActive"><Trash2 :size="16" />移至回收站</button></div></div></template>
          
        </div>
      </header>
      <div v-if="store.panel === 'search'" class="search-panel"><Search :size="21" /><input ref="searchInput" v-model="store.search" autofocus placeholder="搜索文档标题或正文内容..." /><button v-if="store.search" class="icon-btn" @click="store.search = ''"><X :size="17" /></button></div>
      <div class="main-scroll custom-scroll" :class="{ 'document-scroll': store.panel === 'document', 'has-search': store.panel === 'search' }">
        <SettingsView v-if="store.panel==='settings'" />
        <DocumentView v-else-if="store.panel === 'document' && active" :key="active.id" ref="documentRef" :item="active" @outline="outline = $event" />
        <CollectionView v-else @create="(kind) => openModal(kind)" @upload="openUpload()" />
      </div>
    </main>

    <aside v-if="store.panel === 'document' && active && (active.kind === 'markdown' || active.kind === 'richtext')" class="outline-sidebar">
      <div class="outline-header"><AlignLeft :size="17" /><span>文章目录</span></div>
      <div class="outline-list custom-scroll"><button v-for="heading in outline" :key="heading.index" :class="`outline-h${heading.level}`" @click="documentRef?.scrollToHeading(heading.index)">{{ heading.title }}</button></div>
    </aside>

    <div v-if="menu" ref="menuElement" class="context-menu floating-panel" role="menu" :style="{ left: `${menu.x}px`, top: `${menu.y}px` }" @click.stop>
      <template v-if="!menu.item || menuKind === 'folder'">
        <button role="menuitem" @click="openModal('folder', menu!.item?.id ?? null)"><FolderPlus :size="16" />新建文件夹</button>
        <button role="menuitem" @click="openModal('markdown', menu!.item?.id ?? null)"><FileCode2 :size="16" />新建 Markdown</button>
        <button role="menuitem" @click="openModal('richtext', menu!.item?.id ?? null)"><FileText :size="16" />新建富文本</button>
        <button role="menuitem" @click="openModal('web', menu!.item?.id ?? null)"><Link2 :size="16" />收藏网页</button>
        <button role="menuitem" @click="openUpload(menu!.item?.id ?? null)"><Upload :size="16" />上传文件</button>
      </template>
      <template v-if="menu.item">
        <div class="dropdown-divider"></div>
        <button role="menuitem" @click="openMenuItem"><FolderClosed v-if="menuKind === 'folder'" :size="16" /><FileText v-else :size="16" />{{ menuKind === 'folder' ? '展开或收起' : '打开文档' }}</button>
        <button role="menuitem" @click="openModal('rename', null, menu!.item)"><FileText :size="16" />重命名</button>
        <button role="menuitem" @click="toggleStar"><Star :size="16" />{{ menu.item.starred ? '取消收藏' : '加入收藏' }}</button>
        <button role="menuitem" @click="openModal('move', null, menu!.item)"><MoveRight :size="16" />移动到...</button>
        <a v-if="menu.item.fileName" :href="api.fileUrl(menu.item.id, true)" :download="menu.item.fileName ?? menu.item.name" role="menuitem" @click="menu = null"><Download :size="16" />下载文件</a>
        <a v-if="menuKind === 'web' && menu.item.url" :href="menu.item.url || undefined" target="_blank" rel="noopener noreferrer" role="menuitem" @click="menu = null"><ExternalLink :size="16" />打开原网页</a>
        <div class="dropdown-divider"></div>
        <button role="menuitem" class="danger" @click="deleteMenuItem"><Trash2 :size="16" />移至回收站</button>
      </template>
    </div>

    <div v-if="modal" class="modal-backdrop" @click.self="modal = null">
      <form v-if="modal === 'move'" class="create-dialog" @submit.prevent="submitModal">
        <div class="modal-header"><div class="modal-symbol"><MoveRight :size="21" /></div><button type="button" class="icon-btn" aria-label="关闭" @click="modal = null"><X :size="18" /></button></div>
        <h2>移动到文件夹</h2>
        <p class="move-item-name">{{ modalItem?.name }}</p>
        <label for="move-target">目标位置</label>
        <select id="move-target" v-model="moveDestination" class="move-select">
          <option value="">根目录</option>
          <option v-for="folder in moveFolders" :key="folder.id" :value="folder.id">{{ folderPath(folder) }}</option>
        </select>
        <div class="dialog-actions"><button type="button" class="secondary-btn" @click="modal = null">取消</button><button type="submit" class="primary-btn" :disabled="creating">{{ creating ? '移动中...' : '确认移动' }}</button></div>
      </form>
      <form v-else class="create-dialog" @submit.prevent="submitModal"><div class="modal-header"><div class="modal-symbol"><FolderPlus v-if="modal === 'folder'" :size="21" /><FileCode2 v-else-if="modal === 'markdown'" :size="21" /><Link2 v-else-if="modal === 'web'" :size="21" /><FileText v-else :size="21" /></div><button type="button" class="icon-btn" aria-label="关闭" @click="modal = null"><X :size="18" /></button></div><h2>{{ modalTitle }}</h2><label for="new-name">{{ modal === 'folder' ? '文件夹名称' : '名称' }}</label><input id="new-name" v-model="modalName" autofocus maxlength="140" required placeholder="输入名称" /><template v-if="modal === 'web'"><label for="new-url">网页地址</label><input id="new-url" v-model="modalUrl" type="url" required placeholder="https://example.com" /></template><div v-if="modal !== 'rename'" class="dialog-location">保存到：{{ modalParent ? store.items.find((x) => x.id === modalParent)?.name ?? '根目录' : '根目录' }}</div><div class="dialog-actions"><button type="button" class="secondary-btn" @click="modal = null">取消</button><button type="submit" :disabled="!modalName.trim() || (modal === 'web' && !modalUrl.trim()) || creating" class="primary-btn">{{ creating ? '正在创建...' : modal === 'rename' ? '保存修改' : '确认创建' }}</button></div></form>
    </div>
    <input ref="fileInput" class="visually-hidden" type="file" multiple accept=".md,.markdown,.html,.htm,.pdf,.docx" @change="handleFiles" />
    <Transition name="toast"><div v-if="store.toast" class="toast-msg"><span class="toast-icon"><Check :size="15" /></span>{{ store.toast }}<button @click="store.toast = ''"><X :size="14" /></button></div></Transition>
    <div v-if="mobileSidebar" class="mobile-shade" @click="mobileSidebar = false"></div>
  </div>
</template>
