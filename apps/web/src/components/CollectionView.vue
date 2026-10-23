<script setup lang="ts">
import { computed } from 'vue';
import Button from 'primevue/button';
import { useConfirm } from 'primevue/useconfirm';
import { ArrowLeft, ArrowRight, Clock3, FolderOpen, Heart, LoaderCircle, Plus, RotateCcw, SearchX, Trash2, Upload } from 'lucide-vue-next';
import type { KnowledgeItem } from '@studydocs/shared';
import { useKnowledgeStore } from '../stores/knowledge';
import { useAccountStore } from '../stores/account';
import { fmtDate, kindIcon, kindLabel, describe } from '../lib/utils';

const emit = defineEmits<{ create: [kind: 'markdown' | 'richtext' | 'folder']; upload: [] }>();
const store = useKnowledgeStore();
const confirm = useConfirm();
const account = useAccountStore();
const title = computed(() => store.panel === 'folder' ? store.active?.name ?? '我的文档' : ({ favorites: '我的收藏', recent: '最近访问', trash: '回收站', search: '搜索结果' } as Record<string,string>)[store.panel] ?? '知识库');
const folderItems = computed(() => store.items.filter((item) => item.parentId === store.activeId)
  .sort((a, b) => Number(b.kind === 'folder') - Number(a.kind === 'folder') || a.name.localeCompare(b.name, 'zh-CN')));
const subtitle = computed(() => store.panel === 'folder' ? `${folderItems.value.length} 个项目` : store.panel === 'search' ? `找到 ${store.results.length} 个匹配项` : '');
const listing = computed(() => ({ folder: folderItems.value, favorites: store.favorites, recent: store.recent, search: store.results, trash: store.deleted.filter((x) => !x.parentId || !store.deleted.some((p) => p.id === x.parentId)) } as Record<string, KnowledgeItem[]>)[store.panel] ?? []);
function permanentlyDelete(item: KnowledgeItem) {
  confirm.require({
    header: '永久删除',
    message: `确定永久删除「${item.name}」及其所有子项吗？此操作无法恢复。`,
    rejectProps: { label: '取消', outlined: true, severity: 'secondary' },
    acceptProps: { label: '永久删除', severity: 'danger' },
    accept: () => { void store.forever(item.id); },
  });
}
</script>
<template>
  <div class="collection-view">
    <div v-if="store.panel === 'folder'" class="folder-actions">
      <Button severity="secondary" outlined @click="store.active?.parentId ? store.open(store.active.parentId) : store.navigate('folder')"><ArrowLeft :size="17" />返回上一级</Button>
      <Button severity="secondary" outlined @click="emit('create', 'folder')"><Plus :size="17" />新建文件夹</Button>
      <Button severity="secondary" outlined @click="emit('create', 'markdown')"><Plus :size="17" />新建笔记</Button>
      <Button @click="emit('upload')"><Upload :size="17" />上传文件</Button>
    </div>
    <div class="collection-heading"><h1>{{ title }}</h1><p v-if="subtitle">{{ subtitle }}</p></div>
    <div v-if="store.loading || store.panel === 'trash' && store.trashLoading" class="preview-loading" role="status"><LoaderCircle :size="20" class="spin" />正在加载文档…</div>
    <div v-else-if="listing.length" class="doc-list page-list">
      <div v-for="item in listing" :key="item.id" class="doc-list-item" role="button" tabindex="0" @click="store.panel !== 'trash' && store.open(item.id)" @keydown.enter="store.panel !== 'trash' && store.open(item.id)">
        <span class="list-kind"><component :is="kindIcon[item.kind]" :size="19" /></span>
        <span class="list-main"><strong>{{ item.name }}</strong><small>{{ store.panel === 'trash' ? kindLabel[item.kind] : describe(item) }}</small></span>
        <span class="list-time">{{ fmtDate(item.updatedAt) }}</span>
        <template v-if="store.panel === 'trash'"><Button class="icon-btn row-action" title="恢复" @click.stop="store.restore(item.id)"><RotateCcw :size="17" /></Button><Button class="icon-btn row-action danger" title="永久删除" @click.stop="permanentlyDelete(item)"><Trash2 :size="17" /></Button></template>
        <ArrowRight v-else :size="17" class="list-arrow" />
      </div>
    </div>
    <div v-else class="collection-empty"><span><FolderOpen v-if="store.panel === 'folder'" :size="33" /><Heart v-else-if="store.panel === 'favorites'" :size="33" /><Clock3 v-else-if="store.panel === 'recent'" :size="33" /><Trash2 v-else-if="store.panel === 'trash'" :size="33" /><SearchX v-else :size="33" /></span><h3>{{ store.panel === 'folder' ? '此文件夹为空' : store.panel === 'favorites' ? '还没有收藏的文档' : store.panel === 'recent' ? '还没有浏览记录' : store.panel === 'trash' ? '回收站是空的' : '没有找到相关内容' }}</h3><Button v-if="store.panel !== 'trash' && store.panel !== 'search'" class="primary-btn" @click="emit('create', 'markdown')"><Plus :size="16" />创建第一篇笔记</Button></div>
    <footer class="library-footer">{{ account.site.footerText }}<span v-if="account.site.icpNumber"> · {{ account.site.icpNumber }}</span><span v-if="account.site.policeRecordNumber"> · {{ account.site.policeRecordNumber }}</span></footer>
  </div>
</template>
