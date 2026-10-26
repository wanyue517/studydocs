<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue';
import VuePdfEmbed, { GlobalWorkerOptions, usePdfDocument } from 'vue-pdf-embed/dist/index.essential.mjs';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc = pdfWorker;
import 'vue-pdf-embed/dist/styles/annotationLayer.css';
import 'vue-pdf-embed/dist/styles/textLayer.css';
import Button from 'primevue/button';
import type { PdfTextPage } from '@studydocs/shared';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import PdfThumbnails from './PdfThumbnails.vue';
import { ChevronLeft, ChevronRight, ExternalLink, LoaderCircle, Minus, Plus, PanelLeft } from 'lucide-vue-next';
import { MAX_PREVIEW_BYTES, savePreview } from '../lib/preview-cache';
import { yieldToBrowser } from '../lib/transfer-work';
import { pageAtOffset, pageOffsets } from '../lib/pdf-layout';

const props = defineProps<{ source: string; cacheKey: string; size: number; cached: boolean }>();
const emit = defineEmits<{ ready: [pageCount: number] }>();
const positionKey = `studydocs-reader:${props.cacheKey}`;
let position = { page: 1, zoom: 1, top: 0, offset: 0, left: 0, mode: 'reading', thumbnails: true };
try { position = { ...position, ...JSON.parse(sessionStorage.getItem(positionKey) ?? '{}') }; } catch { /* Optional session state. */ }
const viewport = ref<HTMLElement | null>(null);
const page = ref(Math.max(1, Math.trunc(Number(position.page)) || 1));
const pages = ref(0);
const document = shallowRef<PDFDocumentProxy>();
const mode = ref(position.mode === 'width' ? 'width' : 'reading');
const thumbnails = ref(position.thumbnails && !window.matchMedia('(max-width: 770px)').matches);
const zoom = ref(Math.max(0.5, Math.min(2, Number(position.zoom) || 1)));
const width = ref(0);
const height = ref(600);
const scrollTop = ref(0);
const ratios = ref<number[]>([]);
const offsets = computed(() => pageOffsets(ratios.value, pageWidth.value));
const visiblePages = computed(() => {
  if (!pages.value) return [];
  const start = Math.max(0, pageAtOffset(offsets.value, scrollTop.value) - 1);
  const end = Math.min(pages.value - 1, pageAtOffset(offsets.value, scrollTop.value + height.value) + 1);
  return Array.from({ length: end - start + 1 }, (_, index) => start + index + 1);
});
const loading = ref(true);
const error = ref('');
const progress = ref(0);
let observer: ResizeObserver | undefined;
let stopped = false;
let positionTimer: ReturnType<typeof setTimeout> | undefined;
function savePosition() {
  if (positionTimer) clearTimeout(positionTimer);
  position = { mode: mode.value, thumbnails: thumbnails.value, page: page.value, zoom: zoom.value, top: viewport.value?.scrollTop ?? 0, offset: (viewport.value?.scrollTop ?? 0) - (offsets.value[page.value - 1] ?? 0), left: viewport.value?.scrollLeft ?? 0 };
  try { sessionStorage.setItem(positionKey, JSON.stringify(position)); } catch { /* Reading also works without storage. */ }
}
function scrolled() {
  scrollTop.value = viewport.value?.scrollTop ?? 0;
  if (document.value) page.value = pageAtOffset(offsets.value, scrollTop.value + 16) + 1;
  if (positionTimer) clearTimeout(positionTimer); positionTimer = setTimeout(savePosition, 200);
}
function rendered(number: number) {
  if (number !== page.value) return;
  loading.value = false;
}
watch(thumbnails, savePosition);
const source = computed(() => ({
  url: props.source,
  cMapUrl: `${import.meta.env.BASE_URL}pdf-assets/cmaps/`, cMapPacked: true,
  standardFontDataUrl: `${import.meta.env.BASE_URL}pdf-assets/standard_fonts/`,
  wasmUrl: `${import.meta.env.BASE_URL}pdf-assets/wasm/`,
}));
const { doc: loadedDocument } = usePdfDocument({
  source,
  onError: failed,
  onProgress: (event) => { progress.value = event.total ? Math.min(100, Math.round(event.loaded / event.total * 100)) : 0; },
  onPasswordRequest: () => { loading.value = false; error.value = '此文件需要密码，请使用浏览器打开'; },
});
watch(loadedDocument, (doc) => { if (doc) void loaded(doc).catch(failed); });
const pageWidth = computed(() => Math.max(100, Math.min(width.value - 32, mode.value === 'reading' ? 900 : Infinity) * zoom.value));
watch(pageWidth, async (_, previous) => {
  if (!previous || !document.value) return;
  const anchor = page.value;
  await nextTick();
  viewport.value?.scrollTo({ top: offsets.value[anchor - 1] ?? 0 });
  scrolled();
});
// Only visible pages and one neighbouring page are rendered at full resolution.
function selectPage(value: number) {
  const next = Math.max(1, Math.min(pages.value || 1, Math.trunc(value) || 1));
  page.value = next;
  viewport.value?.scrollTo({ top: offsets.value[next - 1] ?? 0 });
  scrolled();
}
function setZoom(value: number) { zoom.value = Math.max(0.5, Math.min(2, value)); }
function failed(reason: Error) { loading.value = false; error.value = `PDF 预览失败：${reason.message || '无法读取文件'}`; }
async function loaded(doc: PDFDocumentProxy) {
  pages.value = doc.numPages;
  ratios.value = Array(doc.numPages).fill(Math.SQRT2);
  page.value = Math.min(page.value, doc.numPages);
  const first = await doc.getPage(page.value);
  if (stopped) return;
  const initial = first.getViewport({ scale: 1 });
  ratios.value[page.value - 1] = initial.height / initial.width;
  document.value = doc;
  emit('ready', doc.numPages);
  await nextTick();
  viewport.value?.scrollTo({ top: (offsets.value[page.value - 1] ?? 0) + (Number(position.offset) || 0), left: position.left });
  scrollTop.value = viewport.value?.scrollTop ?? 0;
  void measurePages(doc);
  if (props.cached || props.size > MAX_PREVIEW_BYTES) return;
  // Keep the first-page path progressive. Persist the full file in the background.
  try {
    await yieldToBrowser();
    if (stopped) return;
    const data = await doc.getData();
    if (!stopped) await savePreview(props.cacheKey, new Blob([data as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }));
  } catch { /* Eviction or cache failures do not interrupt reading. */ }
}
async function measurePages(doc: PDFDocumentProxy) {
  for (let number = 1; number <= doc.numPages && !stopped; number++) {
    try {
      const pdfPage = await doc.getPage(number);
      if (stopped) return;
      const size = pdfPage.getViewport({ scale: 1 });
      const index = pageAtOffset(offsets.value, viewport.value?.scrollTop ?? 0);
      const within = (viewport.value?.scrollTop ?? 0) - offsets.value[index];
      ratios.value[number - 1] = size.height / size.width;
      await nextTick();
      if (viewport.value) viewport.value.scrollTop = offsets.value[index] + within;
      scrollTop.value = viewport.value?.scrollTop ?? 0;
      if (number % 8 === 0) await yieldToBrowser();
    } catch (reason) { if (!stopped) failed(reason as Error); return; }
  }
}
function resized() {
  const value = Math.floor(viewport.value?.clientWidth ?? 0);
  if (value > 0) width.value = value;
  height.value = viewport.value?.clientHeight || 600;
}
onMounted(() => {
  resized();
  observer = new ResizeObserver(resized);
  if (viewport.value) observer.observe(viewport.value);
});
onActivated(async () => {
  await nextTick(); resized();
  viewport.value?.scrollTo({ top: position.top, left: position.left });
});
async function extractText(onProgress: (value: number) => void): Promise<PdfTextPage[]> {
  const doc = document.value;
  if (!doc) throw new Error('PDF 尚未加载完成');
  if (doc.numPages > 2000) throw new Error('暂支持最多 2000 页，请拆分文件后生成目录');
  const limit = Math.min(1600, Math.floor(900000 / doc.numPages));
  const result: PdfTextPage[] = [];
  for (let number = 1; number <= doc.numPages; number++) {
    if (stopped) throw new Error('已关闭 PDF，文字提取已停止');
    const pdfPage = await doc.getPage(number);
    const content = await pdfPage.getTextContent();
    const text = content.items.map(item => 'str' in item ? item.str + (item.hasEOL ? '\n' : ' ') : '').join('').trim();
    const tail = Math.floor(limit / 5);
    result.push({ page: number, text: text.length > limit ? text.slice(0, limit - tail - 1) + '\n' + text.slice(-tail) : text });
    onProgress(Math.round(number / doc.numPages * 100));
    await yieldToBrowser();
  }
  return result;
}
async function pageImage(number: number) {
  const doc = document.value;
  if (!doc) throw new Error('PDF 尚未加载');
  const pdfPage = await doc.getPage(number);
  const original = pdfPage.getViewport({ scale: 1 });
  const view = pdfPage.getViewport({ scale: Math.min(2, 1800 / Math.max(original.width, original.height)) });
  const canvas = window.document.createElement('canvas');
  canvas.width = Math.ceil(view.width); canvas.height = Math.ceil(view.height);
  try {
    await pdfPage.render({ canvas, viewport: view }).promise;
    return canvas.toDataURL('image/jpeg', 0.85);
  } finally { canvas.width = canvas.height = 0; }
}
async function bookmarks(): Promise<import('@studydocs/shared').PdfOutlineEntry[]> {
  const doc = document.value;
  if (!doc) throw new Error('PDF 尚未加载');
  const result: import('@studydocs/shared').PdfOutlineEntry[] = [];
  const walk = async (nodes: NonNullable<Awaited<ReturnType<typeof doc.getOutline>>>, level: number) => {
    for (const node of nodes) {
      const dest = typeof node.dest === 'string' ? await doc.getDestination(node.dest) : node.dest;
      if (dest?.length) {
        const page = typeof dest[0] === 'number' ? dest[0] + 1 : await doc.getPageIndex(dest[0]) + 1;
        result.push({ title: node.title.slice(0, 200), level: Math.min(6, level), page });
      }
      await walk(node.items, level + 1);
    }
  };
  await walk(await doc.getOutline() ?? [], 1);
  return result;
}
defineExpose({ selectPage, extractText, pageImage, bookmarks });
onDeactivated(savePosition);
onBeforeUnmount(() => { stopped = true; savePosition(); observer?.disconnect(); });
</script>
<template>
  <section class="pdf-reader" aria-label="PDF 阅读器">
    <div class="pdf-controls">
      <Button severity="secondary" text aria-label="分页缩略图" :aria-expanded="thumbnails" @click="thumbnails = !thumbnails"><PanelLeft :size="19" /></Button>
      <Button severity="secondary" text aria-label="上一页" :disabled="page <= 1 || !pages" @click="selectPage(page - 1)"><ChevronLeft :size="19" /></Button>
      <label class="pdf-page-label">第 <input aria-label="PDF 页码" type="number" :value="page" min="1" :max="pages || 1" :disabled="!pages" @change="selectPage(Number(($event.target as HTMLInputElement).value)); ($event.target as HTMLInputElement).value = String(page)" /> / {{ pages || '…' }} 页</label>
      <Button severity="secondary" text aria-label="下一页" :disabled="page >= pages || !pages" @click="selectPage(page + 1)"><ChevronRight :size="19" /></Button>
      <span class="pdf-control-spacer"></span>
      <Button severity="secondary" text aria-label="缩小" :disabled="zoom <= 0.5" @click="setZoom(zoom - 0.1)"><Minus :size="18" /></Button>
      <Button severity="secondary" text :label="`${Math.round(zoom * 100)}%`" aria-label="重置缩放" @click="setZoom(1)" />
      <Button severity="secondary" text aria-label="放大" :disabled="zoom >= 2" @click="setZoom(zoom + 0.1)"><Plus :size="18" /></Button>
      <select v-model="mode" class="pdf-size-mode" aria-label="PDF 页面尺寸" @change="setZoom(1)"><option value="reading">适合阅读</option><option value="width">适应宽度</option></select>
      <a :href="props.source" target="_blank" rel="noopener noreferrer" class="pdf-native-link" title="使用浏览器打开"><ExternalLink :size="18" /><span>浏览器打开</span></a>
    </div>
    <div class="pdf-reader-body">
      <PdfThumbnails v-if="thumbnails && document && !error" :document="document" :page="page" @select="selectPage" />
      <div class="pdf-main-pane">
        <div ref="viewport" class="pdf-viewport custom-scroll" :aria-busy="loading" @scroll.passive="scrolled">

          <div v-if="document && !error" class="pdf-continuous-pages" :style="{ height: `${offsets[pages]}px`, minWidth: `${pageWidth}px` }">
            <div v-for="number in visiblePages" :key="number" class="pdf-page-slot" :style="{ top: `${offsets[number - 1]}px`, height: `${offsets[number] - offsets[number - 1] - 16}px` }">
              <VuePdfEmbed :source="document" :page="number" :width="pageWidth" text-layer annotation-layer class="pdf-page" @rendered="rendered(number)" @rendering-failed="failed" @internal-link-clicked="selectPage" />
            </div>
          </div>
        </div>
        <div v-if="error" class="pdf-status-overlay file-error" role="alert"><span>{{ error }}，可点击“浏览器打开”或下载查看。</span></div>
        <div v-else-if="loading" class="pdf-status-overlay pdf-page-loading preview-loading" role="status"><LoaderCircle :size="22" class="spin" /><span>{{ pages ? '正在渲染页面…' : `正在加载 PDF${progress ? `（${progress}%）` : ''}…` }}</span></div>
      </div>
    </div>
  </section>
</template>
