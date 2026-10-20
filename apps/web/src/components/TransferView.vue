<script setup lang="ts">
import { computed } from 'vue';
import { ArrowDownToLine, ArrowUpFromLine, Check, CircleAlert, LoaderCircle, RotateCcw, Trash2 } from 'lucide-vue-next';
import { useTransferStore } from '../stores/transfers';

const store = useTransferStore();
const uploads = computed(() => store.tasks.filter((task) => task.type === 'upload'));
const downloads = computed(() => store.tasks.filter((task) => task.type === 'download'));
const size = (bytes: number) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : bytes >= 1024 ? `${Math.round(bytes / 1024)} KB` : `${bytes} B`;
</script>

<template>
  <div class="collection-view transfer-page">
    <div class="collection-heading transfer-page-heading"><div><h1>任务管理</h1><p>进度按服务器确认的上传字节或已保存的下载字节计算。中断后重新选择同一文件可续传上传，重新下载可续传下载。</p></div><button v-if="store.tasks.some((task) => task.status !== 'running')" class="transfer-clear" @click="store.clearCompleted()"><Trash2 :size="15" />清除已结束记录</button></div>
    <section v-for="group in [{ title: '上传记录', items: uploads, icon: ArrowUpFromLine }, { title: '下载记录', items: downloads, icon: ArrowDownToLine }]" :key="group.title" class="transfer-section">
      <h2><component :is="group.icon" :size="18" />{{ group.title }}<span>{{ group.items.length }}</span></h2>
      <div v-if="!group.items.length" class="transfer-empty">暂无{{ group.title }}</div>
      <div v-for="task in group.items" :key="task.id" class="transfer-row">
        <div class="transfer-file-icon"><component :is="group.icon" :size="20" /></div>
        <div class="transfer-file-detail"><div class="transfer-file-top"><strong :title="task.name">{{ task.name }}</strong><span :class="`transfer-status ${task.status}`"><LoaderCircle v-if="task.status === 'running'" :size="14" class="spin" /><Check v-else-if="task.status === 'done'" :size="14" /><CircleAlert v-else :size="14" />{{ task.status === 'running' ? task.type === 'upload' && task.progress === 100 ? '处理中' : '进行中' : task.status === 'done' ? '已完成' : '失败' }}</span></div><div class="transfer-meta"><span>{{ new Date(task.createdAt).toLocaleString('zh-CN') }}</span><span v-if="task.total">{{ size(task.loaded) }} / {{ size(task.total) }}</span><span v-if="task.message">{{ task.message }}</span></div><div v-if="task.status === 'running'" class="transfer-track" :class="{ indeterminate: task.progress === null }"><i :style="{ width: `${task.progress ?? 35}%` }"></i></div></div>
        <button v-if="store.canRetry(task)" class="transfer-clear" title="重试" @click="void store.retry(task)"><RotateCcw :size="14" />重试</button><span class="transfer-percent">{{ task.status === 'running' ? task.progress === null ? '传输中' : `${task.progress}%` : task.status === 'done' ? '100%' : '—' }}</span>
      </div>
    </section>
  </div>
</template>
