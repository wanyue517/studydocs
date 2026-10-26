# Docling 版面目录解析

使用 Docling 标准版面管线 + RapidOCR（ONNX Runtime，中文模型）识别 section_header / title，启用 HeadingHierarchyOptions，综合书签、编号及字体样式恢复层级。不调用在线 LLM，不需要 AI Key。扫描图片仍需 OCR，但目录候选由版面模型筛选，不再把所有 OCR 行直接当作标题。

## 安装（推荐 Python 3.11 / 3.12）

在项目根目录执行：

```bash
python3 -m venv .venv-docling
.venv-docling/bin/python -m pip install --upgrade pip
# 无 GPU 的机器先安装 CPU 版，避免安装 CUDA 依赖
.venv-docling/bin/pip install torch torchvision --index-url https://download.pytorch.org/whl/cpu
.venv-docling/bin/pip install -r services/pdf-layout/requirements.txt
.venv-docling/bin/python services/pdf-layout/worker.py --check
```

启动 NestJS 的环境中设置 `PDF_LAYOUT_PYTHON` 为虚拟环境 Python 的绝对路径。例如 `PDF_LAYOUT_PYTHON=/opt/studydocs/.venv-docling/bin/python`。默认使用 PATH 中的 `python3`。部署 API 时必须同时带上 `services/pdf-layout/worker.py`，相对目录结构与仓库一致。

Linux 系统如缺少 OpenCV 运行库，安装 `libgl1`、`libglib2.0-0`。Windows 使用 `.venv-docling/Scripts/python.exe`，配置该文件的绝对路径。

首次真正解析会下载并加载 Docling 版面模型和 RapidOCR 模型，需允许访问模型托管站。`--check` 只验证依赖和接口导入，不代表模型权重已就绪。生产环境建议先用代表性 PDF 预热：

```bash
.venv-docling/bin/python services/pdf-layout/worker.py --source /absolute/path/sample.pdf --cache /absolute/path/cache
```

可通过 `DOCLING_ARTIFACTS_PATH` 指定已预取的 Docling 模型目录；RapidOCR 模型缓存也需随运行用户保留。离线部署前应在联网环境按相同用户与依赖完成预热并拷贝模型缓存，不能只复制 Python 包。GPU 环境按 PyTorch 官方说明安装匹配版本；本项目没有硬编码 GPU，也不保证 CPU 上大文档快速完成。

## 页面使用

PDF 右侧选择“智能版面解析（推荐）”。正常模式先尝试直接导入 PDF 原生书签；没有书签才启动后台解析。文字层乱码时可启用“强制 OCR”。混合文件默认只对需要的区域做 OCR。

任务提交后可关闭阅读页面，再次打开会继续轮询后台进度。任务每 12 页落盘完整结构化 JSON（包括文本、版面与来源位置），数据库保存候选目录和进度。任务失败或服务重启后，再点继续会按原文件 SHA-256、依赖版本、OCR 选项和批次范围复用成功缓存，失败批次重跑。单实例全站同时一个版面任务；每任务最长 30 分钟，100MB / 2000 页上限。

结果不会自动覆盖已有目录或编辑草稿。点击“预览识别结果”将候选合并到现有草稿，人工调整后点保存发布。失败时也可预览已完成的候选。未找到标题的批次仍缓存，并继续下一批。

## 边界

- 本功能提供正文版面标题识别，不实现纸质目录页与正文的模糊匹配；已有“从目录页生成”入口继续可用。
- 分批转换使无编号标题的相对样式层级可能跨批不一致，编号标题会统一按编号深度恢复。目录仍需人工核对。
- 页面坐标保留在结构化缓存中，本次 UI 跳转使用物理页码，没有精确到标题坐标。
- 扫描模糊、水印、多栏、图内标题仍可能漏检或误检。不会退回纯 OCR 后宣称版面解析成功。
- 模型是本地推理，不消耗 API token，但消耗内存、CPU / GPU 和磁盘；首次模型下载时间不计入“已经部署完成”。
- 数据目录下 `pdf-layout/<文档ID>/<文件哈希>/` 为持久缓存；任务临时 PDF 在结束后删除。重启异常遗留的 `.pdf` 可在无任务运行时清理；删除文档后的磁盘缓存可按文档 ID 定期清理。

官方接口：[标题层级](https://docling-project.github.io/docling/usage/heading_levels/)、[管线配置](https://docling-project.github.io/docling/reference/pipeline_options/)。

验证：`python3 -m unittest discover -s services/pdf-layout -p 'test_*.py'`；API 的 `test/pdf-layout.cjs` 验证任务调度、缓存协议、权限、失败保留和草稿隔离。模型效果需另用真实文档回归，不应以协议测试代替。

## 本次验证记录

在独立 CPU 虚拟环境中安装 Docling 2.142.1 / docling-core 2.104.0 / RapidOCR 3.10.0，通过实际导入和模型运行：

- 14 页生成的英文文字 PDF：识别 28 个一级 / 二级标题，第二批第 13、14 页的物理页码保持正确；重跑两批均命中缓存。
- 2 页生成的英文混合 PDF（原生文字 + 栅格扫描图）：识别出两类页面的标题及层级。扫描页出现过标题文字与编号顺序偏差，须在编辑列表核对。
- 此验证不等同于中文扫描书籍、多栏论文、水印文档的准确率评测。部署前应补充业务 PDF 回归。
