<script setup lang="ts">
import { computed, defineAsyncComponent, h, nextTick, onActivated, onDeactivated, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { MdEditor, MdPreview, type HeadList } from 'md-editor-v3';
import type { Heading } from '../lib/outline';
import 'md-editor-v3/lib/style.css';
import { ExternalLink, FileDown, FileWarning, Globe2, PencilLine, Eye, Check, LoaderCircle } from 'lucide-vue-next';
import type { KnowledgeItem } from '@studydocs/shared';
import { api } from '../lib/api';
import { useKnowledgeStore } from '../stores/knowledge';
import RichTextEditor from './RichTextEditor.vue';
const PdfReader = defineAsyncComponent({
  loader: () => import('./PdfReader.vue'),
  delay: 0,
  loadingComponent: { render: () => h('div', { class: 'preview-loading pdf-module-loading', role: 'status' }, [h(LoaderCircle, { size: 22, class: 'spin' }), '正在初始化 PDF 阅读器…']) },
});
import { useAccountStore } from '../stores/account';
import { previewKey, readPreview, savePreview } from '../lib/preview-cache';
import Button from 'primevue/button';

const props = defineProps<{ item: KnowledgeItem }>();
const emit = defineEmits<{ outline: [items: Heading[]]; editing: [value: boolean]; download: [item: KnowledgeItem] }>();
const store = useKnowledgeStore();
const editing = ref(store.newItemId === props.item.id);
const draft = ref(props.item.content);
const saving = ref(false);
const dirty = ref(false);
const fileError = ref('');
const documentEl = ref<HTMLElement | null>(null);
const wordEl = ref<HTMLElement | null>(null);
const fileUrl = ref('');
const previewReady = ref(false);
const previewLoading = ref(false);
const cacheKey = previewKey(useAccountStore().user!.id, props.item);
const fromCache = ref(false);
const fileSize = ref(0);
let objectUrl = '';
const active = ref(true);
const webLoading = ref(true);
let cancelled = false;
let wordController: AbortController | null = null;
let timer: ReturnType<typeof setTimeout> | null = null;
let saveChain: Promise<unknown> = Promise.resolve();
const editable = computed(() => props.item.kind === 'markdown' || props.item.kind === 'richtext');
const markdownHeadings = ref<Heading[]>([]);
function updateMarkdownCatalog(items: HeadList[]) {
  markdownHeadings.value = items.map((item, index) => ({
    level: Number(item.currentToken?.tag.slice(1)) || item.level,
    title: item.text, index,
  }));
}
const headings = computed<Heading[]>(() => {
  if (props.item.kind === 'markdown') return markdownHeadings.value;
  if (props.item.kind === 'richtext') {
    const html = new DOMParser().parseFromString(draft.value, 'text/html');
    return Array.from(html.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((x, index) => ({ level: Number(x.tagName[1]), title: x.textContent ?? '', index }));
  }
  return [];
});
watch(editing, (value) => { if (active.value) emit('editing', props.item.kind === 'markdown' && value); }, { immediate: true });
watch(headings, (newItems) => { if (active.value) emit('outline', newItems); }, { immediate: true });
watch(draft, () => {
  if (!editable.value || draft.value === props.item.content) return;
  dirty.value = true;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => { void persist(); }, 900);
});
function persist() {
  if (!dirty.value) return saveChain;
  dirty.value = false;
  const content = draft.value;
  const id = props.item.id;
  saving.value = true;
  // 串行保存，避免快速连续编辑造成版本冲突或乱序覆盖。
  saveChain = saveChain.then(async () => {
    const current = store.items.find((x) => x.id === id);
    if (current && current.content !== content) {
      const result = await store.update(id, { content, version: current.version }, true);
      if (!result) dirty.value = true;
    }
  }).finally(() => { saving.value = false; });
  return saveChain;
}
function setEditing(value: boolean) { if (!value) { if (timer) clearTimeout(timer); void persist(); } editing.value = value; }
function scrollToHeading(index: number) {
  const root = documentEl.value;
  const headings = root?.querySelectorAll<HTMLElement>('.article-inner :is(.md-editor-preview,.tiptap-editor) :is(h1,h2,h3,h4,h5,h6)');
  const heading = headings?.[index];
  const boundary = root?.closest<HTMLElement>('.main-scroll');
  if (!heading?.getClientRects().length || !boundary) return;
  // scrollIntoView also scrolls overflow:hidden ancestors, shifting the shell
  // and header. Scroll only the nearest actual content scrollport instead.
  let container = heading.parentElement;
  while (container && container !== boundary) {
    if (/(auto|scroll)/.test(getComputedStyle(container).overflowY) && container.scrollHeight > container.clientHeight) break;
    container = container.parentElement;
  }
  if (!container || !boundary.contains(container) || !/(auto|scroll)/.test(getComputedStyle(container).overflowY)) return;
  const top = container.scrollTop + heading.getBoundingClientRect().top - container.getBoundingClientRect().top - container.clientTop - 16;
  container.scrollTo({ top: Math.max(0, top), behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth' });
}

defineExpose({ scrollToHeading });
async function renderWord() {
  if (props.item.kind !== 'word' || !wordEl.value) return;
  try {
    fileError.value = '';
    wordController = new AbortController();
    const response = await fetch(fileUrl.value,{signal:wordController.signal});
    if (!response.ok) throw new Error('文件读取失败');
    const blob = await response.blob();
    if (!fromCache.value) void savePreview(cacheKey, blob);
    if (cancelled) return;
    await new Promise<void>((resolve) => {
      if ('requestIdleCallback' in window) window.requestIdleCallback(() => resolve(),{timeout:200});
      else setTimeout(resolve,0);
    });
    if (wordEl.value && !cancelled) {
      wordEl.value.innerHTML = '';
      const { renderAsync } = await import('docx-preview');
      if (!cancelled) await renderAsync(blob, wordEl.value, undefined, { breakPages: true, inWrapper: true });
    }
  } catch (err) { if (!cancelled) fileError.value = err instanceof Error ? err.message : '无法预览此 Word 文件'; }
  finally { if (!cancelled) previewLoading.value = false; }
}
onMounted(async () => {
  if (props.item.kind !== 'pdf' && props.item.kind !== 'word') return;
  previewLoading.value = true;
  try {
    const blob = await readPreview(cacheKey);
    if (cancelled) return;
    if (blob) {
      objectUrl = URL.createObjectURL(blob);
      fileUrl.value = objectUrl; fromCache.value = true; fileSize.value = blob.size;
    } else {
      const ticket = await api.downloadTicket(props.item.id);
      if (cancelled) return;
      fileUrl.value = ticket.url ?? api.fileUrl(props.item.id);
      fileSize.value = ticket.size;
    }
    previewReady.value = true;
    if (props.item.kind === 'word') { await nextTick(); await renderWord(); }
  } catch (err) { if (!cancelled) { fileError.value = err instanceof Error ? err.message : '无法获取预览地址'; previewLoading.value = false; } }
});
onActivated(() => { active.value = true; emit('outline', headings.value); emit('editing', props.item.kind === 'markdown' && editing.value); });
onDeactivated(() => { active.value = false; if (timer) clearTimeout(timer); if (dirty.value) void persist(); });
onBeforeUnmount(() => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); wordController?.abort(); if (timer) clearTimeout(timer); if (dirty.value) void persist(); });
</script>
<template>
  <div ref="documentEl" class="document-view" :class="{ 'file-document': item.kind === 'pdf' || item.kind === 'word', 'markdown-editing': item.kind === 'markdown' && editing }">
    <Teleport to="#document-actions" defer>
      <div v-if="active" class="document-actions-content">
        <span v-if="editable" class="save-state"><LoaderCircle v-if="saving || dirty" :size="14" class="spin" /><Check v-else :size="14" />{{ saving || dirty ? '保存中...' : '已自动保存' }}</span>
        <Button v-if="editable" text class="edit-toggle" :title="editing ? '完成编辑' : '编辑文档'" :aria-label="editing ? '完成编辑' : '编辑文档'" @click="setEditing(!editing)"><Eye v-if="editing" :size="17" /><PencilLine v-else :size="17" /><span class="document-action-label">{{ editing ? '完成编辑' : '编辑文档' }}</span></Button>
        <Button v-if="item.kind === 'pdf' || item.kind === 'word'" text title="下载文档" aria-label="下载文档" @click="emit('download', item)"><FileDown :size="18" /></Button>
        <a v-if="item.kind === 'web'" :href="item.url ?? undefined" rel="noopener noreferrer" target="_blank" class="document-open-link" title="新窗口打开" aria-label="新窗口打开"><ExternalLink :size="18" /></a>
      </div>
    </Teleport>

    <div v-if="item.kind === 'markdown' || item.kind === 'richtext'" class="article-inner">
      <div v-if="item.kind !== 'markdown' || !editing" class="article-intro"><h1>{{ item.name }}</h1></div>
      <div v-if="item.kind === 'markdown'" class="markdown-wrapper" :class="{ editing }">
        <MdEditor v-if="editing" @on-get-catalog="updateMarkdownCatalog" v-model="draft" language="zh-CN" theme="light" preview-theme="github" :toolbars-exclude="['github','save','htmlPreview','catalog']" class="md-edit-area" />
        <MdPreview v-else @on-get-catalog="updateMarkdownCatalog" :id="`md-${item.id}`" :model-value="draft" theme="light" preview-theme="github" class="md-read-area" />
      </div>
      <RichTextEditor v-else v-model="draft" :editable="editing" />
    </div>

    <div v-else-if="item.kind === 'pdf'" class="file-preview-area pdf-preview-area">
      <div v-if="fileError" class="file-error" role="alert"><FileWarning :size="18" />{{ fileError }}</div>
      <div v-else-if="!previewReady" class="preview-loading" role="status"><LoaderCircle :size="22" class="spin" />正在准备 PDF…</div>
      <PdfReader v-else :source="fileUrl" :cache-key="cacheKey" :size="fileSize" :cached="fromCache" />
    </div>

    <div v-else-if="item.kind === 'word'" class="file-preview-area">
      <div class="file-preview-top">{{ item.fileName }}</div>
      <div v-if="fileError" class="file-error"><FileWarning :size="18" />{{ fileError }}</div>
      <div v-if="previewLoading && !fileError" class="preview-loading" role="status"><LoaderCircle :size="22" class="spin" />正在加载 Word 预览…</div>
      <div ref="wordEl" class="word-reader"></div>
    </div>

    <div v-else-if="item.kind === 'web'" class="web-preview-area">
      <div class="web-hint"><Globe2 :size="17" />网页预览：{{ item.url }} </div>
      <div v-if="webLoading && item.url" class="preview-loading" role="status"><LoaderCircle :size="22" class="spin" />正在加载网页…</div>
      <iframe v-if="item.url" :src="item.url" :title="item.name" sandbox="allow-scripts allow-forms allow-popups" referrerpolicy="no-referrer" loading="lazy" @load="webLoading = false"></iframe>
    </div>
  </div>
</template>
