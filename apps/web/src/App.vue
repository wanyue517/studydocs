<script setup lang="ts">
import { computed, defineAsyncComponent, h, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';
import { AlignLeft, BookOpenText, FolderTree, ChevronRight, Clock3, Home, MoreHorizontal, PanelLeftClose, PanelLeftOpen, Plus, Search, Settings2, Star, Trash2, Upload, X, ListChecks } from 'lucide-vue-next';
import type { KnowledgeItem } from '@studydocs/shared';
import { useKnowledgeStore } from './stores/knowledge';
import TreeNode from './components/TreeNode.vue';
import OutlineNode from './components/OutlineNode.vue';
import { buildOutline, type Heading } from './lib/outline';
import PanelResizeHandle from './components/PanelResizeHandle.vue';
import { useSidebarWidths } from './composables/useSidebarWidths';
import CollectionView from './components/CollectionView.vue';
import HomeView from './components/HomeView.vue';
import TransferView from './components/TransferView.vue';
import TransferFloat from './components/TransferFloat.vue';
const DocumentView = defineAsyncComponent({loader: () => import('./components/DocumentView.vue'),delay:0,loadingComponent: {render: () => h('div',{class:'preview-loading',role:'status'},'正在打开文档…')}});
import AuthView from './components/AuthView.vue';
const SettingsView = defineAsyncComponent({loader: () => import('./components/SettingsView.vue'),delay:0,loadingComponent: {render: () => h('div',{class:'preview-loading',role:'status'},'正在打开设置…')}});
import { useAccountStore } from './stores/account';
import { useTransferStore } from './stores/transfers';
import roseImage from './assets/gold-rose.webp';
import Dialog from 'primevue/dialog';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import FolderSelect from './components/FolderSelect.vue';
import PrimeMenu from 'primevue/menu';
import ContextMenu from 'primevue/contextmenu';
import ConfirmDialog from 'primevue/confirmdialog';
import { useConfirm } from 'primevue/useconfirm';
import Toast from 'primevue/toast';
import FileUpload from 'primevue/fileupload';
import { useToast } from 'primevue/usetoast';

type ModalType = 'folder' | 'markdown' | 'richtext' | 'web' | 'rename' | 'move';
const store = useKnowledgeStore();
const account = useAccountStore();
const transfers = useTransferStore();
const confirm = useConfirm();
const toast = useToast();
const addMenuRef = ref<InstanceType<typeof PrimeMenu> | null>(null);
const moreMenuRef = ref<InstanceType<typeof PrimeMenu> | null>(null);
const accountMenuRef = ref<InstanceType<typeof PrimeMenu> | null>(null);
const contextMenuRef = ref<InstanceType<typeof ContextMenu> | null>(null);
const modal = ref<ModalType | null>(null);
const dialogVisible = computed({
  get: () => modal.value !== null,
  set: (visible: boolean) => { if (!visible && !creating.value) modal.value = null; },
});
const modalName = ref('');
const modalNameInput = ref<InstanceType<typeof InputText> | null>(null);
const modalUrl = ref('');
const modalParent = ref<string | null>(null);
const modalItem = ref<KnowledgeItem | null>(null);
const creating = ref(false);
const sidebarVisible = ref(true);
const shellRef = ref<HTMLElement | null>(null);
const markdownEditing = ref(false);
const hasOutline = computed(() => store.panel === 'document' && (store.active?.kind === 'markdown' || store.active?.kind === 'richtext'));
const panels = useSidebarWidths(shellRef, sidebarVisible, hasOutline);
const mobileSidebar = ref(false);
const menu = ref<{ item: KnowledgeItem | null } | null>(null);
const moveDestination = ref('');
const fileInput = ref<InstanceType<typeof FileUpload> | null>(null);
const searchInput = ref<InstanceType<typeof InputText> | null>(null);
const documentRef = ref<{ scrollToHeading: (i: number) => void } | null>(null);
const outline = ref<Heading[]>([]);
const outlineTree = computed(() => buildOutline(outline.value));
const sidebarDragOver = ref(false);
let sidebarDragDepth = 0;

const roots = computed(() => store.items.filter((x) => !x.parentId).sort((a,b) => Number(b.kind === 'folder') - Number(a.kind === 'folder') || a.name.localeCompare(b.name, 'zh-CN')));
const active = computed(() => store.active);
const crumbs = computed(() => {
  const list: KnowledgeItem[] = [];
  let current = active.value;
  while (current) { list.unshift(current); current = store.items.find((x) => x.id === current?.parentId) ?? null; }
  return list;
});
const pageName = computed(() => store.panel === 'home' ? '首页' : store.panel === 'favorites' ? '我的收藏' : store.panel === 'recent' ? '最近访问' : store.panel === 'trash' ? '回收站' : store.panel === 'search' ? '搜索' : store.panel === 'settings' ? '系统设置' : store.panel === 'transfers' ? '任务管理' : '');
const modalTitle = computed(() => ({ folder: '新建文件夹', markdown: '新建 Markdown', richtext: '新建富文本', web: '收藏网页', rename: '重命名', move: '移动到文件夹' } as Record<ModalType,string>)[modal.value ?? 'folder']);

function openModal(kind: ModalType, parentId: string | null = null, item: KnowledgeItem | null = null) {
  menu.value = null;
  modal.value = kind; modalParent.value = parentId; modalItem.value = item;
  modalName.value = item?.name ?? (kind === 'folder' ? '新建文件夹' : kind === 'markdown' ? '未命名笔记' : kind === 'richtext' ? '未命名文档' : '网页收藏');
  modalUrl.value = item?.url ?? '';
  if (kind === 'move') moveDestination.value = item?.parentId ?? '';
}
async function selectModalName() {
  await nextTick();
  if (!modal.value || modal.value === 'move') return;
  const input = (modalNameInput.value as unknown as { $el: HTMLInputElement } | null)?.$el;
  if (input instanceof HTMLInputElement) { input.focus({ preventScroll: true }); input.select(); }
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
function focusSearch() {
  void nextTick(() => (searchInput.value as unknown as { $el: HTMLInputElement } | null)?.$el?.focus());
}
function openUpload(parent: string | null = null) {
  modalParent.value = parent;
  menu.value = null;
  (fileInput.value as unknown as { choose: () => void } | null)?.choose();
}
async function handleFiles(event: { files: File[] | File }) {
  const files = Array.isArray(event.files) ? event.files : [event.files];
  const parentId = modalParent.value;
  for (const file of files) await store.upload(file, parentId);
  (fileInput.value as unknown as { clear: () => void } | null)?.clear();
  mobileSidebar.value = false;
}
function showMenu(item: KnowledgeItem | null, event: MouseEvent) {
  menu.value = { item };
  contextMenuRef.value?.show(event);
}
const addItems = [
  { label: '新建文件夹', command: () => openModal('folder') },
  { label: 'Markdown 笔记', command: () => openModal('markdown') },
  { label: '富文本文档', command: () => openModal('richtext') },
  { label: '收藏网页', command: () => openModal('web') },
  { separator: true },
  { label: '上传文件', command: () => openUpload() },
];
const moreItems = computed(() => active.value ? [
  { label: '重命名', command: () => openModal('rename', null, active.value) },
  { label: active.value.starred ? '取消收藏' : '加入收藏', command: () => toggleStar() },
  { label: '移动到文件夹', command: () => openModal('move', null, active.value) },
  ...(active.value.fileName ? [{ label: '下载文件', command: () => downloadFile(active.value!) }] : []),
  { separator: true },
  { label: '移至回收站', command: () => removeActive() },
] : []);
const contextItems = computed(() => {
  const item = menu.value?.item;
  const add = !item || item.kind === 'folder' ? [
    { label: '新建文件夹', command: () => openModal('folder', item?.id ?? null) },
    { label: '新建 Markdown', command: () => openModal('markdown', item?.id ?? null) },
    { label: '新建富文本', command: () => openModal('richtext', item?.id ?? null) },
    { label: '收藏网页', command: () => openModal('web', item?.id ?? null) },
    { label: '上传文件', command: () => openUpload(item?.id ?? null) },
  ] : [];
  if (!item) return add;
  return [
    ...add, ...(add.length ? [{separator:true}] : []),
    { label: item.kind === 'folder' ? '打开文件夹' : '打开文档', command: openMenuItem },
    { label: '重命名', command: () => openModal('rename', null, item) },
    { label: item.starred ? '取消收藏' : '加入收藏', command: () => toggleStar(item) },
    { label: '移动到文件夹', command: () => openModal('move', null, item) },
    ...(item.fileName ? [{ label: '下载文件', command: () => downloadFile(item) }] : []),
    ...(item.kind === 'web' && item.url ? [{ label: '打开原网页', command: () => window.open(item.url!, '_blank', 'noopener,noreferrer') }] : []),
    {separator: true},
    { label: '移至回收站', command: () => requestDelete(item) },
  ];
});
function downloadFile(item: KnowledgeItem) {
  void transfers.download(item);
}
function requestDelete(item: KnowledgeItem) {
  menu.value = null;
  confirm.require({
    header: '移至回收站',
    message: `确定将「${item.name}」${item.kind === 'folder' ? '及其子项' : ''}移入回收站？`,
    rejectProps: { label: '取消', severity: 'secondary', outlined: true },
    acceptProps: { label: '移至回收站' },
    accept: () => { void store.remove(item.id); },
  });
}
function openMenuItem() {
  const item = menu.value?.item;
  menu.value = null;
  if (!item) return;
  store.open(item.id);
  mobileSidebar.value = false;
}
function toggleStar(item: KnowledgeItem | null = active.value) {
  if (!item) return;
  void store.update(item.id, { starred: !item.starred });
  menu.value = null;
}
function removeActive() { if (active.value) requestDelete(active.value); }
function onKeydown(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') { event.preventDefault(); store.navigate('search'); focusSearch(); }
  if (event.key === 'Escape') { mobileSidebar.value = false; }
}
function go(panel: 'home' | 'recent' | 'favorites' | 'trash') { store.navigate(panel); mobileSidebar.value = false; outline.value = []; }
function resetSidebarDrag() { sidebarDragDepth = 0; sidebarDragOver.value = false; }
function enterSidebar(event: DragEvent) { if (!Array.from(event.dataTransfer?.types ?? []).some((type) => type === 'text/plain' || type === 'Files')) return; sidebarDragDepth++; sidebarDragOver.value = true; }
function leaveSidebar() { sidebarDragDepth = Math.max(0, sidebarDragDepth - 1); if (!sidebarDragDepth) sidebarDragOver.value = false; }
function dropRoot(event: DragEvent) {
  resetSidebarDrag();
  if (event.target instanceof Element && event.target.closest('.tree-line')) return;
  if (event.dataTransfer?.files.length) {
    for (const file of Array.from(event.dataTransfer.files)) void store.upload(file, null);
    return;
  }
  const id = event.dataTransfer?.getData('text/plain');
  if (id) void store.move(id, null);
}
async function signOut() {
  await account.logout();
  store.reset();
  transfers.setOwner(null);
  menu.value = null;
}
const accountItems = computed(() => [
  { label: account.user?.username ?? '账户', disabled: true },
  { separator: true },
  { label: '退出登录', command: () => { void signOut(); } },
]);
function unauthorized() { account.user = null;store.reset(); }
onMounted(async () => {
  window.addEventListener('keydown',onKeydown);
  // Capture drops even when a tree node stops event propagation.
  window.addEventListener('drop',resetSidebarDrag,true);
  window.addEventListener('dragend',resetSidebarDrag,true);
  window.addEventListener('blur',resetSidebarDrag);
  window.addEventListener('studydocs:unauthorized',unauthorized);
  await account.bootstrap();
});
onUnmounted(() => {
  window.removeEventListener('keydown',onKeydown);
  window.removeEventListener('drop',resetSidebarDrag,true);
  window.removeEventListener('dragend',resetSidebarDrag,true);
  window.removeEventListener('blur',resetSidebarDrag);
  window.removeEventListener('studydocs:unauthorized',unauthorized);
});
watch(() => store.toast, (value) => {
  if (value) {
    toast.add({ severity: 'success', summary: value, life: 3000 });
    store.toast = '';
  }
});
watch(() => account.user?.id, (id, oldId) => {
  transfers.setOwner(id ?? null);
  if (id && id !== oldId) { store.reset(); void store.load(); }
});
</script>

<template>
  <div v-if="!account.ready" class="auth-loading" role="status">正在加载网站配置…</div>
  <div v-else-if="!account.siteLoaded" class="auth-loading"><div class="site-load-error" role="alert"><p>{{ account.message }}</p><Button label="重新加载" @click="account.bootstrap()" /></div></div>
  <AuthView v-else-if="!account.user" />
  <div v-else ref="shellRef" class="app-shell" :style="panels.style.value" :class="{ 'has-global-rose': store.panel !== 'home' }">
    <img v-if="store.panel !== 'home'" class="global-rose-watermark" :src="roseImage" alt="" aria-hidden="true" />
    <aside class="icon-rail">
      <Button class="brand-mark" :title="account.site.siteName" @click.stop="go('home')"><img v-if="account.site.logoUrl" :src="account.site.logoUrl" alt="Logo" /><BookOpenText v-else :size="25" /></Button>
      <div class="rail-separator"></div>
      <Button class="rail-button mobile-folder-toggle" title="打开文档目录" aria-label="打开文档目录" @click.stop="mobileSidebar = !mobileSidebar"><FolderTree :size="21" /></Button>
      <Button class="rail-button" :class="{ active: store.panel === 'home' }" title="知识库首页" @click.stop="go('home')"><Home :size="21" :stroke-width="1.9" /></Button>
      <Button class="rail-button" :class="{ active: store.panel === 'favorites' }" title="我的收藏" @click.stop="go('favorites')"><Star :size="21" :stroke-width="1.8" /></Button>
      <Button class="rail-button" :class="{ active: store.panel === 'recent' }" title="最近访问" @click.stop="go('recent')"><Clock3 :size="21" :stroke-width="1.8" /></Button>
      <Button class="rail-button" :class="{ active: store.panel === 'transfers' }" title="任务管理" @click.stop="store.navigate('transfers')"><ListChecks :size="21" :stroke-width="1.8" /></Button>
      <div class="rail-bottom"><Button class="rail-button" title="系统设置与账号安全" :class="{ active: store.panel==='settings' }" @click.stop="store.navigate('settings')"><Settings2 :size="20" /></Button><Button class="rail-button" :class="{ active: store.panel === 'trash' }" title="回收站" @click.stop="go('trash')"><Trash2 :size="20" /></Button><Button class="avatar" :title="account.user.username + ' · 账户菜单'" aria-label="打开账户菜单" aria-haspopup="menu" @click.stop="accountMenuRef?.toggle($event)">{{ account.user.username.slice(0,1).toUpperCase() }}</Button><PrimeMenu ref="accountMenuRef" :model="accountItems" popup class="study-popup-menu account-popup-menu" /></div>
    </aside>

    <aside id="folder-panel" class="folder-sidebar" :class="{ closed: !sidebarVisible, 'mobile-open': mobileSidebar, 'sidebar-drag-over': sidebarDragOver }" @click.stop @dragenter="enterSidebar" @dragleave="leaveSidebar" @dragover.prevent @drop.prevent="dropRoot">
      <div class="sidebar-inner">
      <div class="sidebar-section-title"><span>我的文档</span><div class="sidebar-title-actions"><Button title="上传文件" @click="openUpload()"><Upload :size="16" /></Button><Button title="创建内容" @click.stop="addMenuRef?.toggle($event)"><Plus :size="17" /></Button><Button class="icon-btn collapse-sidebar" title="收起侧边栏" @click="sidebarVisible = false; mobileSidebar = false"><PanelLeftClose :size="18" /></Button></div></div>
      <PrimeMenu ref="addMenuRef" :model="addItems" popup class="study-popup-menu" />
      <div class="sidebar-tree custom-scroll" @contextmenu.prevent.stop="showMenu(null, $event)"><TreeNode v-for="item in roots" :key="item.id" :item="item" @menu="showMenu" /><div v-if="!roots.length" class="tree-zero">{{ store.loading ? '正在加载文档…' : '右键新建文档' }}</div></div>
      </div>
      <PanelResizeHandle v-if="sidebarVisible && panels.desktop.value" side="left" :width="panels.widths.value.left" :min="220" :max="panels.leftMax.value" :default-width="284" controls="folder-panel" label="调整左侧文档栏宽度" @resize="panels.resize('left', $event)" @finish="panels.persist" />
    </aside>

    <main class="main-area">
      <header class="topbar">
        <Button v-if="!sidebarVisible" class="icon-btn reopen" title="打开侧边栏" @click.stop="sidebarVisible = true"><PanelLeftOpen :size="19" /></Button>
        <nav v-if="(store.panel === 'document' || store.panel === 'folder') && crumbs.length > 1" class="breadcrumbs" aria-label="文档路径"><template v-for="(crumb, index) in crumbs" :key="crumb.id"><ChevronRight v-if="index" :size="14" /><button v-if="index < crumbs.length - 1" type="button" @click="store.open(crumb.id)">{{ crumb.name }}</button><strong v-else aria-current="page">{{ crumb.name }}</strong></template></nav>
        <span v-else-if="store.panel !== 'document' && store.panel !== 'folder'" class="topbar-page-title">{{ pageName }}</span>
        <div class="topbar-right">
          <div id="document-actions" class="document-actions"></div>
          <Button class="topbar-search icon-btn" title="搜索 Ctrl+K" @click.stop="store.navigate('search'); focusSearch()"><Search :size="19" /></Button>
          <template v-if="(store.panel === 'document' || store.panel === 'folder') && active"><div class="topbar-split"></div><Button class="icon-btn star-toggle" :class="{ 'is-starred': active.starred }" :title="active.starred ? '取消收藏' : '收藏文档'" @click.stop="toggleStar()"><Star :size="19" :fill="active.starred ? 'currentColor' : 'none'" /></Button><div class="more-anchor"><Button class="icon-btn" text title="更多操作" @click.stop="moreMenuRef?.toggle($event)"><MoreHorizontal :size="21" /></Button><PrimeMenu ref="moreMenuRef" :model="moreItems" popup class="study-popup-menu" /></div></template>
          
        </div>
      </header>
      <div v-if="store.panel === 'search'" class="search-panel"><Search :size="21" /><InputText ref="searchInput" v-model="store.search" autofocus placeholder="搜索文档标题或正文内容..." /><Button v-if="store.search" class="icon-btn" @click="store.search = ''"><X :size="17" /></Button></div>
      <div class="main-scroll custom-scroll" :class="{ 'document-scroll': store.panel === 'document', 'has-search': store.panel === 'search', 'editor-document-scroll': store.panel === 'document' && active?.kind === 'markdown' && markdownEditing, 'file-document-scroll': store.panel === 'document' && (active?.kind === 'pdf' || active?.kind === 'word') }">
        <SettingsView v-if="store.panel==='settings'" />
        <TransferView v-else-if="store.panel === 'transfers'" />
        <HomeView v-else-if="store.panel === 'home'" />
        <CollectionView v-else-if="store.panel !== 'document'" @create="(kind) => openModal(kind, store.panel === 'folder' ? active?.id : null)" @upload="openUpload(store.panel === 'folder' ? active?.id : null)" />
        <KeepAlive :key="account.user.id" :max="4">
          <DocumentView v-if="store.panel === 'document' && active" :key="active.id" ref="documentRef" :item="active" @outline="outline = $event" @editing="markdownEditing = $event" @download="downloadFile" />
        </KeepAlive>
      </div>
    </main>

    <aside v-if="panels.outlineVisible.value" id="outline-panel" class="outline-sidebar">
      <PanelResizeHandle side="right" :width="panels.widths.value.right" :min="200" :max="panels.rightMax.value" :default-width="250" controls="outline-panel" label="调整右侧目录栏宽度" @resize="panels.resize('right', $event)" @finish="panels.persist" />
      <div class="outline-header"><AlignLeft :size="17" /><span>文章目录</span></div>
      <nav class="outline-list custom-scroll" aria-label="文章目录"><ul class="outline-tree"><OutlineNode v-for="entry in outlineTree" :key="entry.index" :entry="entry" @navigate="documentRef?.scrollToHeading($event)" /></ul></nav>
    </aside>

    <ContextMenu ref="contextMenuRef" :model="contextItems" class="study-popup-menu" />
    <ConfirmDialog class="study-confirm-dialog" />
    <Toast position="bottom-center" />
    <Dialog v-model:visible="dialogVisible" modal :draggable="false" :closable="!creating"
      :close-on-escape="!creating" :header="modalTitle" class="study-dialog" @show="selectModalName"
      :style="{ width: 'min(480px, calc(100vw - 32px))' }">
      <form class="study-dialog-form" @submit.prevent="submitModal">
        <template v-if="modal === 'move'">
          <div class="study-field">
            <label>当前项目</label>
            <div class="study-dialog-item-name" :title="modalItem?.name">{{ modalItem?.name }}</div>
          </div>
          <div class="study-field">
            <label for="move-target">目标位置</label>
            <FolderSelect input-id="move-target" :model-value="moveDestination" :items="store.items" :exclude-id="modalItem?.id" @update:model-value="moveDestination = $event ?? ''" />
          </div>
        </template>
        <template v-else>
          <div class="study-field">
            <label for="new-name">{{ modal === 'folder' ? '文件夹名称' : '名称' }}</label>
            <InputText ref="modalNameInput" id="new-name" v-model="modalName" autofocus maxlength="140" required
              placeholder="输入名称" class="study-dialog-input" />
          </div>
          <div v-if="modal === 'web'" class="study-field">
            <label for="new-url">网页地址</label>
            <InputText id="new-url" v-model="modalUrl" type="url" required
              placeholder="https://example.com" class="study-dialog-input" />
          </div>
          <div v-if="modal !== 'rename'" class="study-field">
            <label for="create-folder-target">保存到</label>
            <FolderSelect input-id="create-folder-target" v-model="modalParent" :items="store.items" />
          </div>
        </template>
        <div class="study-dialog-actions">
          <Button type="button" label="取消" severity="secondary" outlined :disabled="creating" @click="modal = null" />
          <Button type="submit" :loading="creating"
            :disabled="creating || (modal !== 'move' && (!modalName.trim() || (modal === 'web' && !modalUrl.trim())))"
            :label="modal === 'move' ? '确认移动' : modal === 'rename' ? '保存修改' : '确认创建'" />
        </div>
      </form>
    </Dialog>
    <div class="visually-hidden" aria-hidden="true"><FileUpload ref="fileInput" mode="basic" auto custom-upload multiple accept=".md,.markdown,.html,.htm,.pdf,.docx" @uploader="handleFiles" /></div>
    <TransferFloat @open="store.navigate('transfers'); transfers.floatingVisible = false" />

    <div v-if="mobileSidebar" class="mobile-shade" @click="mobileSidebar = false"></div>
  </div>
</template>
