<script setup lang="ts">
import { ref } from 'vue';
import VuePdfEmbed from 'vue-pdf-embed';
import 'vue-pdf-embed/dist/styles/annotationLayer.css';
import 'vue-pdf-embed/dist/styles/textLayer.css';
import { FileWarning, LoaderCircle } from 'lucide-vue-next';
import Button from 'primevue/button';

defineProps<{source:string;name:string}>();
const page = ref(1);
const pageCount = ref(0);
const loading = ref(true);
const progress = ref<number|null>(null);
const error = ref('');
function changePage(next:number) {
  if (next < 1 || next > pageCount.value || next === page.value) return;
  page.value = next; loading.value = true; progress.value = null;
}
function fail(reason:Error) { error.value = reason.message || 'PDF 预览失败'; loading.value = false; }
</script>
<template>
  <div class="file-preview-top file-preview-controls"><span>{{ name }}</span><nav v-if="pageCount" aria-label="PDF 分页"><Button type="button" size="small" outlined label="上一页" :disabled="page <= 1" @click="changePage(page-1)" /><span>第 {{ page }} / {{ pageCount }} 页</span><Button type="button" size="small" outlined label="下一页" :disabled="page >= pageCount" @click="changePage(page+1)" /></nav></div>
  <div v-if="error" class="file-error"><FileWarning :size="18" />{{ error }}</div>
  <div v-else class="pdf-reader"><div v-if="loading" class="preview-loading" role="status"><LoaderCircle :size="22" class="spin" />{{ progress === null ? '正在加载 PDF…' : `正在加载 PDF… ${progress}%` }}</div><VuePdfEmbed :source="source" :page="page" @loaded="pageCount = $event.numPages" @progress="progress = $event.total ? Math.round($event.loaded / $event.total * 100) : null" @rendered="loading = false" @loading-failed="fail" @rendering-failed="fail" /></div>
</template>
