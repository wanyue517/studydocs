/* 可选：在真实 Bucket 上创建并删除一个极小的临时文件，验证云端预签名直传。 */
require('node:process').loadEnvFile('.env');
const {strict:assert} = require('node:assert');
const {DatabaseService} = require('../dist/database.service');
const {StorageService} = require('../dist/storage.service');
(async()=>{
  const db = new DatabaseService();
  const storage = new StorageService(db);
  const profile = storage.active();
  if (profile.provider === 'local') throw new Error('默认存储是本地，无法测试云端直传');
  const key = storage.objectKey('.pdf',profile.id);
  const data = Buffer.from('%PDF-1.7\ncloud-direct-upload-test');
  let uploadId,completed=false;
  try {
    uploadId = await storage.beginDirectUpload(profile.id,key,'application/pdf');
    const url = await storage.signDirectPart(profile.id,key,uploadId,1);
    const origin = process.argv[2] || 'http://localhost:5173';
    const preflight = await fetch(url,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'content-type'}});
    const allowedOrigin = preflight.headers.get('access-control-allow-origin');
    const allowedMethods = preflight.headers.get('access-control-allow-methods');
    const allowedHeaders = preflight.headers.get('access-control-allow-headers');
    console.log(`浏览器 PUT 预检：${preflight.status}，Origin=${allowedOrigin || '未允许'}，Methods=${allowedMethods || '未返回'}，Headers=${allowedHeaders || '未返回'}`);
    if (!preflight.ok || allowedOrigin !== '*' && allowedOrigin !== origin) throw new Error('Bucket 未允许当前网站来源的浏览器直传，请配置 OSS CORS');
    const result = await fetch(url,{method:'PUT',body:data});
    assert.equal(result.status,200,`签名 URL 上传失败（${result.status}）`);
    const parts = await storage.directParts(profile.id,key,uploadId);
    assert.equal(parts.length,1);
    assert.equal(parts[0].size,data.length);
    await storage.completeDirectUpload(profile.id,key,uploadId,parts);
    completed = true;
    assert.equal(await storage.size(profile.id,key),data.length);
    assert.deepEqual(await storage.readRange(profile.id,key,0,data.length-1),data);
    const download = await fetch(await storage.signedDownloadUrl(profile.id,key),{headers:{Origin:origin,Range:`bytes=0-${data.length-1}`}});
    assert.equal(download.status,206);
    assert.equal(download.headers.get('access-control-allow-origin'),origin);
    assert.match(download.headers.get('access-control-expose-headers') || '',/content-range/i);
    assert.equal(download.headers.get('content-range'),`bytes 0-${data.length-1}/${data.length}`);
    assert.deepEqual(Buffer.from(await download.arrayBuffer()),data);
    console.log(`✓ ${profile.provider} 真实云端预签名分片上传、读取、清理通过`);
  } finally {
    if (completed) await storage.delete(profile.id,key);
    else if (uploadId) await storage.abortDirectUpload(profile.id,key,uploadId).catch(()=>{});
    db.onModuleDestroy();
  }
})().catch((error)=>{console.error({name:error.name,message:error.message,status:error.status,code:error.code});process.exitCode=1;});
