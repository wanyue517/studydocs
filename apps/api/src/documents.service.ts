import { BadRequestException, ConflictException, Injectable, NotFoundException, OnModuleInit } from '@nestjs/common';
import { extname } from 'node:path';
import { randomUUID } from 'node:crypto';
import sanitizeHtml from 'sanitize-html';
import type { KnowledgeItem, ItemKind } from '@studydocs/shared';
import { CreateItemDto, PatchItemDto } from './dto';
import { normalizeUploadFilename } from './upload-filename';
import { DatabaseService } from './database.service';
import { StorageService } from './storage.service';
import { SiteService } from './site.service';

interface DbRow {
  id: string; parent_id: string | null; name: string; kind: ItemKind; content: string;
  file_name: string | null; file_path: string | null; mime_type: string | null; owner_id: string | null; storage_id: string | null; object_key: string | null;
  url: string | null; starred: number; version: number; created_at: string;
  updated_at: string; deleted_at: string | null;
}

const cleanHtml = (html: string) => sanitizeHtml(html, {
  allowedTags: ['p','div','br','strong','b','em','i','u','s','h1','h2','h3','h4','h5','h6','blockquote','ul','ol','li','code','pre','hr','table','thead','tbody','tr','th','td','a','span'],
  allowedAttributes: { a: ['href','target','rel'], th: ['colspan','rowspan'], td: ['colspan','rowspan'] },
  allowedSchemes: ['https','http','mailto'],
});
const iso = () => new Date().toISOString();

@Injectable()
export class DocumentsService implements OnModuleInit {
  private get db() { return this.database.db; }
  constructor(private readonly database: DatabaseService, private readonly storage: StorageService, private readonly site: SiteService) {}
  onModuleInit() {
    if ((this.db.prepare('SELECT COUNT(*) AS n FROM items').get() as { n:number }).n === 0) {
      const admin = this.db.prepare("SELECT id FROM users WHERE role='admin' LIMIT 1").get() as {id:string};
      if (admin) this.seed(admin.id);
    }
  }

  private map(row: DbRow): KnowledgeItem {
    return { id: row.id, parentId: row.parent_id, name: row.name, kind: row.kind,
      content: row.content, fileName: row.file_name, mimeType: row.mime_type,
      url: row.url, starred: !!row.starred, version: row.version,
      createdAt: row.created_at, updatedAt: row.updated_at, deletedAt: row.deleted_at, storageId: row.storage_id };
  }

  private row(ownerId: string, id: string, allowDeleted = false): DbRow {
    const row = this.db.prepare('SELECT * FROM items WHERE id = ? AND owner_id = ?').get(id, ownerId) as DbRow | undefined;
    if (!row || (!allowDeleted && row.deleted_at)) throw new NotFoundException('文档或目录不存在');
    return row;
  }

  list(ownerId: string, includeDeleted = false): KnowledgeItem[] {
    const sql = includeDeleted ? 'SELECT * FROM items WHERE owner_id=? AND deleted_at IS NOT NULL ORDER BY updated_at DESC' :
      'SELECT * FROM items WHERE owner_id=? AND deleted_at IS NULL ORDER BY kind = \'folder\' DESC, name COLLATE NOCASE ASC';
    return (this.db.prepare(sql).all(ownerId) as unknown as DbRow[]).map((r) => this.map(r));
  }

  find(ownerId: string, id: string) { return this.map(this.row(ownerId, id)); }

  private assertParent(ownerId: string, parentId: string | null | undefined, childId?: string) {
    if (!parentId) return;
    const parent = this.row(ownerId, parentId);
    if (parent.kind !== 'folder') throw new BadRequestException('只能移动到文件夹中');
    if (parentId === childId) throw new BadRequestException('不能移动到自身');
    const visited = new Set<string>();
    let next: string | null = parent.parent_id;
    while (next) {
      if (next === childId) throw new BadRequestException('不能移动到自己的子目录');
      if (visited.has(next)) throw new BadRequestException('目录结构存在循环');
      visited.add(next);
      const r = this.db.prepare('SELECT parent_id FROM items WHERE id = ? AND owner_id=?').get(next, ownerId) as { parent_id: string | null } | undefined;
      next = r?.parent_id ?? null;
    }
  }

  create(ownerId: string, dto: CreateItemDto) {
    const name = dto.name.trim();
    if (!name) throw new BadRequestException('名称不能为空');
    if (dto.content && dto.content.length > 2_000_000) throw new BadRequestException('内容超过 2 MB');
    this.assertParent(ownerId, dto.parentId);
    if (dto.kind === 'web' && !dto.url) throw new BadRequestException('网页类型需要填写 URL');
    const id = randomUUID(), now = iso();
    this.db.prepare(`INSERT INTO items(id,parent_id,name,kind,content,url,created_at,updated_at,owner_id)
      VALUES(?,?,?,?,?,?,?,?,?)`).run(id, dto.parentId ?? null, name, dto.kind,
      dto.kind === 'richtext' ? cleanHtml(dto.content ?? '<p></p>') : (dto.content ?? ''), dto.url ?? null, now, now, ownerId);
    return this.find(ownerId,id);
  }

  patch(ownerId: string, id: string, dto: PatchItemDto) {
    const old = this.row(ownerId,id);
    if (dto.version !== undefined && dto.version !== old.version) throw new ConflictException('文档已被其他操作更新，请刷新后重试');
    if (dto.content !== undefined && !['richtext', 'markdown'].includes(old.kind)) throw new BadRequestException('该文件不能直接编辑正文');
    if (dto.content && dto.content.length > 2_000_000) throw new BadRequestException('内容超过 2 MB');
    if (dto.url !== undefined && old.kind !== 'web') throw new BadRequestException('仅网页类型可修改 URL');
    if (dto.parentId !== undefined) this.assertParent(ownerId, dto.parentId, id);
    const name = dto.name !== undefined ? dto.name.trim() : old.name;
    if (!name) throw new BadRequestException('名称不能为空');
    const content = dto.content === undefined ? old.content : old.kind === 'richtext' ? cleanHtml(dto.content) : dto.content;
    this.db.prepare(`UPDATE items SET name=?, parent_id=?, content=?, url=?, starred=?, updated_at=?, version=version+1
      WHERE id=?`).run(name, dto.parentId === undefined ? old.parent_id : dto.parentId,
      content, dto.url ?? old.url, dto.starred === undefined ? old.starred : Number(dto.starred), iso(), id);
    return this.find(ownerId,id);
  }

  private descendants(ownerId: string, id: string) {
    const list = [id];
    for (let i = 0; i < list.length; i++) {
      const children = this.db.prepare('SELECT id FROM items WHERE parent_id = ? AND owner_id=?').all(list[i],ownerId) as { id: string }[];
      for (const child of children) if (!list.includes(child.id)) list.push(child.id);
    }
    return list;
  }

  trash(ownerId: string, id: string) {
    this.row(ownerId,id);
    const children = this.descendants(ownerId,id), timestamp = iso();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const stmt = this.db.prepare('UPDATE items SET deleted_at=?, updated_at=? WHERE id=?');
      for (const child of children) stmt.run(timestamp, timestamp, child);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return { success: true };
  }

  restore(ownerId: string, id: string) {
    const target = this.row(ownerId,id, true);
    if (!target.deleted_at) throw new BadRequestException('该条目不在回收站');
    const all = this.descendants(ownerId,id), now = iso();
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const originalParent = target.parent_id ? this.db.prepare('SELECT deleted_at FROM items WHERE id=? AND owner_id=?').get(target.parent_id,ownerId) as { deleted_at: string | null } | undefined : undefined;
      if (originalParent?.deleted_at) this.db.prepare('UPDATE items SET parent_id=NULL WHERE id=?').run(id);
      const stmt = this.db.prepare('UPDATE items SET deleted_at=NULL, updated_at=? WHERE id=?');
      for (const child of all) stmt.run(now, child);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    return this.find(ownerId,id);
  }

  async removeForever(ownerId: string, id: string) {
    const target = this.row(ownerId,id, true);
    if (!target.deleted_at) throw new BadRequestException('请先移入回收站再永久删除');
    const children = this.descendants(ownerId,id);
    const storedFiles = children.map((child) => this.row(ownerId, child, true))
      .filter((r) => r.object_key || r.file_path).map((r) => ({storageId:r.storage_id, key:r.object_key ?? r.file_path!}));
    this.db.exec('BEGIN IMMEDIATE');
    try {
      const stmt = this.db.prepare('DELETE FROM items WHERE id = ?');
      for (const child of children) stmt.run(child);
      this.db.exec('COMMIT');
    } catch (error) { this.db.exec('ROLLBACK'); throw error; }
    // 先提交数据库，再尽力清理对象，云端失败时登记重试队列，不损坏其他文件。
    let cleanupPending = 0;
    for (const f of storedFiles) {
      try { await this.storage.delete(f.storageId, f.key); }
      catch {
        cleanupPending++;
        this.db.prepare('INSERT INTO storage_gc_jobs(id,storage_id,object_key,created_at) VALUES(?,?,?,?)')
          .run(randomUUID(),f.storageId,f.key,iso());
      }
    }
    return { success:true, cleanupPending };
  }

  async upload(ownerId: string, file: Express.Multer.File, parentId: string | null, suppliedName?: string) {
    if (!file || !file.buffer) throw new BadRequestException('请选择文件');
    this.assertParent(ownerId,parentId);
    const raw = normalizeUploadFilename(file.originalname, suppliedName);
    if (!raw || raw.length > 255) throw new BadRequestException('文件名不能为空或超过 255 个字符');
    const ext = extname(raw).toLowerCase();
    const kind: Record<string, ItemKind> = { '.md':'markdown', '.markdown':'markdown', '.pdf':'pdf', '.docx':'word', '.html':'richtext', '.htm':'richtext' };
    if (!kind[ext]) throw new BadRequestException('仅支持 .md、.markdown、.html、.htm、.pdf、.docx（暂不支持旧版 .doc）');
    if (ext === '.pdf' && file.buffer.subarray(0, 5).toString() !== '%PDF-') throw new BadRequestException('PDF 文件内容无效');
    if (ext === '.docx' && file.buffer.subarray(0, 2).toString() !== 'PK') throw new BadRequestException('DOCX 文件内容无效');
    const id = randomUUID(), now = iso();
    const isText = ['markdown','richtext'].includes(kind[ext]);
    if (file.size > this.site.get().maxUploadMb * 1024 * 1024) throw new BadRequestException('超出管理员配置的上传大小限制');
    let content = isText ? file.buffer.toString('utf8').replace(/^\uFEFF/, '') : '';
    if (kind[ext] === 'richtext') content = cleanHtml(content);
    if (content.length > 2_000_000) throw new BadRequestException('可编辑文档内容不能超过 2 MB');
    const mime = ext === '.pdf' ? 'application/pdf' : ext === '.docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : ext === '.html'||ext === '.htm' ? 'text/html' : 'text/markdown';
    const stored = await this.storage.upload(file.buffer,ext,mime);
    try {
      this.db.prepare(`INSERT INTO items(id,parent_id,name,kind,content,file_name,mime_type,created_at,updated_at,owner_id,storage_id,object_key)
        VALUES(?,?,?,?,?,?,?,?,?,?,?,?)`).run(id,parentId,raw.replace(/\.(md|markdown|html|htm)$/i,''),kind[ext],content,raw,mime,now,now,ownerId,stored.storageId,stored.objectKey);
    } catch (error) { await this.storage.delete(stored.storageId,stored.objectKey).catch(() => {}); throw error; }
    return this.find(ownerId,id);
  }

  async file(ownerId: string, id: string) {
    const row = this.row(ownerId,id);
    const key = row.object_key ?? row.file_path;
    if (!key) throw new NotFoundException('此文档没有上传的原始文件');
    // 可编辑文档的下载以数据库最新正文为准，避免用户编辑后下载到旧上传内容。
    const data = ['markdown','richtext'].includes(row.kind) ? Buffer.from(row.content,'utf8') : await this.storage.read(row.storage_id,key);
    return { data, name:row.file_name ?? 'document', mime:row.mime_type ?? 'application/octet-stream' };
  }

  private seed(ownerId: string) {
    const f1 = this.create(ownerId,{ kind: 'folder', name: '前端工程', content: '' });
    const f2 = this.create(ownerId,{ kind: 'folder', name: 'Vue 3 深入学习', parentId: f1.id });
    const f3 = this.create(ownerId,{ kind: 'folder', name: '后端与架构' });
    this.create(ownerId,{ kind: 'markdown', name: '欢迎使用拾页', content: `# 欢迎使用拾页 ✨\n\n> 把零散的知识，整理成自己的知识体系。\n\n## 从这里开始\n\n- 在左侧 **新建文件夹**，构建知识目录\n- 新建 **Markdown** 或 **富文本** 文档\n- 上传 **PDF / DOCX / MD / HTML** 文件并在线预览\n- 使用搜索、收藏、最近访问快速找回资料\n\n## 我的学习方法\n\n1. **收集**：把需要阅读的资料统一放进来。\n2. **整理**：按主题建立目录。\n3. **输出**：使用 Markdown 记录自己的理解。\n4. **回顾**：从收藏和最近访问中持续复习。\n\n\`\`\`ts\nconst learning = ['阅读', '实践', '总结', '复习'];\nconsole.log(learning.join(' → '));\n\`\`\`\n\n## 小贴士\n\n支持拖动左侧文档到文件夹，自动保存编辑内容。`, parentId: null });
    this.create(ownerId,{ kind: 'markdown', name: 'Composition API 学习笔记', parentId: f2.id, content: `# Composition API 学习笔记\n\nVue 3 推荐使用 **<script setup>** 编写组件。\n\n## 响应式系统\n\n使用 \`ref\` 管理基本类型，使用 \`reactive\` 管理对象。\n\n\`\`\`ts\nimport { ref, computed } from 'vue';\nconst count = ref(0);\nconst doubled = computed(() => count.value * 2);\n\`\`\`\n\n## 生命周期\n\n- \`onMounted\`：组件挂载后\n- \`onUnmounted\`：组件卸载时\n\n## 待学习\n\n- [ ] watchEffect 与 watch\n- [ ] Composable 设计模式\n- [ ] 性能优化\n` });
    this.create(ownerId,{ kind: 'richtext', name: '本周学习计划', parentId: f1.id, content: '<h2>本周学习计划</h2><p>保持专注，逐项完成。</p><ul><li><p>阅读 Vue 3 官方文档</p></li><li><p>实现一个 NestJS 模块</p></li><li><p>整理自己的技术笔记</p></li></ul><blockquote><p>每天进步一点点。</p></blockquote>' });
    this.create(ownerId,{ kind: 'markdown', name: 'NestJS 学习路线', parentId: f3.id, content: '# NestJS 学习路线\n\n## 基础知识\n\n- Module / Controller / Provider\n- 依赖注入\n- DTO 与 ValidationPipe\n\n## 进阶专题\n\n- 文件上传\n- 认证与授权\n- 数据库持久化\n- 日志与监控\n' });
    this.create(ownerId,{ kind: 'web', name: 'Vue 3 官方文档', parentId: f2.id, url: 'https://cn.vuejs.org/', content: '' });
  }
}
