<script setup lang="ts">
import { computed } from 'vue';
import Button from 'primevue/button';
import { useConfirm } from 'primevue/useconfirm';
import { ArrowRight, BookOpenText, Clock3, FilePlus2, FolderClosed, Heart, Plus, RotateCcw, SearchX, Star, Trash2, UploadCloud } from 'lucide-vue-next';
import type { KnowledgeItem } from '@studydocs/shared';
import { useKnowledgeStore } from '../stores/knowledge';
import { useAccountStore } from '../stores/account';
import { fmtDate, kindIcon, kindLabel, describe } from '../lib/utils';

const emit = defineEmits<{ create: [kind: 'markdown' | 'richtext' | 'folder']; upload: [] }>();
const store = useKnowledgeStore();
const confirm = useConfirm();
const account = useAccountStore();
const documents = computed(() => store.items.filter((x) => x.kind !== 'folder'));
const stats = computed(() => [
  { label: '全部文档', value: documents.value.length, icon: BookOpenText, color: 'blue' },
  { label: '知识目录', value: store.items.filter((x) => x.kind === 'folder').length, icon: FolderClosed, color: 'orange' },
  { label: '我的收藏', value: store.favorites.length, icon: Star, color: 'purple' },
]);
const sortedDocuments = computed(() => [...documents.value].sort((a,b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6));
const title = computed(() => ({ favorites: '我的收藏', recent: '最近访问', trash: '回收站', search: '搜索结果' } as Record<string,string>)[store.panel] ?? '知识库');
const subtitle = computed(() => store.panel === 'search' ? `找到 ${store.results.length} 个匹配项` : '');
const listing = computed(() => ({ favorites: store.favorites, recent: store.recent, search: store.results, trash: store.deleted.filter((x) => !x.parentId || !store.deleted.some((p) => p.id === x.parentId)) } as Record<string, KnowledgeItem[]>)[store.panel] ?? []);
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
    <template v-if="store.panel === 'home'">
      <div class="home-hero">
        <div class="hero-content"><h1>把所学，<br /><em>收进一处。</em></h1>
          <Button class="hero-button" @click="emit('create', 'markdown')">开始写笔记 <ArrowRight :size="17" /></Button>
        </div>
        <div class="hero-art" aria-hidden="true"><div class="hero-paper paper-back"><span></span><span></span><span></span></div><div class="hero-paper paper-front"><div class="art-star">✦</div><span></span><span></span><span></span><span></span></div><div class="art-orbit orbit-one"></div><div class="art-orbit orbit-two"></div><div class="art-dot dot-one"></div><div class="art-dot dot-two"></div></div>
      </div>
      <div class="stat-grid"><div v-for="stat in stats" :key="stat.label" class="stat-card"><div class="stat-icon" :class="stat.color"><component :is="stat.icon" :size="19" /></div><div><strong>{{ stat.value }}</strong><span>{{ stat.label }}</span></div></div></div>
      <div class="section-header"><div><h2>快捷开始</h2></div></div>
      <div class="quick-grid">
        <Button @click="emit('create', 'markdown')"><span class="quick-icon sky"><FilePlus2 :size="20" /></span><strong>写 Markdown</strong><ArrowRight :size="16" class="quick-arrow" /></Button>
        <Button @click="emit('create', 'richtext')"><span class="quick-icon amber"><BookOpenText :size="20" /></span><strong>新建富文本</strong><ArrowRight :size="16" class="quick-arrow" /></Button>
        <Button @click="emit('upload')"><span class="quick-icon mint"><UploadCloud :size="20" /></span><strong>导入学习资料</strong><ArrowRight :size="16" class="quick-arrow" /></Button>
      </div>
      <div class="section-header recent-heading"><div><h2>最近更新</h2></div><Button class="see-all" @click="store.navigate('recent')">查看最近访问 <ArrowRight :size="15" /></Button></div>
      <div class="doc-list">
        <Button v-for="item in sortedDocuments" :key="item.id" class="doc-list-item" @click="store.open(item.id)"><span class="list-kind"><component :is="kindIcon[item.kind]" :size="18" /></span><span class="list-main"><strong>{{ item.name }}</strong><small>{{ describe(item) }}</small></span><span class="list-time">{{ fmtDate(item.updatedAt) }}</span><ArrowRight class="list-arrow" :size="16" /></Button>
        <div v-if="!sortedDocuments.length" class="list-empty">还没有文档，点击上方开始创建。</div>
      </div>
    </template>
    <template v-else>
      <div class="collection-heading"><h1>{{ title }}</h1><p v-if="subtitle">{{ subtitle }}</p></div>
      
      <div v-if="listing.length" class="doc-list page-list">
        <div v-for="item in listing" :key="item.id" class="doc-list-item" role="button" tabindex="0" @click="store.panel !== 'trash' && store.open(item.id)" @keydown.enter="store.panel !== 'trash' && store.open(item.id)">
          <span class="list-kind"><component :is="kindIcon[item.kind]" :size="19" /></span>
          <span class="list-main"><strong>{{ item.name }}</strong><small>{{ store.panel === 'trash' ? kindLabel[item.kind] : describe(item) }}</small></span>
          <span class="list-time">{{ fmtDate(item.updatedAt) }}</span>
          <template v-if="store.panel === 'trash'"><Button class="icon-btn row-action" title="恢复" @click.stop="store.restore(item.id)"><RotateCcw :size="17" /></Button><Button class="icon-btn row-action danger" title="永久删除" @click.stop="permanentlyDelete(item)"><Trash2 :size="17" /></Button></template>
          <ArrowRight v-else :size="17" class="list-arrow" />
        </div>
      </div>
      <div v-else class="collection-empty"><span><Heart v-if="store.panel === 'favorites'" :size="33" /><Clock3 v-else-if="store.panel === 'recent'" :size="33" /><Trash2 v-else-if="store.panel === 'trash'" :size="33" /><SearchX v-else :size="33" /></span><h3>{{ store.panel === 'favorites' ? '还没有收藏的文档' : store.panel === 'recent' ? '还没有浏览记录' : store.panel === 'trash' ? '回收站是空的' : '没有找到相关内容' }}</h3><Button v-if="store.panel !== 'trash' && store.panel !== 'search'" class="primary-btn" @click="emit('create', 'markdown')"><Plus :size="16" />创建第一篇笔记</Button></div>
    </template>
    <footer class="library-footer">{{ account.site.footerText }}<span v-if="account.site.icpNumber"> · {{ account.site.icpNumber }}</span><span v-if="account.site.policeRecordNumber"> · {{ account.site.policeRecordNumber }}</span></footer>
  </div>
</template>
