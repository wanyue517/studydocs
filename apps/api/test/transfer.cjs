/* pnpm build 后运行；验证落盘续传、重复分片、校验和范围读取。 */
const {strict:assert} = require('node:assert');
const {createHash} = require('node:crypto');
const {mkdtempSync,rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const dir = mkdtempSync(join(tmpdir(),'studydocs-transfer-'));
process.env.STORAGE_DIR = dir;
const {DatabaseService} = require('../dist/database.service');
const {SiteService} = require('../dist/site.service');
const {StorageService} = require('../dist/storage.service');
const {DocumentsService} = require('../dist/documents.service');
const {TransferService} = require('../dist/transfer.service');

(async()=>{
  const db = new DatabaseService();
  try {
    db.db.prepare("INSERT INTO users(id,username,password_hash,role,created_at) VALUES('test','test','x','user',?)").run(new Date().toISOString());
    const site = new SiteService(db), storage = new StorageService(db), docs = new DocumentsService(db,storage,site);
    const file = Buffer.alloc(9*1024*1024+123,0x51);
    file.write('%PDF-1.7');
    let transfers = new TransferService(db,docs,site,storage);
    const session = await transfers.start('test',{name:'large.pdf',size:file.length});
    const chunk = file.subarray(0,session.chunkSize);
    const hash = (data)=>createHash('sha256').update(data).digest('hex');
    assert.throws(()=>transfers.chunk('test',session.id,0,chunk,'0'.repeat(64)),/校验/);
    transfers.chunk('test',session.id,0,chunk,hash(chunk));
    transfers = new TransferService(db,docs,site,storage);
    assert.equal((await transfers.status('test',session.id)).received,chunk.length);
    transfers.chunk('test',session.id,0,chunk,hash(chunk));
    assert.throws(()=>transfers.chunk('test',session.id,chunk.length+1,chunk,hash(chunk)),/偏移/);
    for (let offset=chunk.length;offset<file.length;offset+=session.chunkSize) {
      const part = file.subarray(offset,offset+session.chunkSize);
      transfers.chunk('test',session.id,offset,part,hash(part));
    }
    const nextStorage = storage.create({name:'新本地存储',provider:'local'});
    storage.activate(nextStorage.id);
    const item = await transfers.finish('test',session.id);
    assert.equal(item.storageId,'local-default','上传开始后切换默认存储不改变任务归属');
    assert.equal((await transfers.finish('test',session.id)).id,item.id);
    assert.equal((await docs.fileInfo('test',item.id)).size,file.length);
    assert.deepEqual(await docs.fileRange('test',item.id,4*1024*1024,4*1024*1024+1023),file.subarray(4*1024*1024,4*1024*1024+1024));
    await assert.rejects(()=>transfers.status('other',session.id),/不存在/);
    console.log('✓ 分片断电续传、重复请求、校验、完成幂等和范围读取通过');
  } finally {db.onModuleDestroy();rmSync(dir,{recursive:true,force:true});}
})().catch((error)=>{console.error(error);process.exitCode=1;});
