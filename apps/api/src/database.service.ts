import { Injectable, OnModuleDestroy } from '@nestjs/common';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

@Injectable()
export class DatabaseService implements OnModuleDestroy {
  readonly root = resolve(process.env.STORAGE_DIR ?? './data');
  readonly db: DatabaseSync;
  constructor() {
    mkdirSync(this.root, { recursive: true });
    this.db = new DatabaseSync(join(this.root, 'studydocs.sqlite'));
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, password_hash TEXT NOT NULL,
        role TEXT NOT NULL CHECK(role IN ('admin','user')), created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS sessions (
        token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        expires_at TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);
      CREATE TABLE IF NOT EXISTS storage_gc_jobs (
        id TEXT PRIMARY KEY, storage_id TEXT, object_key TEXT NOT NULL, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS upload_sessions (
        id TEXT PRIMARY KEY, owner_id TEXT NOT NULL, file_name TEXT NOT NULL,
        parent_id TEXT, size INTEGER NOT NULL, chunk_size INTEGER NOT NULL,
        received INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'uploading', item_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_upload_sessions_owner ON upload_sessions(owner_id);
      CREATE TABLE IF NOT EXISTS site_settings (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS storage_profiles (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, provider TEXT NOT NULL,
        config_json TEXT NOT NULL, secret_cipher TEXT,
        active INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS items (
        id TEXT PRIMARY KEY, parent_id TEXT, name TEXT NOT NULL,
        kind TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
        file_name TEXT, file_path TEXT, mime_type TEXT, url TEXT,
        starred INTEGER NOT NULL DEFAULT 0, version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL, deleted_at TEXT,
        owner_id TEXT, storage_id TEXT, object_key TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_items_parent ON items(parent_id);
      CREATE INDEX IF NOT EXISTS idx_items_deleted ON items(deleted_at);
    `);
    const columns = (this.db.prepare('PRAGMA table_info(items)').all() as unknown as { name: string }[]).map((x) => x.name);
    for (const column of ['owner_id', 'storage_id', 'object_key']) {
      if (!columns.includes(column)) this.db.exec(`ALTER TABLE items ADD COLUMN ${column} TEXT`);
    }
    const uploadColumns = (this.db.prepare('PRAGMA table_info(upload_sessions)').all() as unknown as {name:string}[]).map((x)=>x.name);
    for (const column of ['storage_id','object_key','upload_id']) {
      if (!uploadColumns.includes(column)) this.db.exec(`ALTER TABLE upload_sessions ADD COLUMN ${column} TEXT`);
    }
    if (!(this.db.prepare('SELECT 1 FROM storage_profiles LIMIT 1').get())) {
      this.db.prepare('INSERT INTO storage_profiles(id,name,provider,config_json,active,created_at) VALUES(?,?,?,?,?,?)')
        .run('local-default', '本地默认存储', 'local', '{}', 1, new Date().toISOString());
    }
    if (!(this.db.prepare('SELECT 1 FROM site_settings WHERE id=1').get())) {
      this.db.prepare('INSERT INTO site_settings(id,data) VALUES(1,?)').run(JSON.stringify({
        siteName:'拾页', siteSubtitle:'把知识整理成自己的体系', footerText:'拾页 StudyDocs · 记录与成长',
        icpNumber:'', policeRecordNumber:'', loginNotice:'', allowRegistration:false, maxUploadMb:1024,
        logoStorageId:null, logoObjectKey:null,
      }));
    }
  }
  onModuleDestroy() { this.db.close(); }
}
