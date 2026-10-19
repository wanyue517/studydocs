<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { MdEditor, MdPreview } from 'md-editor-v3';
import 'md-editor-v3/lib/style.css';
import VuePdfEmbed from 'vue-pdf-embed';
import 'vue-pdf-embed/dist/styles/annotationLayer.css';
import 'vue-pdf-embed/dist/styles/textLayer.css';
import { renderAsync } from 'docx-preview';
import { ExternalLink, FileDown, FileWarning, Globe2, PencilLine, Eye, Check, LoaderCircle } from 'lucide-vue-next';
import type { KnowledgeItem } from '@studydocs/shared';
import { api } from '../lib/api';
import { fmtDate, kindLabel } from '../lib/utils';
import { useKnowledgeStore } from '../stores/knowledge';
import RichTextEditor from './RichTextEditor.vue';

interface Heading { level: number; title: string; index: number }
const props = defineProps<{ item: KnowledgeItem }>();
const emit = defineEmits<{ outline: [items: Heading[]] }>();
const store = useKnowledgeStore();
const editing = ref(store.newItemId === props.item.id);
const draft = ref(props.item.content);
const saving = ref(false);
const dirty = ref(false);
const fileError = ref('');
const wordEl = ref<HTMLElement | null>(null);
const fileUrl = computed(() => api.fileUrl(props.item.id));
let timer: ReturnType<typeof setTimeout> | null = null;
let saveChain: Promise<unknown> = Promise.resolve();
const editable = computed(() => props.item.kind === 'markdown' || props.item.kind === 'richtext');
const headings = computed<Heading[]>(() => {
  if (props.item.kind === 'markdown') {
    return draft.value.split('\n').flatMap((line) => { const m = /^(#{1,4})\s+(.+)\s*$/.exec(line); return m ? [{ level: m[1].length, title: m[2].replace(/[*_`]/g, ''), index: 0 }] : []; }).map((x, index) => ({ ...x, index }));
  }
  if (props.item.kind === 'richtext') {
    const html = new DOMParser().parseFromString(draft.value, 'text/html');
    return Array.from(html.querySelectorAll('h1,h2,h3,h4')).map((x, index) => ({ level: Number(x.tagName[1]), title: x.textContent ?? '', index }));
  }
  return [];
});
watch(headings, (newItems) => emit('outline', newItems), { immediate: true });
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
  const root = document.querySelector('.document-view .article-inner');
  const els = root?.querySelectorAll('.md-editor-preview h1,.md-editor-preview h2,.md-editor-preview h3,.md-editor-preview h4,.tiptap-editor h1,.tiptap-editor h2,.tiptap-editor h3,.tiptap-editor h4');
  els?.[index]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}
defineExpose({ scrollToHeading });
async function renderWord() {
  if (props.item.kind !== 'word' || !wordEl.value) return;
  try {
    fileError.value = '';
    const response = await fetch(fileUrl.value);
    if (!response.ok) throw new Error('文件读取失败');
    const blob = await response.blob();
    if (wordEl.value) {
      wordEl.value.innerHTML = '';
      await renderAsync(blob, wordEl.value, undefined, { breakPages: true, inWrapper: true });
    }
  } catch (err) { fileError.value = err instanceof Error ? err.message : '无法预览此 Word 文件'; }
}
onMounted(() => { void nextTick(renderWord); });
onBeforeUnmount(() => { if (timer) clearTimeout(timer); if (dirty.value) void persist(); emit('outline', []); });
</script>
<template>
  <div class="document-view">
    <div class="document-toolbar">
      <span class="document-tag"><span class="tiny-dot"></span>{{ kindLabel[item.kind] }}</span>
      <span class="document-date">更新于 {{ fmtDate(item.updatedAt) }}</span>
      <span class="toolbar-spacer"></span>
      <span v-if="editable" class="save-state"><LoaderCircle v-if="saving || dirty" :size="14" class="spin" /><Check v-else :size="14" />{{ saving || dirty ? '保存中...' : '已自动保存' }}</span>
      <button v-if="editable" class="edit-toggle" @click="setEditing(!editing)"><Eye v-if="editing" :size="15" /><PencilLine v-else :size="15" />{{ editing ? '完成编辑' : '编辑文档' }}</button>
      <a v-if="item.kind === 'pdf' || item.kind === 'word'" class="secondary-btn" :href="api.fileUrl(item.id, true)" :download="item.fileName ?? item.name"><FileDown :size="15" />下载</a>
      <a v-if="item.kind === 'web'" :href="item.url ?? undefined" rel="noopener noreferrer" target="_blank" class="secondary-btn"><ExternalLink :size="15" />新窗口打开</a>
    </div>

    <div v-if="item.kind === 'markdown' || item.kind === 'richtext'" class="article-inner">
      <div class="article-intro"><h1>{{ item.name }}</h1></div>
      <div v-if="item.kind === 'markdown'" class="markdown-wrapper" :class="{ editing }">
        <MdEditor v-if="editing" v-model="draft" language="zh-CN" theme="light" preview-theme="github" :toolbars-exclude="['github','save','htmlPreview','catalog']" class="md-edit-area" />
        <MdPreview v-else :id="`md-${item.id}`" :model-value="draft" theme="light" preview-theme="github" class="md-read-area" />
      </div>
      <RichTextEditor v-else v-model="draft" :editable="editing" />
    </div>

    <div v-else-if="item.kind === 'pdf'" class="file-preview-area">
      <div class="file-preview-top">{{ item.fileName }}</div>
      <div class="pdf-reader"><VuePdfEmbed :source="fileUrl" /></div>
    </div>

    <div v-else-if="item.kind === 'word'" class="file-preview-area">
      <div class="file-preview-top">{{ item.fileName }}</div>
      <div v-if="fileError" class="file-error"><FileWarning :size="18" />{{ fileError }}</div>
      <div ref="wordEl" class="word-reader"></div>
    </div>

    <div v-else-if="item.kind === 'web'" class="web-preview-area">
      <div class="web-hint"><Globe2 :size="17" />网页预览：{{ item.url }} </div>
      <iframe v-if="item.url" :src="item.url" :title="item.name" sandbox="allow-scripts allow-forms allow-popups" referrerpolicy="no-referrer" loading="lazy"></iframe>
    </div>
  </div>
</template>
