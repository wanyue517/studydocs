<script setup lang="ts">
import { computed, nextTick, onActivated, onDeactivated, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import VuePdfEmbed, { GlobalWorkerOptions } from 'vue-pdf-embed/dist/index.essential.mjs';
import pdfWorker from 'pdfjs-dist/legacy/build/pdf.worker.min.mjs?url';
GlobalWorkerOptions.workerSrc = pdfWorker;
import 'vue-pdf-embed/dist/styles/annotationLayer.css';
import 'vue-pdf-embed/dist/styles/textLayer.css';
import Button from 'primevue/button';
import { ChevronLeft, ChevronRight, ExternalLink, LoaderCircle, Minus, Plus } from 'lucide-vue-next';
import { MAX_PREVIEW_BYTES, savePreview } from '../lib/preview-cache';
import { yieldToBrowser } from '../lib/transfer-work';

const props = defineProps<{ source: string; cacheKey: string; size: number; cached: boolean }>();
const positionKey = `studydocs-reader:${props.cacheKey}`;
let position = { page: 1, zoom: 1, top: 0, left: 0 };
try { position = { ...position, ...JSON.parse(sessionStorage.getItem(positionKey) ?? '{}') }; } catch { /* Optional session state. */ }
const viewport = ref<HTMLElement | null>(null);
const page = ref(Math.max(1, Math.trunc(Number(position.page)) || 1));
const pages = ref(0);
const zoom = ref(Math.max(0.5, Math.min(2, Number(position.zoom) || 1)));
const width = ref(0);
const loading = ref(true);
const error = ref('');
const progress = ref(0);
let observer: ResizeObserver | undefined;
let stopped = false;
let restorePosition = true;
let positionTimer: ReturnType<typeof setTimeout> | undefined;
function savePosition() {
  if (positionTimer) clearTimeout(positionTimer);
  position = { page: page.value, zoom: zoom.value, top: viewport.value?.scrollTop ?? 0, left: viewport.value?.scrollLeft ?? 0 };
  try { sessionStorage.setItem(positionKey, JSON.stringify(position)); } catch { /* Reading also works without storage. */ }
}
function scrolled() { if (positionTimer) clearTimeout(positionTimer); positionTimer = setTimeout(savePosition, 200); }
function rendered() {
  loading.value = false;
  if (restorePosition) { viewport.value?.scrollTo({ top: position.top, left: position.left }); restorePosition = false; }
}
watch([page, zoom], savePosition);
const source = computed(() => ({
  url: props.source,
  cMapUrl: `${import.meta.env.BASE_URL}pdf-assets/cmaps/`, cMapPacked: true,
  standardFontDataUrl: `${import.meta.env.BASE_URL}pdf-assets/standard_fonts/`,
  wasmUrl: `${import.meta.env.BASE_URL}pdf-assets/wasm/`,
}));
const pageWidth = computed(() => Math.max(100, (width.value - 32) * zoom.value));
watch(pageWidth, () => { if (!error.value) loading.value = true; });
// Only the selected page is rendered, keeping canvas memory bounded for large PDFs.
function selectPage(value: number) {
  const next = Math.max(1, Math.min(pages.value || 1, Math.trunc(value) || 1));
  if (next === page.value) return;
  page.value = next;
  loading.value = true;
  viewport.value?.scrollTo({ top: 0, left: 0 });
}
function setZoom(value: number) { zoom.value = Math.max(0.5, Math.min(2, value)); }
function failed(reason: Error) { loading.value = false; error.value = `PDF 预览失败：${reason.message || '无法读取文件'}`; }
async function loaded(doc: { numPages: number; getData: () => Promise<Uint8Array> }) {
  pages.value = doc.numPages;
  page.value = Math.min(page.value, doc.numPages);
  if (props.cached || props.size > MAX_PREVIEW_BYTES) return;
  // Keep the first-page path progressive. Persist the full file in the background.
  try {
    await yieldToBrowser();
    if (stopped) return;
    const data = await doc.getData();
    if (!stopped) await savePreview(props.cacheKey, new Blob([data as Uint8Array<ArrayBuffer>], { type: 'application/pdf' }));
  } catch { /* Eviction or cache failures do not interrupt reading. */ }
}
function resized() {
  const value = Math.floor(viewport.value?.clientWidth ?? 0);
  if (value > 0) width.value = value;
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
onDeactivated(savePosition);
onBeforeUnmount(() => { stopped = true; savePosition(); observer?.disconnect(); });
</script>
<template>
  <section class="pdf-reader" aria-label="PDF 阅读器">
    <div class="pdf-controls">
      <Button severity="secondary" text aria-label="上一页" :disabled="page <= 1 || !pages" @click="selectPage(page - 1)"><ChevronLeft :size="19" /></Button>
      <label class="pdf-page-label">第 <input aria-label="PDF 页码" type="number" :value="page" min="1" :max="pages || 1" :disabled="!pages" @change="selectPage(Number(($event.target as HTMLInputElement).value)); ($event.target as HTMLInputElement).value = String(page)" /> / {{ pages || '…' }} 页</label>
      <Button severity="secondary" text aria-label="下一页" :disabled="page >= pages || !pages" @click="selectPage(page + 1)"><ChevronRight :size="19" /></Button>
      <span class="pdf-control-spacer"></span>
      <Button severity="secondary" text aria-label="缩小" :disabled="zoom <= 0.5" @click="setZoom(zoom - 0.1)"><Minus :size="18" /></Button>
      <Button severity="secondary" text :label="zoom === 1 ? '适应宽度' : `${Math.round(zoom * 100)}%`" @click="setZoom(1)" />
      <Button severity="secondary" text aria-label="放大" :disabled="zoom >= 2" @click="setZoom(zoom + 0.1)"><Plus :size="18" /></Button>
      <a :href="props.source" target="_blank" rel="noopener noreferrer" class="pdf-native-link" title="使用浏览器打开"><ExternalLink :size="18" /><span>浏览器打开</span></a>
    </div>
    <div class="pdf-reader-body">
      <div ref="viewport" class="pdf-viewport custom-scroll" :aria-busy="loading" @scroll.passive="scrolled">
        <VuePdfEmbed v-if="width && !error" :source="source" :page="page" :width="pageWidth" text-layer annotation-layer class="pdf-page" @loaded="loaded" @progress="progress = $event.total ? Math.min(100, Math.round($event.loaded / $event.total * 100)) : 0" @rendered="rendered" @loading-failed="failed" @rendering-failed="failed" @password-requested="loading = false; error = '此文件需要密码，请使用浏览器打开'" @internal-link-clicked="selectPage" />
      </div>
      <div v-if="error" class="pdf-status-overlay file-error" role="alert"><span>{{ error }}，可点击“浏览器打开”或下载查看。</span></div>
      <div v-else-if="loading" class="pdf-status-overlay pdf-page-loading preview-loading" role="status"><LoaderCircle :size="22" class="spin" /><span>{{ pages ? '正在渲染页面…' : `正在加载 PDF${progress ? `（${progress}%）` : ''}…` }}</span></div>
    </div>
  </section>
</template>
