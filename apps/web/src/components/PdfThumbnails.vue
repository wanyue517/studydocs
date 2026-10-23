<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import VuePdfEmbed from 'vue-pdf-embed/dist/index.essential.mjs';
const props = defineProps<{ document: PDFDocumentProxy; page: number }>();
const emit = defineEmits<{ select: [page: number] }>();
const rail = ref<HTMLElement | null>(null);
const top = ref(0);
const height = ref(600);
const widths = ref<Record<number, number>>({});
const rowHeight = 184;
const start = computed(() => Math.max(0, Math.floor(top.value / rowHeight) - 2));
const visible = computed(() => Array.from({ length: Math.max(0, Math.min(props.document.numPages - start.value, Math.ceil(height.value / rowHeight) + 4)) }, (_, i) => start.value + i + 1));
let observer: ResizeObserver | undefined;
let disposed = false;
watch(visible, async (numbers) => {
  // Fit both landscape and portrait pages inside the same thumbnail slot.
  for (const number of numbers) {
    if (widths.value[number]) continue;
    try {
      const page = await props.document.getPage(number);
      const size = page.getViewport({ scale: 1 });
      if (disposed) return;
      widths.value[number] = Math.min(112, 144 * size.width / size.height);
    } catch { /* Keep the page number usable if its thumbnail cannot be rendered. */ }
  }
}, { immediate: true });
function reveal() {
  const el = rail.value;
  if (!el) return;
  const y = (props.page - 1) * rowHeight;
  if (y < el.scrollTop || y + rowHeight > el.scrollTop + el.clientHeight) {
    el.scrollTop = Math.max(0, y - (el.clientHeight - rowHeight) / 2);
  }
  top.value = el.scrollTop;
}
watch(() => props.page, () => nextTick(reveal));
onMounted(() => {
  observer = new ResizeObserver(() => { height.value = rail.value?.clientHeight || 600; reveal(); });
  if (rail.value) observer.observe(rail.value);
  reveal();
});
onBeforeUnmount(() => { disposed = true; observer?.disconnect(); });
</script>
<template>
  <nav ref="rail" class="pdf-thumbnails custom-scroll" aria-label="PDF 分页缩略图" @scroll.passive="top = ($event.target as HTMLElement).scrollTop">
    <div class="pdf-thumbnail-list" :style="{ height: `${document.numPages * rowHeight}px` }">
      <button v-for="number in visible" :key="number" type="button" class="pdf-thumbnail" :class="{ selected: number === page }" :aria-label="`第 ${number} 页`" :aria-current="number === page ? 'page' : undefined" :style="{ top: `${(number - 1) * rowHeight}px` }" @click="emit('select', number)">
        <span class="pdf-thumbnail-image" aria-hidden="true"><VuePdfEmbed v-if="widths[number]" :source="document" :page="number" :width="widths[number]" :scale="1" /></span>
        <span>{{ number }}</span>
      </button>
    </div>
  </nav>
</template>
