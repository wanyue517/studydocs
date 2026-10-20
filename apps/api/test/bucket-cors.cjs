/* 检查当前默认 OSS Bucket 的 CORS；--apply 增补准确的站点来源并保留现有规则。 */
require('node:process').loadEnvFile('.env');
const {DatabaseService} = require('../dist/database.service');
const {StorageService} = require('../dist/storage.service');

(async()=>{
  const origin = process.argv[2] || 'http://localhost:5173';
  const apply = process.argv.includes('--apply');
  const db = new DatabaseService();
  try {
    const storage = new StorageService(db);
    const profile = storage.active();
    if (profile.provider !== 'aliyun') throw new Error('当前默认存储不是阿里云 OSS');
    const config = JSON.parse(profile.config_json);
    const client = storage.aliyun(profile);
    let rules;
    try { rules = (await client.getBucketCORS(config.bucket)).rules; }
    catch (error) {
      if (error.status !== 404 && error.code !== 'NoSuchCORSConfiguration') throw error;
      rules = [];
    }
    console.log(JSON.stringify({origin,ruleCount:rules.length,rules},null,2));
    if (!apply) return;
    if (!/^https?:\/\/[^/]+$/.test(origin)) throw new Error('站点来源必须是准确的 http(s) Origin');
    if (rules.some(rule=>[rule.allowedOrigin].flat().includes(origin))) {
      console.log('站点来源已存在于 Bucket CORS 规则中，请检查方法和请求头。');
      return;
    }
    if (rules.length >= 9) throw new Error('现有规则较多，请手动调整 CORS');
    const added = {allowedOrigin:origin,allowedMethod:['GET','HEAD','PUT'],allowedHeader:'*',exposeHeader:['Content-Range','Content-Length','ETag'],maxAgeSeconds:'3600'};
    await client.putBucketCORS(config.bucket,[added,...rules]);
    console.log('已增补站点来源的 GET/HEAD/PUT CORS 规则，原有规则保留。');
  } finally { db.onModuleDestroy(); }
})().catch(error=>{console.error({name:error.name,message:error.message,status:error.status,code:error.code});process.exitCode=1;});
