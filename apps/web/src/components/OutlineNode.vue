<script setup lang="ts">
import Button from 'primevue/button';
import type { OutlineEntry } from '../lib/outline';

defineOptions({ name: 'OutlineNode' });
defineProps<{ entry: OutlineEntry }>();
const emit = defineEmits<{ navigate: [index: number] }>();
</script>
<template>
  <li class="outline-node">
    <Button text class="outline-link" :class="`outline-h${entry.level}`" @click="emit('navigate', entry.index)"><span class="outline-text">{{ entry.title }}</span></Button>
    <ul v-if="entry.children.length" class="outline-children">
      <OutlineNode v-for="child in entry.children" :key="child.index" :entry="child" @navigate="emit('navigate', $event)" />
    </ul>
  </li>
</template>
