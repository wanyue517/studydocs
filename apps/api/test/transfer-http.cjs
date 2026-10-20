const {strict:assert} = require('node:assert');
const {createHash} = require('node:crypto');
const {mkdtempSync,rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
require('reflect-metadata');
const dir = mkdtempSync(join(tmpdir(),'studydocs-transfer-http-'));
process.env.STORAGE_DIR = dir;
process.env.ADMIN_USERNAME = 'httpadmin';
process.env.ADMIN_PASSWORD = 'InitialPassword123!';
const {NestFactory} = require('@nestjs/core');
const {AppModule} = require('../dist/module');

(async()=>{
  const app = await NestFactory.create(AppModule,{logger:false});
  try {
    app.setGlobalPrefix('api');
    await app.listen(0,'127.0.0.1');
    const base = `http://127.0.0.1:${app.getHttpServer().address().port}/api`;
    const login = await fetch(`${base}/auth/login`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({username:'httpadmin',password:'InitialPassword123!'})});
    assert.equal(login.status,201);
    const cookie = login.headers.get('set-cookie').split(';')[0];
    const request = (path,options={})=>fetch(`${base}${path}`,{...options,headers:{Cookie:cookie,...options.headers}});
    const file = Buffer.alloc(4*1024*1024+1024,0x78);
    file.write('%PDF-1.7\n');
    const start = await request('/items/upload/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'http.pdf',size:file.length})});
    assert.equal(start.status,201);
    const session = await start.json();
    for (let offset=0;offset<file.length;offset+=session.chunkSize) {
      const body = file.subarray(offset,offset+session.chunkSize);
      const hash = createHash('sha256').update(body).digest('hex');
      const chunk = await request(`/items/upload/sessions/${session.id}/chunk?offset=${offset}`,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Chunk-SHA256':hash},body});
      assert.equal(chunk.status,201,await chunk.text());
    }
    const finish = await request(`/items/upload/sessions/${session.id}/finish`,{method:'POST'});
    assert.equal(finish.status,201);
    const item = await finish.json();
    const range = await request(`/items/${item.id}/file?download=1`,{headers:{Range:'bytes=0-99'}});
    assert.equal(range.status,206);
    assert.equal(range.headers.get('content-range'),`bytes 0-99/${file.length}`);
    assert.deepEqual(Buffer.from(await range.arrayBuffer()),file.subarray(0,100));
    const finalRange = await request(`/items/${item.id}/file?download=1`,{headers:{Range:'bytes=0-4194303'}});
    assert.equal(finalRange.status,206);
    assert.equal(finalRange.headers.get('content-range'),`bytes 0-4194303/${file.length}`);
    assert.deepEqual(Buffer.from(await finalRange.arrayBuffer()),file.subarray(0,4194304));
    const {createServer} = await import('../../web/node_modules/vite/dist/node/index.js');
    const vite = await createServer({configFile:false,server:{host:'127.0.0.1',port:5199,strictPort:true,proxy:{'/api':base.replace('/api','')}}});
    try {
      await vite.listen();
      const proxyBase = `http://127.0.0.1:${vite.httpServer.address().port}/api`;
      const throughProxy = (path,options={})=>fetch(`${proxyBase}${path}`,{...options,headers:{Cookie:cookie,...options.headers}});
      const startProxy = await throughProxy('/items/upload/sessions',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'proxy.pdf',size:file.length})});
      assert.equal(startProxy.status,201);
      const proxySession = await startProxy.json();
      const body = file.subarray(0,4*1024*1024);
      const hash = createHash('sha256').update(body).digest('hex');
      const proxyChunk = await throughProxy(`/items/upload/sessions/${proxySession.id}/chunk?offset=0`,{method:'POST',headers:{'Content-Type':'application/octet-stream','X-Chunk-SHA256':hash},body});
      assert.equal(proxyChunk.status,201,await proxyChunk.text());
    } finally {await vite.close();}
    console.log('✓ HTTP 分片上传和 Range 下载通过');
  } finally {await app.close();rmSync(dir,{recursive:true,force:true});}
})().catch((error)=>{console.error(error);process.exitCode=1;});
