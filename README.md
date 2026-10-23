# 拾页 StudyDocs v0.3.3

简洁的个人学习文档管理系统：**pnpm Monorepo + Vue 3 + TypeScript + NestJS + SQLite + 可配置 OSS**。界面借鉴语雀的知识库阅读方式，不使用后台管理模板。保留 v0.2.0 的目录树、Markdown、富文本、PDF/DOCX 在线预览与宽屏阅读布局。

## v0.3.3 前台 UI 组件统一与主题

- **PrimeVue 4 + Aura** 已扩展到登录（输入框、密码框、提示）、系统设置（输入框、数字输入、开关、选项组、按钮、Logo 上传）、文档文件上传、目录右键菜单、顶部操作菜单、删除确认框、全局消息通知、文档操作按钮、回收站和富文本工具栏等位置。
- 专属的三栏文档布局与带拖放的目录树层级仍由业务组件维护，图标使用 Lucide；Markdown、富文本、PDF、Word 继续使用专项开源编辑器和预览器，避免重复实现它们的核心功能。
- 新增 `apps/web/src/theme.ts`：定义品牌色板和组件语义色；`apps/web/src/ui-system.css` 保留少量知识库布局和样式微调。主题基调为**低饱和海蓝灰、白色内容区、深石墨正文**，不使用明亮彩虹配色。
- 删除确认使用 PrimeVue ConfirmDialog/ConfirmationService，提示使用 ToastService，菜单由组件库管理点击外部自动关闭、定位与键盘行为，避免原先的手写两套菜单机制。
- 本次仅修改 Web，不涉及数据库迁移和后端 API。
- 当前执行环境不能连接 npm Registry；`pnpm-lock.yaml` 暂未自动更新。合并前必须执行 `pnpm install --no-frozen-lockfile && pnpm typecheck && pnpm build`，并提交更新后的锁文件。

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
- **可配置站点**：站点名称、副标题、Logo（PNG/JPEG/WebP）、浏览器标题/图标、ICP备案号、公安备案号、页脚文字、登录公告、开放注册开关、最大上传文件 MB（1–2048）。配置持久化在 SQLite，登录前也可读取公开展示字段。
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

采用私有 Bucket。云存储上传时，后端验证登录用户、创建云端分片任务并签发仅对该分片有效的 5 分钟 PUT URL；浏览器直接向云存储上传，后端从云存储核对分片后登记文档。云存储中的 PDF/DOCX 下载和预览由后端核对文档所有者后签发 15 分钟 GET URL，浏览器直接读取。站点可编辑的 Markdown/HTML 以 SQLite 最新正文为准，下载和预览仍通过后端；本地存储仍使用后端传输。**Bucket 保持私有，不要把 Secret Key 发给前端。**

直连前须在 Bucket 配置 CORS：允许站点的准确 Origin，方法 `GET`、`PUT`，请求头至少允许 `Range`（可设为 `*`）；如果其他工具需要读取分片 ETag，可额外暴露 `ETag`。云存储 Endpoint 必须能从用户浏览器访问；HTTPS 站点的云端 Endpoint 也必须使用 HTTPS。只允许服务器访问的 MinIO 内网地址无法供浏览器直连，需配置可从浏览器访问的域名。参考 [S3 CORS 文档](https://docs.aws.amazon.com/AmazonS3/latest/userguide/ManageCorsUsing.html) 与 [阿里云 OSS CORS 文档](https://help.aliyun.com/en/oss/user-guide/configure-cross-origin-resource-sharing)。

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

本地构建、服务级及 HTTP 传输测试已通过。当前阿里云 OSS Bucket 已验证 `http://localhost:5173` 和 `http://127.0.0.1:5173` 的 PUT 预检、签名分片上传、合并、Range 下载和临时文件清理；其他站点来源或其他云厂商仍需单独验证。OSS 可在 `apps/api` 目录运行 `node test/live-cloud.cjs <站点 Origin>` 检查当前 Bucket，使用 `node test/bucket-cors.cjs <站点 Origin>` 查看 CORS 规则；`--apply` 会增补准确来源并保留现有规则。

额外边界：
- 当前使用 SQLite；适合单实例、小团队的知识库。多人并发、高可用部署可升级 PostgreSQL/MySQL；当前尚未实现该升级或横向多实例会话限流。
- 新安装默认单文件上限 1024 MB，管理员可在站点设置中调整到 1–2048 MB；旧站点原有的上限设置会保留。本地文档上传按 4 MB 分片落盘并校验 SHA-256；云端上传按 8 MB 分片直接写入 Bucket。服务或设备中断后重新选择同一文件，可从已确认的分片续传。失败分片和完成请求最多自动重试 3 次。下载按 4 MB 范围请求，已完成的分片保存在当前浏览器的 IndexedDB；重新点击下载可继续。浏览器存储空间不足时续传会失败。进度按服务器或云存储已确认的上传字节、浏览器已保存的下载字节计算；上传字节达到 100% 后仍需等待云端合并和文档登记完成。
- Markdown/HTML 上传既保留 OSS 中的初次上传文件，又把可编辑正文存在 SQLite；编辑后下载取最新正文。原始上传文件不会自动同步更新（便于追溯来源）。
- 旧 `.doc` 暂不支持，复杂 `.docx` 浏览器渲染与 Microsoft Word 可能有差异；部分网页不允许 iframe 嵌入。
- 失败的远程删除会加入 `storage_gc_jobs` 队列记录以防遗漏；**目前尚无自动重试任务界面**，需要后续补齐运维处理。管理员替换 Logo 后可能残留旧对象，需后续清理。
- 生产环境上线前还应增加请求/上传审计、病毒扫描、数据库定期备份、异常监控、严格 CSP，并在正式域名下确认 Cookie 与反向代理设置。

## 开源组件

- [md-editor-v3](https://github.com/imzbf/md-editor-v3) — Markdown
- [Tiptap](https://tiptap.dev/) — 富文本
- vue-pdf-embed + PDF.js Worker — 浅色 PDF 分页、页码跳转、适应宽度、缩放与文字选择；保留浏览器打开入口
- [docx-preview](https://github.com/VolodymyrBaydalka/docxjs) — DOCX
- [Lucide](https://lucide.dev/) — 图标
- [AWS SDK JS v3](https://github.com/aws/aws-sdk-js-v3) — R2、MinIO、七牛云
- [ali-oss](https://github.com/ali-sdk/ali-oss) — 阿里云 OSS

请在正式部署前审核第三方依赖版本、使用许可和安全公告。


### 阅读与文件夹浏览修复（2026-10-23）

- 文件夹名称点击后在右侧列出直接子项，文件夹优先排序；箭头独立展开/收起。支持面包屑、返回上一级、在当前目录新建和上传。空文件夹展开时不再插入占位行。
- 拖放结束、取消或窗口失焦时清除外层虚线高亮，子节点拦截 drop 也能正确清除。
- 正文与常用操作以 16px 为基准，辅助信息通常为 14px；文章目录 14px，长标题自动换行并撑高，不被其他目录项压缩。
- PDF 阅读区占满剩余空间，使用系统浅色背景。只渲染当前页，PDF Worker、字体映射和解码器随前端构建本地部署，PDF 模块仅在打开 PDF 时加载。部署时需上传完整 `apps/web/dist`，包含 `pdf-assets`。Worker 构建为带 hash 的 `.js` 文件，兼容未配置 `.mjs` MIME 类型的静态服务器；更新时需同时部署新的页面脚本和 Worker 文件。
- 最近 4 个文档保留组件状态，避免导航后重复加载；PDF 在当前浏览器会话中保留页码、缩放和滚动位置。
- 完整加载的 PDF/Word 使用 IndexedDB 缓存，按账号、文件 ID、版本和存储配置区分。单文件最大 100MiB，最多 12 个文件、总量 200MiB，7 天未访问过期；超限按最近访问淘汰。大文件仍可正常阅读并使用组件缓存，存储不可用时自动退回普通加载。


### 可调侧栏与编辑布局

- 桌面端拖动左栏右边缘或右栏左边缘调整宽度：左栏 220–480px，右栏 200–420px。实际最大值随窗口可用空间进一步限制，确保中间区域至少保留 440px。
- 宽度保存在当前浏览器中；双击分隔条恢复默认值（左 284px、右 250px）。分隔条可聚焦，方向键按 10px 调整，Shift + 方向键按 40px 调整，Home/End 调至当前最小/最大值。
- 1040px 及以下隐藏右侧目录，770px 及以下左栏继续使用移动抽屉，不提供拖动手柄。
- Markdown 编辑模式移除外围留白和重复标题，编辑器铺满工具栏下方的可用空间，内部独立滚动；退出编辑后恢复阅读布局。
- 图标栏、工作区标题、登录页和设置预览中的 Logo 均不叠加背景色或阴影，按图片原始比例显示，避免透明 PNG 的背景和圆角裁切问题。


### PDF 加载提示

获取文件地址、按需下载阅读器模块时，提示填满并居中于预览区；阅读器就绪后，文档加载与页面渲染提示使用居中覆盖层，不参与 PDF 页面排版。渲染完成后隐藏，失败时替换为错误信息并保留浏览器打开入口。


### 导航交互与层级连线

- 目录、面包屑、图标工具和文字操作悬停时以文字/图标颜色反馈为主；文件列表突出标题与箭头，非实心按钮使用颜色和边框反馈。实心按钮、选中状态、菜单选项和键盘焦点保留必要的状态区分。
- 文章目录统一 14px，按实际父子关系嵌套，使用缩进、字重及横竖连线区分层级；最后一个子节点的竖线在该节点处结束，长标题自动撑高。
- Markdown 目录直接使用编辑器解析结果，支持 H1–H6、跳级标题和 Setext 标题，不把代码块内的 `#` 当成标题。目录跳转仍限定在正文/编辑预览区域内。
- 左侧文件夹树每层缩进 20px，增加父子连接线，展开空文件夹时不显示占位内容。
- 层级构建回归：`pnpm --filter @studydocs/web test:outline`。
