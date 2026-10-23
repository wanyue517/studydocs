<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import TreeSelect from 'primevue/treeselect';
import type { TreeNode } from 'primevue/treenode';
import type { KnowledgeItem } from '@studydocs/shared';

const props = defineProps<{ modelValue: string | null; items: KnowledgeItem[]; inputId: string; excludeId?: string }>();
const emit = defineEmits<{ 'update:modelValue': [value: string | null] }>();
const rootKey = '__root__';
const options = computed<TreeNode[]>(() => {
  const folders = props.items.filter(item => item.kind === 'folder');
  const children = new Map<string | null, KnowledgeItem[]>();
  for (const folder of folders) {
    const siblings = children.get(folder.parentId) ?? [];
    siblings.push(folder); children.set(folder.parentId, siblings);
  }
  const visited = new Set<string>();
  function branch(parentId: string | null): TreeNode[] {
    return (children.get(parentId) ?? []).slice().sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')).flatMap(folder => {
      // Omitting the whole branch prevents moving a folder into itself or a descendant.
      if (folder.id === props.excludeId || visited.has(folder.id)) return [];
      visited.add(folder.id);
      return [{ key: folder.id, label: folder.name, children: branch(folder.id) }];
    });
  }
  return [{ key: rootKey, label: '根目录', children: branch(null) }];
});
const picker = ref<InstanceType<typeof TreeSelect> | null>(null);
const selection = ref<Record<string, boolean>>({});
watch(() => props.modelValue, value => { selection.value = { [value || rootKey]: true }; }, { immediate: true });
function updateSelection(keys: Record<string, boolean> | null) {
  // Selecting the current folder keeps the required destination and closes the popup.
  const key = Object.keys(keys ?? {}).find(key => keys?.[key]) ?? (props.modelValue || rootKey);
  selection.value = { [key]: true };
  emit('update:modelValue', key === rootKey ? null : key);
  picker.value?.hide();
}
const expanded = ref<Record<string, boolean>>({});
function expandAll() {
  const keys: Record<string, boolean> = {};
  function visit(nodes: TreeNode[]) { for (const node of nodes) { if (node.children?.length) { keys[node.key!] = true; visit(node.children); } } }
  visit(options.value); expanded.value = keys;
}
watch(options, expandAll, { immediate: true });
</script>
<template>
  <TreeSelect ref="picker" :model-value="selection" @update:model-value="updateSelection" v-model:expanded-keys="expanded" :input-id="inputId" :options="options" selection-mode="single" filter filter-placeholder="搜索文件夹" placeholder="选择文件夹" class="study-dialog-input folder-select" panel-class="folder-select-panel" scroll-height="320px" @before-show="expandAll" />
</template>
