<script setup lang="ts">
import { ArrowRight, Check, CircleAlert, LoaderCircle, X } from 'lucide-vue-next';
import { useTransferStore } from '../stores/transfers';
const emit = defineEmits<{ open: [] }>();
const store = useTransferStore();
</script>
<template>
  <aside v-if="store.floatingVisible && store.tasks.length" class="transfer-float" aria-label="文件传输进度">
    <header><strong>{{ store.running.length ? `${store.running.length} 个任务进行中` : '传输任务' }}</strong><button title="关闭进度浮窗" @click="store.floatingVisible = false"><X :size="17" /></button></header>
    <div class="transfer-float-list"><div v-for="task in store.tasks.slice(0, 3)" :key="task.id" class="transfer-float-item"><div><span class="transfer-float-name" :title="task.name">{{ task.name }}</span><span class="transfer-float-state"><LoaderCircle v-if="task.status === 'running'" :size="13" class="spin" /><Check v-else-if="task.status === 'done'" :size="13" /><CircleAlert v-else :size="13" />{{ task.status === 'running' ? task.type === 'upload' && task.progress === 100 ? '处理中' : task.progress === null ? '传输中' : `${task.progress}%` : task.status === 'done' ? '已完成' : '失败' }}</span></div><div v-if="task.status === 'running'" class="transfer-track" :class="{ indeterminate: task.progress === null }"><i :style="{ width: `${task.progress ?? 35}%` }"></i></div></div></div>
    <button class="transfer-float-link" @click="emit('open')">查看全部任务 <ArrowRight :size="15" /></button>
  </aside>
</template>
