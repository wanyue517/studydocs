import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue';

type Side = 'left' | 'right';
const DEFAULTS = { left: 284, right: 250 };
const MIN = { left: 220, right: 200 };
const MAX = { left: 480, right: 420 };
const MAIN_MIN = 440;
const STORAGE_KEY = 'studydocs-sidebar-widths';
function clamp(value: number, min: number, max: number) { return Math.max(min, Math.min(max, value)); }

export function useSidebarWidths(shell: Ref<HTMLElement | null>, leftVisible: Ref<boolean>, hasOutline: Ref<boolean>) {
  const preferred = ref({ ...DEFAULTS });
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}');
    for (const side of ['left', 'right'] as const) {
      if (typeof saved[side] === 'number' && Number.isFinite(saved[side])) preferred.value[side] = clamp(saved[side], MIN[side], MAX[side]);
    }
  } catch { /* Use defaults when storage is unavailable. */ }
  const viewport = ref(window.innerWidth);
  const desktop = computed(() => viewport.value > 770);
  const outlineVisible = computed(() => hasOutline.value && viewport.value > 1040);
  const available = computed(() => Math.max(0, viewport.value - 66 - MAIN_MIN));
  const widths = computed(() => {
    const left = desktop.value && leftVisible.value
      ? clamp(preferred.value.left, MIN.left, Math.min(MAX.left, available.value - (outlineVisible.value ? MIN.right : 0))) : 0;
    const right = outlineVisible.value
      ? clamp(preferred.value.right, MIN.right, Math.min(MAX.right, available.value - left)) : 0;
    return { left, right };
  });
  function max(side: Side) {
    const other = widths.value[side === 'left' ? 'right' : 'left'];
    return Math.max(MIN[side], Math.min(MAX[side], available.value - other));
  }
  const leftMax = computed(() => max('left'));
  const rightMax = computed(() => max('right'));
  const style = computed(() => ({
    '--left-sidebar-width': `${widths.value.left}px`,
    '--outline-sidebar-width': `${widths.value.right}px`,
  }));
  function resize(side: Side, value: number) {
    if (Number.isFinite(value)) preferred.value[side] = clamp(value, MIN[side], max(side));
  }
  function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(preferred.value)); } catch { /* Resizing works without persistence. */ }
  }
  function measure() { viewport.value = shell.value?.clientWidth ?? window.innerWidth; }
  const observer = new ResizeObserver(measure);
  // Authentication swaps the shell into the DOM after this composable mounts.
  watch(shell, (element) => {
    observer.disconnect();
    if (element) observer.observe(element);
    measure();
  }, { flush: 'post' });
  onMounted(() => { measure(); window.addEventListener('resize', measure); });
  onBeforeUnmount(() => { observer.disconnect(); window.removeEventListener('resize', measure); });
  return { widths, style, desktop, outlineVisible, leftMax, rightMax, resize, persist };
}
