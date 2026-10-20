const {strict:assert} = require('node:assert');
const {mkdtempSync,rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const dir = mkdtempSync(join(tmpdir(),'studydocs-signing-'));
process.env.STORAGE_DIR = dir;
process.env.STORAGE_ENCRYPTION_KEY = '1'.repeat(64);
const {DatabaseService} = require('../dist/database.service');
const {StorageService} = require('../dist/storage.service');
(async()=>{
  const db = new DatabaseService();
  try {
    const storage = new StorageService(db);
    const r2 = storage.create({name:'R2',provider:'r2',endpoint:'https://example.r2.cloudflarestorage.com',region:'auto',bucket:'documents',accessKeyId:'test-access',secretAccessKey:'test-secret'});
    const r2Part = new URL(await storage.signDirectPart(r2.id,'studydocs/test.pdf','upload-123',2));
    assert.equal(r2Part.searchParams.get('partNumber'),'2');
    assert.equal(r2Part.searchParams.get('uploadId'),'upload-123');
    assert.ok(r2Part.searchParams.has('X-Amz-Signature'));
    assert.ok(!r2Part.href.includes('test-secret'));
    const r2Get = new URL(await storage.signedDownloadUrl(r2.id,'studydocs/test.pdf'));
    assert.ok(r2Get.searchParams.has('X-Amz-Signature'));
    const oss = storage.create({name:'OSS',provider:'aliyun',endpoint:'https://oss-cn-hangzhou.aliyuncs.com',region:'oss-cn-hangzhou',bucket:'examplebucket',accessKeyId:'test-access',secretAccessKey:'test-secret'});
    const ossPart = new URL(await storage.signDirectPart(oss.id,'studydocs/test.pdf','oss-upload',1));
    assert.equal(ossPart.searchParams.get('partNumber'),'1');
    assert.equal(ossPart.searchParams.get('uploadId'),'oss-upload');
    assert.ok(ossPart.searchParams.has('x-oss-signature'));
    assert.ok(!ossPart.href.includes('test-secret'));
    const ossGet = new URL(await storage.signedDownloadUrl(oss.id,'studydocs/test.pdf'));
    assert.ok(ossGet.searchParams.has('x-oss-signature'));
    console.log('✓ S3 兼容存储和阿里云 OSS 的分片/下载签名通过');
  } finally {db.onModuleDestroy();rmSync(dir,{recursive:true,force:true});}
})().catch((error)=>{console.error(error);process.exitCode=1;});
