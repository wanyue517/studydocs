<script setup lang="ts">
import { nextTick, onMounted, watch } from 'vue';
import Button from 'primevue/button';
import { useEditor, EditorContent } from '@tiptap/vue-3';
import StarterKit from '@tiptap/starter-kit';
import { TableKit } from '@tiptap/extension-table';
import { Bold, Italic, Underline as UnderlineIcon, Strikethrough, List, ListOrdered, Quote, Heading1, Heading2, Code2, Undo2, Redo2, Table2 } from 'lucide-vue-next';
const props = defineProps<{ modelValue: string; editable: boolean }>();
const emit = defineEmits<{ 'update:modelValue': [html: string] }>();
const editor = useEditor({
  content: props.modelValue || '<p></p>', editable: props.editable,
  extensions: [StarterKit, TableKit],
  editorProps: { attributes: { class: 'tiptap-editor' } },
  onUpdate: ({ editor }) => emit('update:modelValue', editor.getHTML()),
});
watch(() => props.editable, (value) => editor.value?.setEditable(value));
onMounted(() => { if (props.editable && !props.modelValue.replace(/<[^>]*>/g, '').trim()) void nextTick(() => editor.value?.commands.focus('end')); });
</script>
<template>
  <div class="rich-editor" :class="{ 'is-editing': editable }">
    <div v-if="editable" class="rich-toolbar">
      <Button title="一级标题" :class="{ active: editor?.isActive('heading', { level: 1 }) }" @click="editor?.chain().focus().toggleHeading({ level: 1 }).run()"><Heading1 :size="17" /></Button>
      <Button title="二级标题" :class="{ active: editor?.isActive('heading', { level: 2 }) }" @click="editor?.chain().focus().toggleHeading({ level: 2 }).run()"><Heading2 :size="17" /></Button>
      <i></i>
      <Button title="加粗" :class="{ active: editor?.isActive('bold') }" @click="editor?.chain().focus().toggleBold().run()"><Bold :size="16" /></Button>
      <Button title="斜体" :class="{ active: editor?.isActive('italic') }" @click="editor?.chain().focus().toggleItalic().run()"><Italic :size="16" /></Button>
      <Button title="下划线" :class="{ active: editor?.isActive('underline') }" @click="editor?.chain().focus().toggleUnderline().run()"><UnderlineIcon :size="16" /></Button>
      <Button title="删除线" :class="{ active: editor?.isActive('strike') }" @click="editor?.chain().focus().toggleStrike().run()"><Strikethrough :size="16" /></Button>
      <i></i>
      <Button title="无序列表" :class="{ active: editor?.isActive('bulletList') }" @click="editor?.chain().focus().toggleBulletList().run()"><List :size="17" /></Button>
      <Button title="有序列表" :class="{ active: editor?.isActive('orderedList') }" @click="editor?.chain().focus().toggleOrderedList().run()"><ListOrdered :size="17" /></Button>
      <Button title="引用" :class="{ active: editor?.isActive('blockquote') }" @click="editor?.chain().focus().toggleBlockquote().run()"><Quote :size="16" /></Button>
      <Button title="代码块" :class="{ active: editor?.isActive('codeBlock') }" @click="editor?.chain().focus().toggleCodeBlock().run()"><Code2 :size="16" /></Button>
      <i></i>
      <Button title="插入表格" @click="editor?.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()"><Table2 :size="16" /></Button>
      <i></i>
      <Button title="撤销" @click="editor?.chain().focus().undo().run()"><Undo2 :size="16" /></Button>
      <Button title="重做" @click="editor?.chain().focus().redo().run()"><Redo2 :size="16" /></Button>
    </div>
    <EditorContent :editor="editor" class="rich-content" />
  </div>
</template>
