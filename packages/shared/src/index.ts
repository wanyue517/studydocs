export type ItemKind = 'folder' | 'markdown' | 'richtext' | 'pdf' | 'word' | 'web';

export interface KnowledgeItem {
  id: string;
  parentId: string | null;
  name: string;
  kind: ItemKind;
  content: string;
  fileName: string | null;
  mimeType: string | null;
  url: string | null;
  starred: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  storageId: string | null;
}

export interface CreateItemInput {
  parentId?: string | null;
  name: string;
  kind: 'folder' | 'markdown' | 'richtext' | 'web';
  content?: string;
  url?: string;
}

export interface PatchItemInput {
  name?: string;
  parentId?: string | null;
  content?: string;
  url?: string;
  starred?: boolean;
  version?: number;
}

export interface ApiStats {
  total: number;
  folders: number;
  documents: number;
  favorites: number;
}

export type AiProvider = 'deepseek' | 'openai' | 'doubao' | 'qwen' | 'compatible';
export interface AiProfileInput { name: string; provider: AiProvider; baseUrl: string; model: string; apiKey?: string }
export interface AiProfile extends Omit<AiProfileInput, 'apiKey'> { id: string; active: boolean; hasKey: boolean }
export interface PdfOutlineEntry { title: string; level: number; page: number }
export interface PdfTextPage { page: number; text: string }
export interface PdfOutlineJob { id: string; status: 'running' | 'completed' | 'failed'; progress: number; error: string; model: string }
export interface PdfOutlineDraft { entries: PdfOutlineEntry[]; baseUpdatedAt: string | null; updatedAt: string }
export interface PdfOutlineState { draft?: PdfOutlineDraft | null; partialEntries?: PdfOutlineEntry[]; entries: PdfOutlineEntry[]; pageCount: number; updatedAt: string | null; job: PdfOutlineJob | null }
