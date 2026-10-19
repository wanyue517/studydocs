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
