import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createHash, randomUUID } from 'node:crypto';
import { closeSync, existsSync, fsyncSync, mkdirSync, openSync, readSync, rmSync, writeSync } from 'node:fs';
import { extname, join } from 'node:path';
import { DatabaseService } from './database.service';
import { DocumentsService } from './documents.service';
import { SiteService } from './site.service';
import { StorageService } from './storage.service';

const CHUNK_SIZE = 4 * 1024 * 1024;
const CLOUD_CHUNK_SIZE = 8 * 1024 * 1024;
interface Session { id:string; owner_id:string; file_name:string; parent_id:string|null; size:number; chunk_size:number; received:number; status:string; item_id:string|null; storage_id:string|null; object_key:string|null; upload_id:string|null; }

@Injectable()
export class TransferService {
  private readonly dir: string;
  private readonly finalizing = new Set<string>();
  constructor(private readonly database:DatabaseService, private readonly documents:DocumentsService, private readonly site:SiteService, private readonly storage:StorageService) {
    this.dir = join(database.root, 'upload-parts');
    mkdirSync(this.dir, {recursive:true});
    const expired = database.db.prepare('SELECT id,storage_id,object_key,upload_id,status FROM upload_sessions WHERE created_at < ?').all(new Date(Date.now()-30*24*60*60*1000).toISOString()) as unknown as Pick<Session,'id'|'storage_id'|'object_key'|'upload_id'|'status'>[];
    for (const row of expired) {
      rmSync(this.path(row.id),{force:true});
      if (row.status === 'uploading' && row.storage_id && row.object_key && row.upload_id)
        void this.storage.abortDirectUpload(row.storage_id,row.object_key,row.upload_id).catch(()=>{});
    }
    database.db.prepare('DELETE FROM upload_sessions WHERE created_at < ?').run(new Date(Date.now()-30*24*60*60*1000).toISOString());
  }
  private path(id:string) { return join(this.dir, id); }
  private row(ownerId:string,id:string) {
    const row = this.database.db.prepare('SELECT * FROM upload_sessions WHERE id=? AND owner_id=?').get(id,ownerId) as Session|undefined;
    if (!row) throw new NotFoundException('续传任务不存在');
    return row;
  }
  async start(ownerId:string, input:{id?:string;name:string;size:number;parentId?:string|null}) {
    const name = input?.name;
    const size = input?.size;
    if (typeof name !== 'string' || !name || name.length > 255 || !Number.isSafeInteger(size) || size <= 0)
      throw new BadRequestException('文件名或大小无效');
    if (!['.md','.markdown','.html','.htm','.pdf','.docx'].includes(extname(name).toLowerCase()))
      throw new BadRequestException('文件类型不支持');
    if (size > this.site.get().maxUploadMb * 1024 * 1024) throw new BadRequestException('超出管理员配置的上传大小限制');
    const id = input.id ?? randomUUID();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) throw new BadRequestException('续传标识无效');
    const existing = this.database.db.prepare('SELECT * FROM upload_sessions WHERE id=?').get(id) as Session|undefined;
    if (existing) {
      if (existing.owner_id !== ownerId || existing.file_name !== name || existing.size !== size || existing.parent_id !== (input.parentId ?? null))
        throw new ConflictException('续传任务信息不一致');
      return this.status(ownerId,id);
    }
    const active = this.storage.active();
    const cloud = active.provider !== 'local';
    const key = cloud ? this.storage.objectKey(extname(name).toLowerCase(),active.id) : null;
    const ext = extname(name).toLowerCase();
    const mime = ext === '.pdf' ? 'application/pdf' : ext === '.docx' ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' : ext === '.html'||ext === '.htm' ? 'text/html' : 'text/markdown';
    const uploadId = cloud ? await this.storage.beginDirectUpload(active.id,key!,mime) : null;
    try {
      this.database.db.prepare('INSERT INTO upload_sessions(id,owner_id,file_name,parent_id,size,chunk_size,created_at,storage_id,object_key,upload_id) VALUES(?,?,?,?,?,?,?,?,?,?)')
        .run(id,ownerId,name,input.parentId ?? null,size,cloud?CLOUD_CHUNK_SIZE:CHUNK_SIZE,new Date().toISOString(),active.id,key,uploadId);
    } catch (error) {
      if (cloud && uploadId) await this.storage.abortDirectUpload(active.id,key!,uploadId).catch(()=>{});
      throw error;
    }
    return this.status(ownerId,id);
  }
  async status(ownerId:string,id:string) {
    const row = this.row(ownerId,id);
    const storageChanged = !!row.storage_id && row.storage_id !== this.storage.active().id;
    if (storageChanged && row.status === 'uploading' && row.received === 0)
      return {id:row.id,received:0,size:row.size,chunkSize:row.chunk_size,status:row.status,itemId:row.item_id,mode:row.upload_id?'cloud':'local',storageChanged};
    let received = row.received;
    if (row.storage_id && row.object_key && row.upload_id && row.status === 'uploading') {
      const parts = await this.storage.directParts(row.storage_id,row.object_key,row.upload_id).catch(async(error)=>{
        if (await this.storage.size(row.storage_id!,row.object_key!).catch(()=>-1) === row.size) return null;
        throw error;
      });
      received = 0;
      if (!parts) received = row.size;
      else for (let number=1;number<=Math.ceil(row.size/row.chunk_size);number++) {
          const part = parts.find((x)=>x.number===number);
          if (!part || part.size !== Math.min(row.chunk_size,row.size-received)) break;
          received += part.size;
      }
      if (received !== row.received) this.database.db.prepare('UPDATE upload_sessions SET received=? WHERE id=?').run(received,id);
    }
    return {id:row.id,received,size:row.size,chunkSize:row.chunk_size,status:row.status,itemId:row.item_id,mode:row.upload_id?'cloud':'local',storageChanged};
  }
  chunk(ownerId:string,id:string,offset:number,data:Buffer,digest:string) {
    const row = this.row(ownerId,id);
    if (row.status !== 'uploading') throw new ConflictException('上传任务已结束');
    if (row.upload_id) throw new ConflictException('此文件使用云端直传，请刷新页面后重试');
    if (!Number.isSafeInteger(offset) || offset < 0 || !data.length || data.length > CHUNK_SIZE || offset + data.length > row.size)
      throw new BadRequestException('分片范围无效');
    if (!/^[a-f0-9]{64}$/i.test(digest) || createHash('sha256').update(data).digest('hex') !== digest.toLowerCase())
      throw new BadRequestException('分片校验失败');
    if (offset < row.received) {
      if (offset + data.length > row.received || !existsSync(this.path(id))) throw new ConflictException('分片偏移冲突');
      const old = Buffer.alloc(data.length), fd = openSync(this.path(id),'r');
      try { readSync(fd,old,0,old.length,offset); } finally { closeSync(fd); }
      if (!old.equals(data)) throw new ConflictException('重复分片内容不一致');
      return this.status(ownerId,id);
    }
    if (offset !== row.received || data.length !== Math.min(CHUNK_SIZE,row.size-offset)) throw new ConflictException('分片偏移冲突');
    const fd = openSync(this.path(id),existsSync(this.path(id))?'r+':'w+');
    try { writeSync(fd,data,0,data.length,offset); fsyncSync(fd); } finally { closeSync(fd); }
    this.database.db.prepare('UPDATE upload_sessions SET received=? WHERE id=?').run(offset+data.length,id);
    return this.status(ownerId,id);
  }
  async signPart(ownerId:string,id:string,number:number) {
    const row = this.row(ownerId,id);
    if (row.status !== 'uploading' || !row.storage_id || !row.object_key || !row.upload_id) throw new ConflictException('不是可直传的云端任务');
    if (!Number.isSafeInteger(number) || number < 1 || number > Math.ceil(row.size/row.chunk_size)) throw new BadRequestException('分片编号无效');
    return {url:await this.storage.signDirectPart(row.storage_id,row.object_key,row.upload_id,number)};
  }
  async finish(ownerId:string,id:string) {
    const row = this.row(ownerId,id);
    if (row.status === 'done' && row.item_id) return this.documents.find(ownerId,row.item_id);
    try {
      const item = this.documents.find(ownerId,id);
      this.database.db.prepare("UPDATE upload_sessions SET status='done',item_id=? WHERE id=?").run(id,id);
      rmSync(this.path(id),{force:true});
      return item;
    } catch (error) { if (!(error instanceof NotFoundException)) throw error; }
    if (row.storage_id && row.object_key && row.upload_id) {
      if (this.finalizing.has(id)) throw new ConflictException('文件正在保存，请稍后重试');
      this.finalizing.add(id);
      try {
        const parts = await this.storage.directParts(row.storage_id,row.object_key,row.upload_id).catch(async(error)=>{
          if (await this.storage.size(row.storage_id!,row.object_key!).catch(()=>-1) === row.size) return null;
          throw error;
        });
        if (parts) {
          const count = Math.ceil(row.size/row.chunk_size);
          if (parts.length !== count || parts.some((part,index)=>part.number !== index+1 || part.size !== Math.min(row.chunk_size,row.size-index*row.chunk_size)))
            throw new ConflictException('云端分片尚未上传完整');
          await this.storage.completeDirectUpload(row.storage_id,row.object_key,row.upload_id,parts);
        }
        if (await this.storage.size(row.storage_id,row.object_key) !== row.size) throw new ConflictException('云端文件大小不一致');
        const item = await this.documents.completeCloudUpload(ownerId,row.file_name,row.size,row.storage_id,row.object_key,row.parent_id,id);
        this.database.db.prepare("UPDATE upload_sessions SET status='done',item_id=?,received=? WHERE id=?").run(item.id,row.size,id);
        return item;
      } finally { this.finalizing.delete(id); }
    }
    if (row.received !== row.size || !existsSync(this.path(id))) throw new ConflictException('文件尚未上传完整');
    if (this.finalizing.has(id)) throw new ConflictException('文件正在保存，请稍后重试');
    this.finalizing.add(id);
    try {
      const item = await this.documents.uploadPath(ownerId,row.file_name,row.size,this.path(id),row.parent_id,id,row.storage_id ?? undefined);
      this.database.db.prepare("UPDATE upload_sessions SET status='done',item_id=? WHERE id=?").run(item.id,id);
      rmSync(this.path(id),{force:true});
      return item;
    } finally { this.finalizing.delete(id); }
  }
}
