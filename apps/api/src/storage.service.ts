import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import OSS from 'ali-oss';
import { DatabaseService } from './database.service';

export type Provider = 'local' | 'r2' | 'minio' | 'qiniu' | 'aliyun';
interface ProfileRow { id:string; name:string; provider:Provider; config_json:string; secret_cipher:string|null; active:number; created_at:string }
export interface ProfileInput { name:string; provider:Provider; endpoint?:string; region?:string; bucket?:string; prefix?:string; accessKeyId?:string; secretAccessKey?:string; forcePathStyle?:boolean; }
const TYPES: Provider[] = ['local','r2','minio','qiniu','aliyun'];
const normalize = (raw: ProfileInput) => {
  if (!TYPES.includes(raw.provider) || !raw.name?.trim() || raw.name.length > 80) throw new BadRequestException('存储名称或类型无效');
  const config = {
    endpoint: String(raw.endpoint ?? '').trim(), region: String(raw.region ?? '').trim(), bucket:String(raw.bucket ?? '').trim(),
    prefix: String(raw.prefix ?? 'studydocs').trim().replace(/^\/+|\/+$/g, ''), accessKeyId:String(raw.accessKeyId ?? '').trim(),
    forcePathStyle:raw.provider === 'minio' ? true : Boolean(raw.forcePathStyle),
  };
  if (raw.provider !== 'local') {
    if (!config.region || !config.bucket || !config.accessKeyId || !config.endpoint) throw new BadRequestException('云存储必须提供 Endpoint、Region、Bucket 和 Access Key');
    let url: URL;
    try { url = new URL(config.endpoint); } catch { throw new BadRequestException('Endpoint 不是有效 URL'); }
    if (!['https:','http:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) throw new BadRequestException('Endpoint 格式不合法');
    if (url.protocol !== 'https:' && raw.provider !== 'minio') throw new BadRequestException('非 MinIO 存储必须使用 HTTPS Endpoint');
  }
  if (config.prefix.includes('..') || !/^[a-zA-Z0-9/_-]*$/.test(config.prefix)) throw new BadRequestException('存储前缀仅支持英文、数字、/、_、-');
  return config;
};
@Injectable()
export class StorageService {
  private readonly localDir: string;
  constructor(private readonly database: DatabaseService) {
    this.localDir = join(database.root, 'uploads');
    mkdirSync(this.localDir, { recursive:true });
  }
  private key() {
    const raw = process.env.STORAGE_ENCRYPTION_KEY;
    if (!raw || !/^[0-9a-f]{64}$/i.test(raw)) throw new BadRequestException('云存储需要 STORAGE_ENCRYPTION_KEY（64 位十六进制密钥），请在服务端环境变量设置且永久保管');
    return Buffer.from(raw, 'hex');
  }
  private encrypt(secret: string) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map((x) => x.toString('base64')).join('.');
  }
  private decrypt(input: string | null) {
    if (!input) throw new BadRequestException('存储配置缺少 Secret Key');
    const [iv, tag, content] = input.split('.').map((x) => Buffer.from(x, 'base64'));
    const decipher = createDecipheriv('aes-256-gcm', this.key(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(content), decipher.final()]).toString('utf8');
  }
  private find(id: string) {
    const row = this.database.db.prepare('SELECT * FROM storage_profiles WHERE id=?').get(id) as ProfileRow | undefined;
    if (!row) throw new NotFoundException('存储配置不存在，历史文件需要保留原配置');
    return row;
  }
  private publicProfile(row: ProfileRow) {
    return { id:row.id, name:row.name, provider:row.provider, active:!!row.active,
      ...JSON.parse(row.config_json), hasSecret:!!row.secret_cipher, createdAt:row.created_at };
  }
  list() { return (this.database.db.prepare('SELECT * FROM storage_profiles ORDER BY active DESC, created_at').all() as unknown as ProfileRow[]).map((x) => this.publicProfile(x)); }
  active() {
    const row = this.database.db.prepare('SELECT * FROM storage_profiles WHERE active=1 LIMIT 1').get() as ProfileRow | undefined;
    if (!row) throw new BadRequestException('管理员尚未指定默认存储配置');
    return row;
  }
  create(input: ProfileInput) {
    const config = normalize(input);
    if (input.provider !== 'local' && !input.secretAccessKey) throw new BadRequestException('请填写 Secret Key');
    const id = randomUUID();
    this.database.db.prepare('INSERT INTO storage_profiles(id,name,provider,config_json,secret_cipher,active,created_at) VALUES(?,?,?,?,?,0,?)')
      .run(id, input.name.trim(), input.provider, JSON.stringify(config), input.provider === 'local' ? null : this.encrypt(input.secretAccessKey!), new Date().toISOString());
    return this.publicProfile(this.find(id));
  }
  update(id: string, input: ProfileInput) {
    const old = this.find(id), config = normalize(input);
    const references = this.database.db.prepare('SELECT COUNT(*) AS n FROM items WHERE storage_id=?').get(id) as {n:number};
    if (references.n && old.provider !== input.provider) throw new ConflictException('该配置已存放文件，不能修改存储厂商；请新建配置并切换默认');
    if (references.n) {
      const previous = JSON.parse(old.config_json);
      if (['endpoint','region','bucket','prefix','forcePathStyle'].some((key) => (config as unknown as Record<string,unknown>)[key] !== (previous[key] ?? (key === 'prefix' ? 'studydocs' : key === 'forcePathStyle' ? false : ''))))
        throw new ConflictException('该存储已有历史文件，不能修改 Endpoint、Region、Bucket 或对象路径；请新建配置后切换默认存储');
    }
    const secret = input.provider === 'local' ? null : input.secretAccessKey ? this.encrypt(input.secretAccessKey) : old.secret_cipher;
    if (input.provider !== 'local' && !secret) throw new BadRequestException('请配置 Secret Key');
    this.database.db.prepare('UPDATE storage_profiles SET name=?, provider=?, config_json=?, secret_cipher=? WHERE id=?')
      .run(input.name.trim(), input.provider, JSON.stringify(config), secret, id);
    return this.publicProfile(this.find(id));
  }
  activate(id: string) {
    this.find(id);
    this.database.db.exec('BEGIN IMMEDIATE');
    try {
      this.database.db.prepare('UPDATE storage_profiles SET active=0').run();
      this.database.db.prepare('UPDATE storage_profiles SET active=1 WHERE id=?').run(id);
      this.database.db.exec('COMMIT');
    } catch (e) { this.database.db.exec('ROLLBACK'); throw e; }
    return this.list();
  }
  remove(id: string) {
    const p = this.find(id);
    if (p.active) throw new ConflictException('请先切换默认存储，再删除配置');
    const refs = this.database.db.prepare('SELECT COUNT(*) AS n FROM items WHERE storage_id=?').get(id) as {n:number};
    const logo = this.database.db.prepare('SELECT data FROM site_settings WHERE id=1').get() as {data:string};
    const settings = JSON.parse(logo.data);
    const pending = this.database.db.prepare('SELECT COUNT(*) AS n FROM storage_gc_jobs WHERE storage_id=?').get(id) as {n:number};
    if (refs.n || pending.n || settings.logoStorageId === id)
      throw new ConflictException('该存储仍关联历史文档、Logo 或待清理文件，不允许删除');
    this.database.db.prepare('DELETE FROM storage_profiles WHERE id=?').run(id);
    return {success:true};
  }
  private location(key: string) {
    if (!/^[a-zA-Z0-9/_-]+\.[a-zA-Z0-9]+$/.test(key) || key.includes('..')) throw new BadRequestException('文件路径无效');
    const absolute = resolve(this.localDir, key);
    if (!absolute.startsWith(this.localDir + sep)) throw new BadRequestException('文件路径非法');
    return absolute;
  }
  private async clientUpload(p: ProfileRow, key: string, data: Buffer, mime: string) {
    if (p.provider === 'local') { const absolute = this.location(key); mkdirSync(resolve(absolute,'..'), {recursive:true}); writeFileSync(absolute, data, {flag:'wx'}); return; }
    const cfg = JSON.parse(p.config_json);
    if (p.provider === 'aliyun') {
      const ali = new OSS({ region:cfg.region, endpoint:cfg.endpoint, bucket:cfg.bucket,
        accessKeyId:cfg.accessKeyId, accessKeySecret:this.decrypt(p.secret_cipher), authorizationV4:true });
      await ali.put(key, data, {headers:{'Content-Type':mime}});
    } else {
      const sdk = this.s3(p);
      await sdk.send(new PutObjectCommand({ Bucket:cfg.bucket, Key:key, Body:data, ContentType:mime }));
    }
  }
  private s3(p: ProfileRow) {
    const c = JSON.parse(p.config_json);
    return new S3Client({ region:c.region || 'auto', endpoint:c.endpoint,
      forcePathStyle:Boolean(c.forcePathStyle), credentials:{ accessKeyId:c.accessKeyId, secretAccessKey:this.decrypt(p.secret_cipher) } });
  }
  async upload(data: Buffer, ext: string, mime: string) {
    const p = this.active(), cfg = JSON.parse(p.config_json);
    const key = [cfg.prefix || 'studydocs', new Date().toISOString().slice(0,7), `${randomUUID()}${ext}`].join('/');
    await this.clientUpload(p, key, data, mime);
    return { storageId:p.id, objectKey:key };
  }
  async read(storageId: string | null, key: string) {
    if (!storageId) { const path = this.location(key); if (!existsSync(path)) throw new NotFoundException('本地旧文件不存在'); return readFileSync(path); }
    const p = this.find(storageId);
    if (p.provider === 'local') { const path = this.location(key); if (!existsSync(path)) throw new NotFoundException('本地文件不存在'); return readFileSync(path); }
    const cfg = JSON.parse(p.config_json);
    try {
      if (p.provider === 'aliyun') {
        const ali = new OSS({region:cfg.region,endpoint:cfg.endpoint,bucket:cfg.bucket,accessKeyId:cfg.accessKeyId,accessKeySecret:this.decrypt(p.secret_cipher),authorizationV4:true});
        const file = await ali.get(key);
        return Buffer.from(file.content as Buffer);
      }
      const result = await this.s3(p).send(new GetObjectCommand({Bucket:cfg.bucket,Key:key}));
      if (!result.Body) throw new Error('空文件流');
      return Buffer.from(await result.Body.transformToByteArray());
    } catch { throw new NotFoundException('云端文件读取失败，请检查原存储配置及网络'); }
  }
  async delete(storageId: string | null, key: string) {
    if (!storageId || this.find(storageId).provider === 'local') {
      const path = this.location(key);
      if (existsSync(path)) unlinkSync(path);
      return;
    }
    const p = this.find(storageId), c = JSON.parse(p.config_json);
    if (p.provider === 'aliyun') {
      const ali = new OSS({region:c.region,endpoint:c.endpoint,bucket:c.bucket,accessKeyId:c.accessKeyId,accessKeySecret:this.decrypt(p.secret_cipher),authorizationV4:true});
      await ali.delete(key);
    } else await this.s3(p).send(new DeleteObjectCommand({Bucket:c.bucket, Key:key}));
  }
  async test(id: string) {
    const p = this.find(id);
    const key = `studydocs/healthcheck/${randomUUID()}.txt`;
    await this.clientUpload(p, key, Buffer.from('studydocs-storage-check'), 'text/plain');
    try { const data = await this.read(id, key); if (data.toString() !== 'studydocs-storage-check') throw new Error('读取内容不一致'); }
    finally { await this.delete(id, key); }
    return { success:true, message:'上传、读取、删除测试成功' };
  }
}
