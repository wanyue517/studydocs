<script setup lang="ts">
import { onBeforeUnmount } from 'vue';

const props = defineProps<{ side: 'left' | 'right'; width: number; min: number; max: number; defaultWidth: number; controls: string; label: string }>();
const emit = defineEmits<{ resize: [width: number]; finish: [] }>();
let pointer: number | null = null;
let target: HTMLElement | null = null;
let startX = 0;
let startWidth = 0;
let pending: number | null = null;
let frame = 0;
function flush() {
  cancelAnimationFrame(frame); frame = 0;
  if (pending !== null) { emit('resize', pending); pending = null; }
}
function start(event: PointerEvent) {
  if (!event.isPrimary || event.button !== 0) return;
  event.preventDefault();
  pointer = event.pointerId; startX = event.clientX; startWidth = props.width;
  target = event.currentTarget as HTMLElement;
  target.focus(); target.setPointerCapture(pointer);
  document.body.classList.add('resizing-panels');
}
function move(event: PointerEvent) {
  if (pointer !== event.pointerId) return;
  pending = startWidth + (event.clientX - startX) * (props.side === 'left' ? 1 : -1);
  if (!frame) frame = requestAnimationFrame(flush);
}
function stop(event?: PointerEvent) {
  if (pointer === null || event && event.pointerId !== pointer) return;
  flush();
  const id = pointer; pointer = null;
  if (target?.hasPointerCapture(id)) target.releasePointerCapture(id);
  target = null;
  document.body.classList.remove('resizing-panels'); emit('finish');
}
function keydown(event: KeyboardEvent) {
  let value = props.width;
  const step = event.shiftKey ? 40 : 10;
  if (event.key === 'ArrowLeft') value += props.side === 'left' ? -step : step;
  else if (event.key === 'ArrowRight') value += props.side === 'left' ? step : -step;
  else if (event.key === 'Home') value = props.min;
  else if (event.key === 'End') value = props.max;
  else return;
  event.preventDefault(); emit('resize', value); emit('finish');
}
function reset() { emit('resize', props.defaultWidth); emit('finish'); }
onBeforeUnmount(() => stop());
</script>
<template>
  <div class="panel-resize-handle" :class="`resize-${side}`" role="separator" tabindex="0" aria-orientation="vertical"
    :aria-label="label" :aria-controls="controls" :aria-valuemin="min" :aria-valuemax="Math.round(max)" :aria-valuenow="Math.round(width)"
    title="拖动调整宽度，双击恢复默认；方向键微调"
    @pointerdown="start" @pointermove="move" @pointerup="stop" @pointercancel="stop" @lostpointercapture="stop"
    @keydown="keydown" @dblclick="reset" />
</template>
