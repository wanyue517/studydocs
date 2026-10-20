const {strict:assert} = require('node:assert');
const {mkdtempSync,rmSync} = require('node:fs');
const {tmpdir} = require('node:os');
const {join} = require('node:path');
const {NotFoundException} = require('@nestjs/common');
const dir = mkdtempSync(join(tmpdir(),'studydocs-cloud-transfer-'));
process.env.STORAGE_DIR = dir;
const {DatabaseService} = require('../dist/database.service');
const {SiteService} = require('../dist/site.service');
const {TransferService} = require('../dist/transfer.service');

(async()=>{
  const db = new DatabaseService();
  try {
    db.db.prepare("INSERT INTO users(id,username,password_hash,role,created_at) VALUES('clouduser','clouduser','x','user',?)").run(new Date().toISOString());
    const profile = db.db.prepare("INSERT INTO storage_profiles(id,name,provider,config_json,active,created_at) VALUES('cloud','Cloud','r2','{}',1,?)");
    db.db.prepare("UPDATE storage_profiles SET active=0").run();
    profile.run(new Date().toISOString());
    const parts = [];
    let completed = false, registered = false;
    let activeId = 'cloud';
    const storage = {
      active:()=>({id:activeId,provider:'r2'}),
      objectKey:()=> 'studydocs/test.pdf',
      beginDirectUpload:async()=> 'remote-upload',
      signDirectPart:async(_id,_key,_upload,number)=>`https://cloud.example/part/${number}`,
      directParts:async()=>parts,
      completeDirectUpload:async()=>{completed=true;},
      size:async()=>completed?9*1024*1024:-1,
      abortDirectUpload:async()=>{},
    };
    const docs = {
      find:()=>{if (!registered) throw new NotFoundException(); return {id:session.id};},
      completeCloudUpload:async(_owner,_name,_size,storageId,key)=>{assert.equal(storageId,'cloud');assert.equal(key,'studydocs/test.pdf');registered=true;return {id:session.id};},
    };
    const site = new SiteService(db);
    let transfers = new TransferService(db,docs,site,storage);
    const session = await transfers.start('clouduser',{name:'test.pdf',size:9*1024*1024});
    assert.equal(session.mode,'cloud');
    assert.equal(session.chunkSize,8*1024*1024);
    assert.throws(()=>transfers.chunk('clouduser',session.id,0,Buffer.alloc(8*1024*1024),''),/云端直传/);
    activeId = 'local-default';
    assert.equal((await transfers.status('clouduser',session.id)).storageChanged,true);
    activeId = 'cloud';
    assert.equal((await transfers.signPart('clouduser',session.id,1)).url,'https://cloud.example/part/1');
    parts.push({number:1,size:8*1024*1024,etag:'"one"'});
    transfers = new TransferService(db,docs,site,storage);
    assert.equal((await transfers.status('clouduser',session.id)).received,8*1024*1024);
    await assert.rejects(()=>transfers.finish('clouduser',session.id),/尚未上传完整/);
    parts.push({number:2,size:1024*1024,etag:'"two"'});
    const item = await transfers.finish('clouduser',session.id);
    assert.equal(item.id,session.id);
    assert.equal((await transfers.finish('clouduser',session.id)).id,session.id);
    console.log('✓ 云端签名、断点查询、完成校验及幂等登记通过');
  } finally {db.onModuleDestroy();rmSync(dir,{recursive:true,force:true});}
})().catch((error)=>{console.error(error);process.exitCode=1;});
