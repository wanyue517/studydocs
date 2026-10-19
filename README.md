# 拾页 StudyDocs v0.3.2

简洁的个人学习文档管理系统：**pnpm Monorepo + Vue 3 + TypeScript + NestJS + SQLite + 可配置 OSS**。界面借鉴语雀的知识库阅读方式，不使用后台管理模板。保留 v0.2.0 的目录树、Markdown、富文本、PDF/DOCX 在线预览与宽屏阅读布局。

## UI 组件与弹窗优化（v0.3.2）

- 前台基础 UI 采用 **PrimeVue 4.5.5（MIT）+ Aura**，不采用 Element Plus 或后台管理模板。
- 新建、重命名、移动弹窗已使用 PrimeVue Dialog、InputText、Select、Button，统一内容与底部操作区间距，解决文本和按钮拥挤。
- OSS 存储配置使用统一的表单弹窗；支持长表单滚动及小屏单列排列。
- 登录输入框及主要提交按钮也使用 PrimeVue，Markdown（md-editor-v3）、富文本（Tiptap）、PDF/Word 预览仍沿用原有编辑预览组件。
- 本次不修改数据库、文档存储、账号或文件上传逻辑；菜单树与业务页面可后续分阶段迁移，避免一次性重写。
- **安装新依赖**：`pnpm install --no-frozen-lockfile`，安装成功后请提交更新的 `pnpm-lock.yaml`。新依赖未在离线执行环境中完成安装与真实浏览器编译，建议运行 `pnpm typecheck && pnpm build`。

## v0.3.1 界面与目录操作优化

- 移除顶部单独的「新建富文本」按钮。左侧目录树右键可创建文件夹、Markdown、富文本、网页收藏、上传文件；也可右键空白区域直接在根目录创建。
- 对文件/文件夹的右键菜单补充打开（文件夹为展开/收起）、重命名、收藏、移动到指定目录、回收站；上传的文件支持下载，网页收藏可打开原链接。
- 菜单现在可通过点击侧栏空白区域或页面任意其他位置、滚动目录、缩放窗口、按 Esc 关闭。菜单自动避开视口边缘。
- 删除无实际价值的英文装饰标签、重复的“已同步”状态、文章末尾口号、冗余小贴士；保留文件属性、表单标签和必要错误信息。
- 本次仅修改 Web 界面及目录移动的交互反馈，不变更后端数据结构；原有 v0.3.0 数据可继续使用。

## 本版功能

- **认证**：管理员初始化、账密登录、浏览器密码自动填充、一周有效的 HttpOnly Cookie 持久会话、退出登录、修改密码、登录失败限流。服务器保存的是会话令牌哈希，不保存明文密码。密码使用 scrypt + 独立盐加密散列。
- **角色与隔离**：管理员（网站与存储设置）和普通用户；各自的知识树、文件、收藏和回收站按 `owner_id` 隔离。新注册者默认普通用户；没有默认公开文档。
- **可配置站点**：站点名称、副标题、Logo（PNG/JPEG/WebP）、浏览器标题/图标、ICP备案号、公安备案号、页脚文字、登录公告、开放注册开关、最大上传文件 MB（1–25）。配置持久化在 SQLite，登录前也可读取公开展示字段。
- **多存储档案**：支持本地、阿里云 OSS、Cloudflare R2、MinIO、七牛云 Kodo；可创建多个配置，测试连通性，选择一个默认存储，编辑或删除未被引用的非活动配置。云端的 Access Key Secret 用 AES-256-GCM 加密保存。
- **上传归属追踪**：每次新上传在 `items.storage_id + items.object_key` 中记录物理位置；切换默认存储仅影响未来新上传，老文件仍访问原配置，不自动迁移。
- **兼容升级**：已有 v0.2 SQLite `items` 表自动增加字段，旧文件仍使用 `file_path` 指向原 `data/uploads` 文件，并把全部旧文档归首次创建的管理员；不移动、不删除旧资料。

## 目录结构

```text
studydocs/
├── apps/
│   ├── web/                    # Vue3 + Vite + Pinia
│   │   └── src/components/
│   │       ├── AuthView.vue     # 登录 / 注册
│   │       ├── SettingsView.vue # 网站 / OSS / 账号安全
│   │       └── ...
│   └── api/                    # NestJS API
│       └── src/
│           ├── auth.ts             # 认证与角色权限
│           ├── database.service.ts # SQLite schema 和自动迁移
│           ├── site.service.ts     # 网站动态配置
│           ├── storage.service.ts  # 五种存储适配器
│           ├── storage.controller.ts
│           ├── documents.service.ts
│           └── ...
├── packages/shared/            # 前后端共用类型
├── pnpm-workspace.yaml
└── package.json
```

## Windows 本地运行

要求 Node.js **22.13+**、pnpm 10，建议通过 PowerShell 操作。

### 1. 备份与升级

如果已经使用 v0.2.0，先停止服务、备份整个 `apps/api/data/`（含 `studydocs.sqlite` 与 `uploads/`）；用新版本**代码**覆盖旧代码，但**保留旧数据文件夹**，不要直接覆盖/删除原数据库。确保服务停机后再备份 WAL 数据库。

### 2. 首次运行必填管理员信息

```powershell
Copy-Item apps/api/.env.example apps/api/.env
notepad apps/api/.env
```

编辑 `apps/api/.env`：

```dotenv
ADMIN_USERNAME=admin
ADMIN_PASSWORD=请在此填写您自己至少10位且不易猜的强密码
STORAGE_DIR=./data
PORT=3200
WEB_ORIGIN=http://localhost:5173
COOKIE_SECURE=false
```

> 首次启动时，系统自动创建一个管理员。如果以前有资料，会把旧资料归该管理员。之后修改 `.env` 中的管理员密码**不会**更改已有数据库密码；请在登录后到「系统设置 → 账号安全」修改。
>
> `.env` 不要提交到 Git，也不要共享给其他人。公网部署需要反向代理 HTTPS、设置 `COOKIE_SECURE=true` 和正确的 `WEB_ORIGIN`，并限制后端访问入口。**生产环境请备份 SQLite 数据库和存储密钥。**

### 3. 启用云 OSS 时额外生成加密主密钥

在终端运行：

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

将生成的 64 位十六进制字符串填入 `.env` 的 `STORAGE_ENCRYPTION_KEY=`。本地默认存储不需要该密钥。云存储凭证使用它加密；**更换或丢失这个密钥将导致原凭证无法解密，历史文件因此可能无法访问。**

### 4. 安装和启动

```powershell
npm install -g pnpm@10.18.2
pnpm install
pnpm dev
```

- Web：`http://localhost:5173`
- NestJS API：`http://localhost:3200/api`
- SQLite：`apps/api/data/studydocs.sqlite`
- 本地存储：`apps/api/data/uploads/`

使用初始化管理员登录。在管理账号的「系统设置」页面中可开启注册并配置 OSS。浏览器刷新或下次访问会通过持久 Cookie 自动登录，**会话自登录之日起 7 天后到期**；不会把明文密码存入 localStorage。若要让浏览器记住账号密码，请允许浏览器自身的密码管理器保存。

## OSS 配置示例

| 厂商 | Endpoint 示例 | Region 示例 | SDK |
|---|---|---|---|
| 本地 | 无 | 无 | Node.js `fs` |
| Cloudflare R2 | `https://<account-id>.r2.cloudflarestorage.com` | `auto` | AWS S3 SDK v3 |
| MinIO | `http://127.0.0.1:9000` | `us-east-1` | AWS S3 SDK v3，通常 Path-style |
| 七牛云 Kodo | `https://s3.cn-east-1.qiniucs.com` | `cn-east-1` | AWS S3 SDK v3；Bucket 填七牛 **S3 空间名** |
| 阿里云 OSS | `https://oss-cn-hangzhou.aliyuncs.com` | `oss-cn-hangzhou` | `ali-oss` |

**正确操作顺序**：创建存储档案 → 点击「测试」（写入临时小文件，读取并删除）→ 点击「设为默认」→ 上传新文件。

采用私有 Bucket，由后端经过登录与文档所有者校验后代理预览或下载。**不要**为了预览开启 Bucket 公开读权限或将 Secret Key 发给前端。

**切换示例**：先用本地存储上传文件 A，其数据库记录的 `storage_id=local-default`；再设置 R2 为默认存储，上传文件 B，则 B 的 `storage_id` 是 R2 配置 ID。无论默认选项如何变化，A 和 B 仍然分别从各自来源读取。已关联文件的存储档案禁止删除或更换 Bucket/Endpoint/前缀，密钥可单独更新以处理轮换。

**旧版 `file_path` 兼容**：历史数据的 `storage_id` 可以为空，系统会按旧版 `data/uploads/<file_path>` 从本地读取，这不属于迁移文件。

## 主要 API

| Method | API | 权限 |
|---|---|---|
| POST | `/api/auth/login` | 公开 |
| POST | `/api/auth/register` | 公开，但受配置限制 |
| GET | `/api/auth/me` | 已登录 |
| POST | `/api/auth/logout` | 已登录 |
| POST | `/api/auth/change-password` | 已登录 |
| GET | `/api/site/public` | 公开（不包含敏感配置） |
| GET | `/api/site/logo` | 公开 |
| GET/PATCH | `/api/site/settings` | 管理员 |
| POST | `/api/site/logo` | 管理员 |
| GET/POST | `/api/storage` | 管理员 |
| PATCH/DELETE | `/api/storage/:id` | 管理员 |
| POST | `/api/storage/:id/activate` | 管理员 |
| POST | `/api/storage/:id/test` | 管理员 |
| GET/POST/PATCH/DELETE | `/api/items...` | 已登录，且必须为文档所有者 |
| GET | `/api/items/:id/file` | 已登录，且必须为文档所有者 |

## 测试与已知边界

```bash
pnpm typecheck
pnpm build
pnpm smoke
pnpm test:filename
```

在当前交付环境中，npm Registry DNS 无法访问，**未能执行真实安装、Nest/Vue 完整构建或实际云 OSS 集成连通测试**。已执行 TypeScript 语法转换检查和本地替身模块下的服务级运行测试，包括：管理员初始化、一周 Cookie、禁止/允许注册、账户隔离、文件上传、本地存储切换后旧文件读取、删除恢复；也用旧版 schema 验证过新增列不丢旧数据。请在网络可用的本机先完成上述命令和真实 OSS 连接测试。

额外边界：
- 当前使用 SQLite；适合单实例、小团队的知识库。多人并发、高可用部署可升级 PostgreSQL/MySQL；当前尚未实现该升级或横向多实例会话限流。
- 当前单文件最大 25MB、后端暂以 Buffer 转发，适合笔记、PDF/Word 学习资料；超大文件/分片传输与 CDN 直连可作为下一期。
- Markdown/HTML 上传既保留 OSS 中的初次上传文件，又把可编辑正文存在 SQLite；编辑后下载取最新正文。原始上传文件不会自动同步更新（便于追溯来源）。
- 旧 `.doc` 暂不支持，复杂 `.docx` 浏览器渲染与 Microsoft Word 可能有差异；部分网页不允许 iframe 嵌入。
- 失败的远程删除会加入 `storage_gc_jobs` 队列记录以防遗漏；**目前尚无自动重试任务界面**，需要后续补齐运维处理。管理员替换 Logo 后可能残留旧对象，需后续清理。
- 生产环境上线前还应增加请求/上传审计、病毒扫描、数据库定期备份、异常监控、严格 CSP，并在正式域名下确认 Cookie 与反向代理设置。

## 开源组件

- [md-editor-v3](https://github.com/imzbf/md-editor-v3) — Markdown
- [Tiptap](https://tiptap.dev/) — 富文本
- [vue-pdf-embed](https://github.com/hrynko/vue-pdf-embed) — PDF
- [docx-preview](https://github.com/VolodymyrBaydalka/docxjs) — DOCX
- [Lucide](https://lucide.dev/) — 图标
- [AWS SDK JS v3](https://github.com/aws/aws-sdk-js-v3) — R2、MinIO、七牛云
- [ali-oss](https://github.com/ali-sdk/ali-oss) — 阿里云 OSS

请在正式部署前审核第三方依赖版本、使用许可和安全公告。
