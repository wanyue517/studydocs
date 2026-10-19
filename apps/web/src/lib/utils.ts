import type { ItemKind, KnowledgeItem } from '@studydocs/shared';
import { FileText, Folder, FileCode2, FileType2, FileText as PdfIcon, Globe2 } from 'lucide-vue-next';

export const kindIcon: Record<ItemKind, typeof Folder> = {
  folder: Folder, markdown: FileCode2, richtext: FileText,
  pdf: PdfIcon, word: FileType2, web: Globe2,
};
export const kindLabel: Record<ItemKind, string> = {
  folder: '文件夹', markdown: 'Markdown', richtext: '富文本', pdf: 'PDF 文档', word: 'Word 文档', web: '网页资料',
};
export const fmtDate = (date: string) => {
  const d = new Date(date);
  return new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(d);
};
export const plainText = (item: KnowledgeItem) => item.content.replace(/<[^>]*>/g, ' ').replace(/[#*`>\[\]_]/g, ' ').replace(/\s+/g, ' ').trim();
export const describe = (item: KnowledgeItem) => item.kind === 'web' ? (item.url ?? '外部网页') : plainText(item).slice(0, 105) || kindLabel[item.kind];
