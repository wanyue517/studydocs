const assert = require('node:assert/strict');
const { mkdtempSync, rmSync, writeFileSync, existsSync, readFileSync } = require('node:fs');
const { tmpdir } = require('node:os');
const { join } = require('node:path');
const { spawn } = require('node:child_process');
const dir = mkdtempSync(join(tmpdir(), 'studydocs-layout-test-'));
process.env.STORAGE_DIR = dir;
process.env.ADMIN_USERNAME = 'studyadmin'; process.env.ADMIN_PASSWORD = 'InitialPassword123!';
const { DatabaseService } = require('../dist/database.service');
const { SiteService } = require('../dist/site.service');
const { StorageService } = require('../dist/storage.service');
const { DocumentsService } = require('../dist/documents.service');
const { PdfOutlineService } = require('../dist/pdf-outline.service');
const { PdfLayoutService } = require('../dist/pdf-layout.service');
const { AuthService } = require('../dist/auth');
const { AiService } = require('../dist/ai.service');
const fixture = join(dir, 'protocol.cjs');
writeFileSync(fixture, `
const fs=require('node:fs');
const [source,cache]=process.argv.slice(2);
if (!fs.readFileSync(source).toString().startsWith('%PDF')) process.exit(3);
fs.mkdirSync(cache,{recursive:true});
const marker=cache+'/checkpoint';
const cached=fs.existsSync(marker);
const send=x=>console.log(JSON.stringify(x));
send({kind:'ready',pageCount:24});
send({kind:'batch',pageCount:24,completedPages:12,cached,entries:[{title:'1 First',level:1,page:3}]});
if(!cached){fs.writeFileSync(marker,'saved');send({kind:'error',message:'模拟第二批失败'});process.exitCode=1;}
else {send({kind:'batch',pageCount:24,completedPages:24,entries:[{title:'1.1 Nested',level:2,page:13}]});send({kind:'done',pageCount:24});}
`);
async function wait(service, owner, id) {
  for (let i=0;i<300;i++) {
    const state=service.get(owner,id);
    if(state.status!=='running') return state;
    await new Promise(r=>setTimeout(r,10));
  }
  throw new Error('job did not settle');
}
(async()=>{
 const database=new DatabaseService(); let layout;
 try {
  const site=new SiteService(database), storage=new StorageService(database), docs=new DocumentsService(database,storage,site);
  new AuthService(database,site); docs.onModuleInit();
  const outlines=new PdfOutlineService(database,docs,new AiService(database));
  layout=new PdfLayoutService(database,docs);
  const owner=database.db.prepare("SELECT id FROM users WHERE role='admin'").get().id;
  const pdf=await docs.upload(owner,{originalname:'layout.pdf',buffer:Buffer.from('%PDF-1.4\nfixture'),size:16},null);
  assert.throws(()=>layout.get('someone-else',pdf.id),/不存在/);
  const saved=outlines.save(owner,pdf.id,{entries:[{title:'Manual',level:1,page:1}],pageCount:24,updatedAt:null});
  outlines.saveDraft(owner,pdf.id,{entries:[{title:'Edited draft',level:1,page:2}],baseUpdatedAt:saved.updatedAt,updatedAt:null});
  let caches=[];
  layout.launch=(source,cache)=>{caches.push(cache);return spawn(process.execPath,[fixture,source,cache],{stdio:['ignore','pipe','pipe']});};
  assert.equal(layout.start(owner,pdf.id,{}).status,'running');
  assert.throws(()=>layout.start(owner,pdf.id,{}),/等待/);
  const failed=await wait(layout,owner,pdf.id);
  assert.equal(failed.status,'failed');assert.equal(failed.entries.length,1);assert.equal(failed.progress,47);
  assert.match(failed.error,/第二批/);
  const restored=new PdfLayoutService(database,docs);
  restored.launch=layout.launch;
  restored.start(owner,pdf.id,{});
  const completed=await wait(restored,owner,pdf.id);
  assert.equal(completed.status,'completed');assert.equal(completed.progress,100);
  assert.deepEqual(completed.entries.map(e=>e.page),[3,13]);
  assert.equal(caches[0],caches[1],'相同文件复用内容哈希缓存目录');
  assert.equal(outlines.get(owner,pdf.id).entries[0].title,'Manual');
  assert.equal(outlines.get(owner,pdf.id).draft.entries[0].title,'Edited draft','后台结果不覆盖用户草稿');
  assert.ok(!existsSync(join(dir,'pdf-layout',pdf.id,completed.id+'.pdf')));
  const buffer=readFileSync(fixture);assert.ok(buffer.length);
  database.db.prepare("UPDATE pdf_layout_jobs SET status='running' WHERE id=?").run(completed.id);
  const restarted=new PdfLayoutService(database,docs);
  assert.equal(restarted.get(owner,pdf.id).status,'failed');
  assert.match(restarted.get(owner,pdf.id).error,/重启/);
  docs.patch(owner,pdf.id,{name:'Renamed document'});
  assert.deepEqual(restarted.get(owner,pdf.id).entries,[],'文档变更后不提供旧候选供发布');
  assert.match(restarted.get(owner,pdf.id).error,/更新/);
  console.log('✓ Docling job protocol: 权限 / 异步任务 / 并发限制 / 分批结果保留 / 重启续跑 / 哈希缓存 / 草稿隔离 / 临时文件清理');
 } finally { layout?.onModuleDestroy();database.onModuleDestroy();rmSync(dir,{recursive:true,force:true}); }
})().catch(e=>{console.error(e);process.exitCode=1;});
