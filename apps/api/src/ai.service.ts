import { BadGatewayException, BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { createCipheriv, createDecipheriv, randomBytes, randomUUID } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AiProfile, AiProfileInput } from '@studydocs/shared';
import { DatabaseService } from './database.service';
interface Row { id: string; name: string; provider: AiProfile['provider']; base_url: string; model: string; secret: string; active: number }
export type AiConnection = AiProfile & { apiKey: string };
@Injectable()
export class AiService {
  constructor(private readonly database: DatabaseService) {
    database.db.exec(`CREATE TABLE IF NOT EXISTS ai_profiles (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, provider TEXT NOT NULL,
      base_url TEXT NOT NULL, model TEXT NOT NULL, secret TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 0
    );`);
  }
  private key() {
    const path = join(this.database.root, 'ai-secret.key');
    if (!existsSync(path)) writeFileSync(path, randomBytes(32), { mode: 0o600, flag: 'wx' });
    const key = readFileSync(path);
    if (key.length !== 32) throw new BadRequestException('AI 加密密钥不可用，请恢复数据目录备份');
    return key;
  }
  private encrypt(secret: string) {
    const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', this.key(), iv);
    const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
    return [iv, cipher.getAuthTag(), data].map(x => x.toString('base64')).join('.');
  }
  private decrypt(secret: string) {
    const [iv, tag, data] = secret.split('.').map(x => Buffer.from(x, 'base64'));
    const cipher = createDecipheriv('aes-256-gcm', this.key(), iv);
    cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(data), cipher.final()]).toString('utf8');
  }
  private find(id: string) {
    const row = this.database.db.prepare('SELECT * FROM ai_profiles WHERE id=?').get(id) as Row | undefined;
    if (!row) throw new NotFoundException('AI 配置不存在');
    return row;
  }
  private public(row: Row): AiProfile {
    return { id: row.id, name: row.name, provider: row.provider, baseUrl: row.base_url, model: row.model, active: !!row.active, hasKey: !!row.secret };
  }
  list() { return (this.database.db.prepare('SELECT * FROM ai_profiles ORDER BY active DESC, rowid').all() as unknown as Row[]).map(row => this.public(row)); }
  save(input: AiProfileInput, id?: string) {
    if (!input || !['deepseek','openai','doubao','qwen','compatible'].includes(input.provider)) throw new BadRequestException('请选择有效的 AI 服务商');
    for (const field of ['name','baseUrl','model'] as const) {
      if (typeof input[field] !== 'string' || !input[field].trim() || input[field].length > (field === 'baseUrl' ? 1000 : 120)) throw new BadRequestException(`AI ${field === 'name' ? '名称' : field === 'model' ? '模型' : '接口地址'}无效`);
    }
    let url: URL;
    try { url = new URL(input.baseUrl); } catch { throw new BadRequestException('AI 接口地址必须是完整 URL'); }
    if (!['http:','https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash || /[{}]/.test(input.baseUrl)) throw new BadRequestException('AI 接口地址格式无效，请填写实际的 Base URL');
    if (url.protocol !== 'https:' && input.provider !== 'compatible') throw new BadRequestException('此服务商必须使用 HTTPS 地址');
    if (input.apiKey !== undefined && (typeof input.apiKey !== 'string' || input.apiKey.length > 4096 || /[\r\n]/.test(input.apiKey))) throw new BadRequestException('API Key 格式无效');
    const old = id ? this.find(id) : undefined;
    if (old && old.provider !== input.provider && !input.apiKey?.trim()) throw new BadRequestException('切换服务商后请重新填写 API Key');
    const secret = input.apiKey?.trim() ? this.encrypt(input.apiKey.trim()) : old?.secret;
    if (!secret) throw new BadRequestException('请填写 API Key');
    const key = old?.id ?? randomUUID();
    this.database.db.prepare(`INSERT INTO ai_profiles(id,name,provider,base_url,model,secret,active) VALUES(?,?,?,?,?,?,0)
      ON CONFLICT(id) DO UPDATE SET name=excluded.name,provider=excluded.provider,base_url=excluded.base_url,model=excluded.model,secret=excluded.secret`)
      .run(key, input.name.trim(), input.provider, url.toString().replace(/\/$/, ''), input.model.trim(), secret);
    return this.public(this.find(key));
  }
  activate(id: string) {
    this.find(id);
    this.database.db.exec('BEGIN IMMEDIATE');
    try { this.database.db.prepare('UPDATE ai_profiles SET active=(id=?)').run(id); this.database.db.exec('COMMIT'); }
    catch (e) { this.database.db.exec('ROLLBACK'); throw e; }
    return this.list();
  }
  remove(id: string) {
    if (this.find(id).active) throw new BadRequestException('请先切换默认 AI 配置');
    this.database.db.prepare('DELETE FROM ai_profiles WHERE id=?').run(id);
    return { success: true };
  }
  connection(id?: string): AiConnection {
    const row = id ? this.find(id) : this.database.db.prepare('SELECT * FROM ai_profiles WHERE active=1').get() as Row | undefined;
    if (!row) throw new BadRequestException('尚未设置默认 AI，请联系管理员在设置 → AI 配置中添加并设为默认');
    return { ...this.public(row), apiKey: this.decrypt(row.secret) };
  }
  availability() {
    const row = this.database.db.prepare('SELECT * FROM ai_profiles WHERE active=1').get() as Row | undefined;
    return { configured: !!row, name: row?.name ?? '', model: row?.model ?? '' };
  }
  async chat(connection: AiConnection, system: string, content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>): Promise<string> {
    const url = connection.baseUrl.replace(/\/+$/, '');
    let response: globalThis.Response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 120_000);
    try {
      response = await fetch(url.endsWith('/chat/completions') ? url : `${url}/chat/completions`, {
        method: 'POST', redirect: 'error', signal: controller.signal,
        headers: { Authorization: `Bearer ${connection.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: connection.model, stream: false, messages: [{ role: 'system', content: system }, { role: 'user', content }] }),
      });
      if (!response.ok) {
        await response.body?.cancel();
        const hints: Record<number,string> = { 401: 'API Key 无效', 403: '接口或模型没有访问权限', 404: '接口地址或模型不存在', 402: '余额不足', 429: '请求限流或额度不足' };
        throw new BadGatewayException(`AI 调用失败（${response.status}）：${hints[response.status] ?? '服务商暂时不可用'}`);
      }
      const reader = response.body?.getReader();
      if (!reader) throw new BadGatewayException('AI 返回了空响应');
      const chunks: Uint8Array[] = []; let length = 0;
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          length += value.length;
          if (length > 2_000_000) throw new BadGatewayException('AI 返回内容过大');
          chunks.push(value);
        }
      } finally { await reader.cancel().catch(() => {}); }
      const result = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const text = result?.choices?.[0]?.message?.content;
      if (typeof text !== 'string' || !text.trim()) throw new BadGatewayException('AI 未返回有效文本，请检查模型是否支持 Chat Completions');
      if (result.choices[0].finish_reason === 'length') throw new BadGatewayException('AI 输出被截断，请改用输出容量更大的模型后重试');
      return text;
    } catch (e) {
      if (e instanceof BadGatewayException) throw e;
      throw new BadGatewayException(controller.signal.aborted ? 'AI 请求超时，请稍后重试' : '无法连接 AI 服务，请检查接口地址、网络和模型配置');
    } finally { clearTimeout(timer); }
  }
  async test(id: string) {
    await this.chat(this.connection(id), '仅返回 OK。', '连接测试');
    return { success: true, message: 'AI 连接测试成功' };
  }
}
