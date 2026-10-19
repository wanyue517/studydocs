<script setup lang="ts">
import { computed, ref } from 'vue';
import Button from 'primevue/button';
import { ChevronRight, MoreHorizontal, Star } from 'lucide-vue-next';
import type { KnowledgeItem } from '@studydocs/shared';
import { useKnowledgeStore } from '../stores/knowledge';
import { kindIcon } from '../lib/utils';

defineOptions({ name: 'TreeNode' });
const props = defineProps<{ item: KnowledgeItem; depth?: number }>();
const emit = defineEmits<{ menu: [item: KnowledgeItem, event: MouseEvent] }>();
const store = useKnowledgeStore();
const over = ref(false);
const children = computed(() => store.items.filter((x) => x.parentId === props.item.id)
  .sort((a,b) => Number(b.kind === 'folder') - Number(a.kind === 'folder') || a.name.localeCompare(b.name, 'zh-CN')));
const opened = computed(() => store.expanded.includes(props.item.id));
const selected = computed(() => store.panel === 'document' && store.activeId === props.item.id);

function showMenu(event: MouseEvent) { event.preventDefault(); event.stopPropagation(); emit('menu', props.item, event); }
function dragStart(event: DragEvent) { event.dataTransfer?.setData('text/plain', props.item.id); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'; }
function drop(event: DragEvent) {
  over.value = false;
  if (props.item.kind !== 'folder') return;
  if (event.dataTransfer?.files.length) {
    for (const file of Array.from(event.dataTransfer.files)) void store.upload(file, props.item.id);
    return;
  }
  const id = event.dataTransfer?.getData('text/plain');
  if (id) void store.move(id, props.item.id);
}
</script>

<template>
  <div class="tree-node">
    <div class="tree-line" :class="{ selected, 'drag-over': over }" :style="{ paddingLeft: `${8 + (depth ?? 0) * 16}px` }"
      draggable="true" @dragstart="dragStart" @click="store.open(item.id)" @contextmenu="showMenu"
      @dragover="item.kind === 'folder' && ($event.preventDefault(), over = true)"
      @dragleave="over = false" @drop.stop.prevent="drop">
      <ChevronRight v-if="item.kind === 'folder'" :size="14" class="tree-chevron" :class="{ rotated: opened }"
        @click.stop="store.toggleFolder(item.id)" />
      <span v-else class="tree-chevron-spacer"></span>
      <component :is="kindIcon[item.kind]" :size="16" :stroke-width="1.8" class="tree-kind" :class="`kind-${item.kind}`" />
      <span class="tree-name" :title="item.name">{{ item.name }}</span>
      <Star v-if="item.starred" :size="12" class="mini-star" fill="currentColor" />
      <Button class="tree-more icon-btn" title="更多操作" @click="showMenu"><MoreHorizontal :size="16" /></Button>
    </div>
    <div v-if="item.kind === 'folder' && opened" class="tree-children">
      <TreeNode v-for="child in children" :key="child.id" :item="child" :depth="(depth ?? 0) + 1" @menu="(item, event) => emit('menu', item, event)" />
      <div v-if="!children.length" class="tree-empty" :style="{ paddingLeft: `${42 + (depth ?? 0) * 16}px` }">空文件夹</div>
    </div>
  </div>
</template>
