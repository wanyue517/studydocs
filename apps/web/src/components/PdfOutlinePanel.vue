<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { PdfOutlineEntry, PdfOutlineState, PdfTextPage } from '@studydocs/shared';
import { api } from '../lib/api';
import PdfTocDialog from './PdfTocDialog.vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import InputNumber from 'primevue/inputnumber';
import Message from 'primevue/message';
const props = defineProps<{ itemId: string; pageText: (page: number) => Promise<string>; pageCount: number; image: (page: number) => Promise<string>; bookmarks: () => Promise<PdfOutlineEntry[]>; extract: (progress: (value: number) => void) => Promise<PdfTextPage[]> }>();
const emit = defineEmits<{ outline: [entries: PdfOutlineEntry[]]; locate: [page: number] }>();
const state = ref<PdfOutlineState>({ entries: [], pageCount: 0, updatedAt: null, job: null });
const loading = ref(true);
const extracting = ref(false);
const extractionProgress = ref(0);
const saving = ref(false);
const error = ref('');
const promptOpen = ref(false);
const tocOpen = ref(false);
const bodyOpen = ref(false);
const bodyStart = ref(1), bodyEnd = ref(props.pageCount), language = ref('chi_sim+eng');
const forceOcr = ref(false);
const bodyStatus = ref('');
const cancelled = ref(false);
const draftStatus = ref('');
let draftVersion: string | null = null;
let draftTimer: ReturnType<typeof setTimeout> | undefined;
let draftQueue: Promise<void> = Promise.resolve();
let draftConflict = false;
const editorOpen = ref(false);
const draft = ref<PdfOutlineEntry[]>([]);
const editorError = ref('');
const availability = ref({ configured: false, name: '', model: '' });
const busy = computed(() => extracting.value || state.value.job?.status === 'running');
let disposed = false;
let timer: ReturnType<typeof setTimeout> | undefined;
function apply(value: PdfOutlineState) { state.value = value; emit('outline', value.entries.length ? value.entries : value.partialEntries ?? []); }
function schedule() {
  if (disposed || state.value.job?.status !== 'running') return;
  timer = setTimeout(() => { void refresh(); }, 2000);
}
async function refresh() {
  if (timer) clearTimeout(timer);
  try {
    const value = await api.pdfOutline(props.itemId);
    if (disposed) return;
    apply(value); error.value = '';
    schedule();
  } catch (e) {
    if (disposed) return;
    error.value = (e as Error).message;
    // Keep observing an already submitted server task after a transient network error.
    if (state.value.job?.status === 'running') timer = setTimeout(() => { void refresh(); }, 5000);
  } finally { loading.value = false; }
}
onMounted(() => { void refresh(); });
onBeforeUnmount(() => { disposed = true; cancelled.value = true; if (timer) clearTimeout(timer); if (draftTimer) { clearTimeout(draftTimer); void persistDraft(); } });
function previewToc(entries: PdfOutlineEntry[]) {
  tocOpen.value = false;
  const existing = state.value.draft?.entries ?? [];
  const seen = new Set(existing.map(e => `${e.page}:${e.title}`));
  draft.value = [...existing, ...entries.filter(e => !seen.has(`${e.page}:${e.title}`))].slice(0,3000);
  draftVersion = state.value.draft?.updatedAt ?? null;
  draftConflict = false;
  editedAt = state.value.draft ? state.value.draft.baseUpdatedAt : state.value.updatedAt; editorError.value = ''; editorOpen.value = true;
  void persistDraft();
}
async function importBookmarks() {
  extracting.value = true; error.value = '';
  try {
    const entries = await props.bookmarks();
    if (!entries.length) throw new Error('此 PDF 没有嵌入书签，请选择目录页识别');
    previewToc(entries);
  } catch (e) { error.value = (e as Error).message; }
  finally { extracting.value = false; }
}
async function prepare() {
  error.value = '';
  try {
    availability.value = await api.aiAvailability();
    if (!availability.value.configured) { error.value = '请联系管理员在设置 → AI 配置中添加模型并设为默认'; return; }
    promptOpen.value = true;
  } catch (e) { error.value = (e as Error).message; }
}
async function generate() {
  promptOpen.value = false; extracting.value = true; extractionProgress.value = 0; error.value = '';
  try {
    const pages = await props.extract(value => {
      if (disposed) throw new Error('已离开文档，文字提取已停止');
      extractionProgress.value = value;
    });
    if (disposed) return;
    const value = await api.generatePdfOutline(props.itemId, pages, props.pageCount);
    if (disposed) return;
    apply(value); schedule();
  } catch (e) { if (!disposed) error.value = (e as Error).message; }
  finally { extracting.value = false; }
}
async function resume() {
  extracting.value = true; error.value = '';
  try { apply(await api.resumePdfOutline(props.itemId)); schedule(); }
  catch (e) { error.value = (e as Error).message; }
  finally { extracting.value = false; }
}
let editedAt: string | null = null;
function edit() {
  draft.value = (state.value.draft?.entries ?? state.value.entries).map(entry => ({ ...entry }));
  draftVersion = state.value.draft?.updatedAt ?? null; draftConflict = false;
  editedAt = state.value.draft ? state.value.draft.baseUpdatedAt : state.value.updatedAt;
  editorError.value = ''; editorOpen.value = true;
}
function persistDraft() {
  const entries = JSON.parse(JSON.stringify(draft.value)) as PdfOutlineEntry[];
  const base = editedAt;
  draftQueue = draftQueue.then(async () => {
    if (draftConflict) return;
    draftStatus.value = '正在保存草稿…';
    try {
      const saved = await api.saveOutlineDraft(props.itemId, entries, base, draftVersion);
      draftVersion = saved.updatedAt; state.value.draft = saved; draftStatus.value = '草稿已保存';
    } catch (e) { draftStatus.value = (e as Error).message; draftConflict = true; }
  });
  return draftQueue;
}
watch(draft, () => {
  if (!editorOpen.value || saving.value) return;
  if (draftTimer) clearTimeout(draftTimer);
  draftTimer = setTimeout(() => { draftTimer = undefined; void persistDraft(); }, 500);
}, { deep: true });
function locate(entry: PdfOutlineEntry) {
  emit('locate', entry.page); editorOpen.value = false;
  if (draftTimer) { clearTimeout(draftTimer); draftTimer = undefined; }
  void persistDraft();
}
async function extractBody() {
  const begin = bodyStart.value, end = bodyEnd.value;
  if (!Number.isInteger(begin) || !Number.isInteger(end) || begin < 1 || end < begin || end > props.pageCount || end > 2000) {
    error.value = '请填写有效的正文页码范围（最多 2000 页）'; return;
  }
  bodyOpen.value = false; extracting.value = true; cancelled.value = false; error.value = '';
  const existing = state.value.draft;
  draft.value = (existing?.entries ?? []).map(e => ({ ...e }));
  editedAt = existing ? existing.baseUpdatedAt : state.value.updatedAt;
  draftVersion = existing?.updatedAt ?? null; draftConflict = false;
  try {
    const seen = new Set(draft.value.map(e => `${e.page}:${e.title}`));
    for (let number = begin; number <= end; number++) {
      if (disposed || cancelled.value) break;
      bodyStatus.value = `正在提取第 ${number} / ${end} 页（不调用 AI）`;
      const text = forceOcr.value ? '' : await props.pageText(number);
      if (disposed || cancelled.value) break;
      const image = text.trim().length < 10 ? await props.image(number) : undefined;
      const result = await api.bodyHeadings(props.itemId, number, text, image, language.value);
      if (disposed) break;
      for (const entry of result.entries) {
        const key = `${entry.page}:${entry.title}`;
        if (!seen.has(key) && draft.value.length < 3000) { seen.add(key); draft.value.push(entry); }
      }
      await persistDraft();
      if (draftConflict) throw new Error(draftStatus.value);
      extractionProgress.value = Math.round((number - begin + 1) / (end - begin + 1) * 100);
    }
  } catch (e) { error.value = `${(e as Error).message}。已完成的 OCR 和识别草稿已保留，可调整起始页继续。`; }
  finally {
    extracting.value = false; bodyStatus.value = '';
    if (!disposed) { editorError.value = ''; editorOpen.value = true; }
  }
}
async function save() {
  editorError.value = '';
  const count = props.pageCount || state.value.pageCount;
  if (draft.value.some(entry => !entry.title.trim() || entry.title.length > 200 || !Number.isInteger(entry.page) || entry.page < 1 || entry.page > count || !Number.isInteger(entry.level) || entry.level < 1 || entry.level > 6)) {
    editorError.value = `请填写有效标题、1～6 级层级及 1～${count} 的物理页码`; return;
  }
  saving.value = true;
  try {
    if (draftTimer) { clearTimeout(draftTimer); draftTimer = undefined; }
    await persistDraft();
    if (draftConflict) throw new Error(draftStatus.value);
    apply(await api.savePdfOutline(props.itemId, draft.value, count, editedAt, draftVersion));
    editorOpen.value = false; draftVersion = null;
  }
  catch (e) { editorError.value = (e as Error).message; }
  finally { saving.value = false; }
}
</script>
<template>
  <div class="pdf-outline-actions">
    <p v-if="loading" role="status">正在读取目录…</p>
    <template v-else>
      <div class="pdf-outline-buttons">
        <Button size="small" label="从正文提取（无需 AI）" :disabled="busy || !pageCount" @click="bodyEnd = pageCount; bodyOpen = true" />
        <Button size="small" text label="导入原生书签" :disabled="busy || !pageCount" @click="importBookmarks" />
        <Button size="small" text label="从目录页生成" :disabled="busy || !pageCount" @click="tocOpen = true" />
        <Button size="small" text label="AI 生成（可选）" :disabled="busy || !pageCount" @click="prepare" />
        <Button v-if="state.job?.status === 'failed'" size="small" label="继续生成" :disabled="busy" @click="resume" />
        <Button size="small" text :label="state.draft ? '继续编辑草稿' : '编辑目录'" :disabled="busy || !pageCount" @click="edit" />
      </div>
      <p v-if="extracting" role="status">{{ bodyStatus || '正在准备文档' }} {{ extractionProgress }}% <Button text size="small" label="停止" @click="cancelled = true" /></p>
      <p v-else-if="state.job?.status === 'running'" role="status">AI 正在生成目录 {{ state.job.progress }}%（{{ state.job.model }}）</p>
      <p v-if="state.partialEntries?.length && state.job?.status !== 'completed'">已缓存 {{ state.partialEntries.length }} 个目录项。{{ state.entries.length ? '当前保留原目录，全部完成后替换。' : '已完成部分可点击阅读。' }}</p>
      <p v-if="!state.entries.length && !busy">点击生成层级目录，或手动添加标题与跳转页码。保存后再次打开仍可使用。</p>
      <p v-if="error" class="field-error" role="alert">{{ error }} <Button text size="small" label="重新读取" @click="refresh" /></p>
      <p v-else-if="state.job?.status === 'failed'" class="field-error" role="alert">{{ state.job.error }}。已完成 {{ state.job.progress }}%，已缓存的批次不会重复请求；继续时失败批次可能再次计费。</p>
    </template>
    <Dialog v-model:visible="bodyOpen" modal header="从正文提取编号标题" :style="{ width: 'min(520px, calc(100vw - 24px))' }">
      <div class="pdf-outline-editor">
        <p>识别 1、1.1、1.1.1、第一章等标题；直接使用 PDF 实际页码。识别结果先保存为草稿，确认后才替换正式目录。</p>
        <label>起始页 <InputNumber v-model="bodyStart" :min="1" :max="pageCount" :use-grouping="false" /></label>
        <label>结束页 <InputNumber v-model="bodyEnd" :min="1" :max="pageCount" :use-grouping="false" /></label>
        <label>扫描件语言 <select v-model="language"><option value="chi_sim+eng">简体中文 + 英文</option><option value="eng">英文</option></select></label>
        <label><input v-model="forceOcr" type="checkbox" />强制本地 OCR（文字层乱码时使用）</label>
        <p>有文字层直接提取；无文字层使用本地 Tesseract，需要服务器安装对应语言包。不调用 AI。每页处理后保存草稿，空白页或无标题页自动跳过；重复识别合并草稿，不覆盖修改。</p>
      </div>
      <template #footer><Button label="开始提取" @click="extractBody" /></template>
    </Dialog>
    <PdfTocDialog v-if="tocOpen" :item-id="itemId" :page-count="pageCount" :image="image" @close="tocOpen = false" @preview="previewToc" />
    <Dialog v-model:visible="promptOpen" modal :draggable="false" header="生成 PDF 目录" class="study-dialog" :style="{ width: 'min(480px, calc(100vw - 32px))' }">
      <p>将提取 PDF 每页的部分文字，发送给“{{ availability.name }} / {{ availability.model }}”生成目录，可能产生模型调用费用。扫描件请先进行 OCR，或手动编辑目录。</p>
      <p>每批完成立即保存，失败后可继续生成；相同内容和模型会复用缓存。为避免重复计费，失败后暂停，需点击继续。</p>
      <p v-if="state.entries.length">生成成功后替换现有目录；生成失败将保留现有目录。</p>
      <template #footer><Button label="取消" severity="secondary" outlined @click="promptOpen = false" /><Button label="开始生成" @click="generate" /></template>
    </Dialog>
    <Dialog v-model:visible="editorOpen" modal :draggable="false" :closable="!saving" :close-on-escape="!saving" header="编辑 PDF 目录" class="study-dialog" :style="{ width: 'min(760px, calc(100vw - 24px))' }">
      <div class="pdf-outline-editor">
        <p>按阅读顺序填写标题。页码使用 PDF 实际页序，从 1 开始；层级支持 1～6 级。</p>
        <p role="status">{{ draftStatus }}（关闭弹窗保留草稿）</p>
        <Message v-if="editorError" severity="error">{{ editorError }}</Message>
        <div class="pdf-outline-editor-row pdf-outline-editor-labels"><span>标题</span><span>层级</span><span>页码</span><span></span></div>
        <div v-for="(entry, index) in draft" :key="index" class="pdf-outline-editor-row">
          <InputText v-model="entry.title" :aria-label="`第 ${index + 1} 项标题`" maxlength="200" />
          <InputNumber v-model="entry.level" :aria-label="`第 ${index + 1} 项层级`" :min="1" :max="6" :use-grouping="false" />
          <InputNumber v-model="entry.page" :aria-label="`第 ${index + 1} 项页码`" :min="1" :max="pageCount" :use-grouping="false" />
          <span><Button text label="定位" :disabled="!entry.page" @click="locate(entry)" /><Button text severity="danger" label="删" :aria-label="`删除第 ${index + 1} 项`" @click="draft.splice(index, 1)" /></span>
        </div>
        <Button label="添加目录项" outlined :disabled="draft.length >= 3000" @click="draft.push({ title: '', level: 1, page: 1 })" />
      </div>
      <template #footer><Button label="关闭并保留草稿" severity="secondary" outlined :disabled="saving" @click="editorOpen = false; persistDraft()" /><Button label="保存目录" :loading="saving" :disabled="saving" @click="save" /></template>
    </Dialog>
  </div>
</template>
