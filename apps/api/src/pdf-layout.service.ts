import { BadRequestException, ConflictException, Injectable, OnModuleDestroy } from '@nestjs/common';
import { spawn, type ChildProcess } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { mkdir, open, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createInterface } from 'node:readline';
import type { PdfLayoutJob, PdfOutlineEntry } from '@studydocs/shared';
import { DatabaseService } from './database.service';
import { DocumentsService } from './documents.service';
import { validateEntries } from './pdf-outline.service';
interface Row { id: string; owner_id: string; item_id: string; status: PdfLayoutJob['status']; progress: number; page_count: number; error: string; message: string; entries: string; version: number; force_ocr: number }
@Injectable()
export class PdfLayoutService implements OnModuleDestroy {
  private children = new Set<ChildProcess>();
  private stopping = false;
  constructor(private readonly database: DatabaseService, private readonly docs: DocumentsService) {
    database.db.exec(`CREATE TABLE IF NOT EXISTS pdf_layout_jobs (
      id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
      status TEXT NOT NULL, progress INTEGER NOT NULL DEFAULT 0, page_count INTEGER NOT NULL DEFAULT 0,
      error TEXT NOT NULL DEFAULT '', message TEXT NOT NULL DEFAULT '', entries TEXT NOT NULL DEFAULT '[]',
      version INTEGER NOT NULL, force_ocr INTEGER NOT NULL DEFAULT 0
    ); CREATE UNIQUE INDEX IF NOT EXISTS idx_layout_running ON pdf_layout_jobs(item_id) WHERE status='running';`);
    database.db.prepare("UPDATE pdf_layout_jobs SET status='failed',error='服务已重启，可继续解析并复用缓存' WHERE status='running'").run();
  }
  private assertPdf(owner: string, id: string) {
    const item = this.docs.find(owner, id);
    if (item.kind !== 'pdf') throw new BadRequestException('仅 PDF 支持版面解析');
    return item;
  }
  get(owner: string, id: string): PdfLayoutJob | null {
    const item = this.assertPdf(owner, id);
    const row = this.database.db.prepare('SELECT * FROM pdf_layout_jobs WHERE item_id=? AND owner_id=? ORDER BY rowid DESC LIMIT 1').get(id, owner) as Row | undefined;
    return row ? { forceOcr: !!row.force_ocr, id: row.id, status: row.status, progress: row.progress, pageCount: row.page_count, message: row.message, error: item.version !== row.version ? '文档已更新，请重新解析' : row.error, entries: item.version !== row.version ? [] : JSON.parse(row.entries) } : null;
  }
  start(owner: string, id: string, input: { forceOcr?: boolean }) {
    const item = this.assertPdf(owner, id);
    if (!input || (input.forceOcr !== undefined && typeof input.forceOcr !== 'boolean')) throw new BadRequestException('OCR 选项无效');
    if (this.stopping) throw new ConflictException('服务正在停止，请稍后重试');
    if (this.database.db.prepare("SELECT id FROM pdf_layout_jobs WHERE status='running'").get()) throw new ConflictException('版面解析较占资源，请等待当前任务完成');
    const jobId = randomUUID();
    this.database.db.prepare("INSERT INTO pdf_layout_jobs(id,owner_id,item_id,status,version,force_ocr) VALUES(?,?,?,'running',?,?)").run(jobId, owner, id, item.version, input.forceOcr ? 1 : 0);
    setImmediate(() => { void this.run(owner, id, jobId, item.version, !!input.forceOcr); });
    return this.get(owner, id);
  }
  private async run(owner: string, id: string, job: string, version: number, force: boolean) {
    const folder = join(this.database.root, 'pdf-layout', id);
    const source = join(folder, `${job}.pdf`);
    try {
      await mkdir(folder, { recursive: true });
      this.update(job, '正在读取 PDF 原文件');
      const info = await this.docs.fileInfo(owner, id);
      if (!Number.isSafeInteger(info.size) || info.size < 1) throw new Error('PDF 文件大小无效');
      if (info.size > 100 * 1024 * 1024) throw new Error('版面解析暂支持最大 100MB 的 PDF，请拆分后处理');
      const hash = createHash('sha256');
      const handle = await open(source, 'wx');
      try {
        for (let offset = 0; offset < info.size; offset += 4 * 1024 * 1024) {
          if (this.stopping) throw new Error('服务已停止，可继续解析');
          const data = await this.docs.fileRange(owner, id, offset, Math.min(info.size - 1, offset + 4 * 1024 * 1024 - 1));
          if (data.length !== Math.min(4 * 1024 * 1024, info.size - offset)) throw new Error('原文件读取不完整，请重试');
          hash.update(data); await handle.writeFile(data);
        }
      } finally { await handle.close(); }
      if (this.stopping) throw new Error('服务正在停止');
      if (this.assertPdf(owner, id).version !== version) throw new Error('文档已更新，请重新解析');
      const cache = join(folder, hash.digest('hex'));
      this.update(job, '正在初始化 Docling 版面模型，首次需加载模型');
      let entries: PdfOutlineEntry[] = [];
      let done = false;
      await new Promise<void>((accept, reject) => {
        const child = this.launch(source, cache, force);
        this.children.add(child);
        let failure = '';
        let diagnostic = '';
        const timer = setTimeout(() => { failure = '版面解析超过 30 分钟，已保留缓存，可继续解析'; child.kill(); }, 30 * 60 * 1000);
        child.stderr!.on('data', chunk => { diagnostic = (diagnostic + String(chunk)).slice(-4000); });
        const lines = createInterface({ input: child.stdout!, crlfDelay: Infinity });
        lines.on('line', line => {
          if (failure || this.stopping) return;
          try {
            if (line.length > 2_000_000) throw new Error('解析输出过大');
            const event = JSON.parse(line);
            if (event.kind === 'error') throw new Error(event.message);
            if (event.kind === 'page' && Number.isInteger(event.page)) this.update(job, `已处理第 ${event.page} 页，正在恢复层级并保存批次`);
            if (event.kind === 'phase') this.update(job, String(event.message).slice(0, 200));
            if (event.kind === 'batch' || event.kind === 'ready' || event.kind === 'done') {
              if (!Number.isInteger(event.pageCount) || event.pageCount < 1 || event.pageCount > 2000) throw new Error('PDF 页数无效');
              if (event.kind === 'batch') {
                if (!Number.isInteger(event.completedPages) || event.completedPages < 1 || event.completedPages > event.pageCount) throw new Error('批次进度无效');
                entries.push(...validateEntries(event.entries, event.pageCount));
                if (entries.length > 3000) throw new Error('目录项过多，请拆分 PDF');
              }
              this.database.db.prepare('UPDATE pdf_layout_jobs SET entries=?,page_count=?,progress=?,message=? WHERE id=?').run(JSON.stringify(entries), event.pageCount, event.kind === 'batch' ? Math.floor(event.completedPages / event.pageCount * 95) : event.kind === 'done' ? 99 : 0, event.cached ? '正在复用已完成批次' : '正在分析标题层级', job);
              if (event.kind === 'done') done = true;
            }
          } catch (e) { failure = (e as Error).message; child.kill(); }
        });
        child.once('error', () => { failure = '无法启动 Python，请安装 Docling 解析环境并设置 PDF_LAYOUT_PYTHON'; });
        child.once('close', code => {
          clearTimeout(timer); lines.close(); this.children.delete(child);
          if (code === 0 && done && !failure) accept();
          else {
            console.warn(`PDF layout job ${job} failed: ${diagnostic || failure}`);
            reject(new Error(/ModuleNotFoundError|ImportError/.test(diagnostic) ? 'Docling 依赖未安装或版本不兼容，请按 services/pdf-layout/README.md 安装' : failure || 'Docling 未完成解析，请检查模型文件和服务日志后继续'));
          }
        });
      });
      if (this.stopping) throw new Error('服务正在停止');
      if (this.assertPdf(owner, id).version !== version) throw new Error('文档已更新，识别结果未应用，请重新解析');
      await rm(source, { force: true });
      // Keep results separate from edited drafts; the user explicitly imports them for review.
      this.database.db.prepare("UPDATE pdf_layout_jobs SET status='completed',progress=100,message=? WHERE id=?").run(entries.length ? '解析完成，请预览并编辑候选目录' : '未检测到标题，可手工编辑或强制 OCR 后重试', job);
    } catch (e) {
      if (!this.stopping) this.database.db.prepare("UPDATE pdf_layout_jobs SET status='failed',error=? WHERE id=?").run((e instanceof Error ? e.message : '版面解析失败').slice(0,300), job);
    } finally { await rm(source, { force: true }).catch(() => {}); }
  }
  private launch(source: string, cache: string, force: boolean) {
    return spawn(process.env.PDF_LAYOUT_PYTHON || 'python3', [resolve(__dirname, '../../../services/pdf-layout/worker.py'), '--source', source, '--cache', cache, ...(force ? ['--force-ocr'] : [])], { stdio: ['ignore', 'pipe', 'pipe'] });
  }
  private update(job: string, message: string) { this.database.db.prepare('UPDATE pdf_layout_jobs SET message=? WHERE id=?').run(message, job); }
  onModuleDestroy() { this.stopping = true; for (const child of this.children) child.kill(); }
}
