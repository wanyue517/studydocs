<script setup lang="ts">
import { ref } from 'vue';
import type { PdfOutlineEntry } from '@studydocs/shared';
import { api } from '../lib/api';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import InputNumber from 'primevue/inputnumber';
const props = defineProps<{ itemId: string; pageCount: number; image: (page: number) => Promise<string> }>();
const emit = defineEmits<{ close: []; preview: [entries: PdfOutlineEntry[]] }>();
const start = ref(1);
const thumbnails = ref<{ page: number; image: string; selected: boolean }[]>([]);
const engine = ref<'local' | 'vision'>('local');
const language = ref('chi_sim+eng');
const anchors = ref([{ printed: 1, physical: 1 }]);
const busy = ref(false);
const status = ref('');
const error = ref('');
const results = ref<PdfOutlineEntry[]>([]);
async function previewPages() {
  busy.value = true; error.value = '';
  try {
    const begin = start.value;
    if (!Number.isInteger(begin) || begin < 1 || begin > props.pageCount) throw new Error('请输入有效的起始页码');
    thumbnails.value = [];
    for (let page = begin; page <= Math.min(begin + 11, props.pageCount); page++) {
      status.value = `正在准备缩略图 ${page}`;
      thumbnails.value.push({ page, image: await props.image(page), selected: false });
    }
  } catch (e) { error.value = (e as Error).message; }
  finally { busy.value = false; status.value = ''; }
}
async function recognize() {
  busy.value = true; error.value = ''; results.value = [];
  try {
    const selected = thumbnails.value.filter(p => p.selected);
    if (!selected.length) throw new Error('请先勾选目录所在页');
    for (const [index, page] of selected.entries()) {
      status.value = `识别第 ${page.page} 页（${index + 1}/${selected.length}），已完成页面已缓存`;
      const result = await api.recognizeTocPage(props.itemId, page.image, engine.value, language.value);
      results.value.push(...result.entries);
    }
    status.value = `识别完成，共 ${results.value.length} 项。请校准页码后预览。`;
  } catch (e) { error.value = `${(e as Error).message}。重试会复用成功页面的缓存；失败的模型请求可能已计费。`; }
  finally { busy.value = false; }
}
function apply() {
  error.value = '';
  try {
    const sorted = [...anchors.value].sort((a,b) => a.printed - b.printed);
    if (!sorted.length || sorted.some((a, i) => !Number.isInteger(a.printed) || a.printed < 1 || !Number.isInteger(a.physical) || a.physical < 1 || a.physical > props.pageCount || (i > 0 && a.printed === sorted[i-1].printed))) throw new Error('请填写有效且不重复的页码对应关系');
    const mapped = results.value.map(entry => {
      const anchor = sorted.filter(a => a.printed <= entry.page).at(-1);
      if (!anchor) throw new Error(`印刷页 ${entry.page} 缺少对应关系，请添加更早的校准点`);
      return { ...entry, page: entry.page + anchor.physical - anchor.printed };
    });
    if (mapped.some(e => e.page < 1 || e.page > props.pageCount)) throw new Error('换算后的页码超出 PDF 范围，请修正对应关系');
    const seen = new Set<string>();
    emit('preview', mapped.filter(e => { const key = `${e.page}:${e.title}`; if (seen.has(key)) return false; seen.add(key); return true; }).sort((a,b) => a.page-b.page));
  } catch (e) { error.value = (e as Error).message; }
}
</script>
<template>
  <Dialog :visible="true" modal header="从目录页生成" :closable="!busy" :close-on-escape="!busy" :draggable="false" :style="{ width: 'min(800px, calc(100vw - 24px))' }" @update:visible="emit('close')">
    <div class="toc-workflow">
      <p>仅选择印有目录的页面。先加载缩略图，再勾选需要识别的页；每次最多展示 12 页。</p>
      <div class="toc-row"><label>起始物理页 <InputNumber v-model="start" :min="1" :max="pageCount" :use-grouping="false" :disabled="busy" /></label><Button label="加载缩略图" :disabled="busy" @click="previewPages" /></div>
      <div class="toc-thumbs"><label v-for="page in thumbnails" :key="page.page"><input v-model="page.selected" type="checkbox" :disabled="busy" /><span>第 {{ page.page }} 页</span><img :src="page.image" :alt="`第 ${page.page} 页预览`" /></label></div>
      <label>识别方式 <select v-model="engine" :disabled="busy"><option value="local">本地 OCR（不消耗模型额度）</option><option value="vision">视觉模型（仅发送所选目录页）</option></select></label>
      <label v-if="engine === 'local'">语言 <select v-model="language" :disabled="busy"><option value="chi_sim+eng">简体中文 + 英文</option><option value="eng">英文</option></select></label>
      <p>{{ engine === 'local' ? '服务器需要安装 Tesseract 和所选语言包；识别后用规则提取标题及数字页码。' : '使用设置中的默认模型，须支持图片输入。发送图片可能产生费用，失败后不会自动重试。' }}</p>
      <Button label="识别所选页 / 继续识别" :disabled="busy || !thumbnails.some(p => p.selected)" @click="recognize" />
      <p v-if="status" role="status">{{ status }}</p><p v-if="error" role="alert" class="field-error">{{ error }}</p>
      <template v-if="results.length && !busy">
        <p>页码校准：例如书中第 1 页位于 PDF 第 12 页。遇到插页或重新编号，可增加分段校准点；识别结果缓存不受校准影响。</p>
        <div v-for="(anchor, i) in anchors" :key="i" class="toc-row"><label>印刷页 <InputNumber v-model="anchor.printed" :min="1" :use-grouping="false" /></label><label>对应 PDF 页 <InputNumber v-model="anchor.physical" :min="1" :max="pageCount" :use-grouping="false" /></label><Button label="删除" text :disabled="anchors.length === 1" @click="anchors.splice(i,1)" /></div>
        <Button label="添加分段校准点" text @click="anchors.push({ printed: 1, physical: 1 })" />
        <Button label="预览并编辑目录" @click="apply" />
      </template>
    </div>
  </Dialog>
</template>
<style scoped>
.toc-workflow { display:flex; flex-direction:column; gap:14px; }
.toc-row { display:flex; flex-wrap:wrap; gap:12px; align-items:center; }
.toc-row label { display:flex; align-items:center; gap:8px; }
.toc-row :deep(.p-inputnumber) { width:100px; }
.toc-thumbs { display:grid; grid-template-columns:repeat(auto-fill,minmax(140px,1fr)); gap:12px; max-height:400px; overflow:auto; }
.toc-thumbs label { display:flex; flex-wrap:wrap; gap:8px; padding:8px; border:1px solid var(--line); cursor:pointer; }
.toc-thumbs img { width:100%; height:180px; object-fit:contain; }
.field-error { color:#b42318; }
</style>
