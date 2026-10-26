"""Private child-process worker. stdout is bounded NDJSON; diagnostics go to stderr."""
import argparse
import contextlib
import hashlib
import json
import os
from pathlib import Path
import re
import sys
from importlib.metadata import version

SCHEMA = 'layout-v1'


def emit(value):
    print(json.dumps(value, ensure_ascii=False), flush=True)


def headings(document, first, last):
    """Keep physical provenance; never substitute a printed TOC page number."""
    result = []
    seen = set()
    for item in document.get('texts', []):
        if item.get('label') not in ('section_header', 'title'):
            continue
        title = ' '.join(item.get('text', '').split())[:200]
        if not title or re.search(r'[.·…]{3,}\s*\d+$', title):
            continue
        prov = item.get('prov') or []
        if not prov:
            continue
        page = prov[0].get('page_no')
        if not isinstance(page, int) or not first <= page <= last:
            raise ValueError('Docling returned invalid physical page provenance')
        numbered = re.match(r'^(\d+(?:\.\d+)+)(?:[.、\s]|[^\d.])', title)
        level = len(numbered[1].split('.')) if numbered else item.get('level', 1)
        level = max(1, min(6, int(level)))
        key = (title, page)
        if key not in seen:
            seen.add(key)
            result.append({'title': title, 'level': level, 'page': page})
    return result


def atomic_json(path, data):
    temporary = path.with_suffix('.tmp')
    temporary.write_text(json.dumps(data, ensure_ascii=False), encoding='utf-8')
    os.replace(temporary, path)


def run(args):
    # Imports and model logs must never corrupt the stdout protocol.
    with contextlib.redirect_stdout(sys.stderr):
        import torch
        torch.set_num_threads(2)
        from docling.datamodel.accelerator_options import AcceleratorOptions
        from docling.datamodel.base_models import InputFormat, ConversionStatus
        from docling.datamodel.pipeline_options import PdfPipelineOptions, HeadingHierarchyOptions, RapidOcrOptions
        from docling.document_converter import DocumentConverter, PdfFormatOption
        import pypdfium2 as pdfium
        import rapidocr  # fail early if the configured OCR backend isn't installed
        versions = {name: version(name) for name in ['docling-slim', 'docling-core', 'docling-parse', 'docling-ibm-models', 'rapidocr', 'onnxruntime', 'torch']}
        if args.check:
            emit_result = {'ready': True, 'versions': versions}
        else:
            source = Path(args.source)
            with pdfium.PdfDocument(str(source)) as pdf:
                count = len(pdf)
            if count < 1 or count > 2000:
                raise ValueError('PDF must contain 1 to 2000 pages')
            options = PdfPipelineOptions()
            options.accelerator_options = AcceleratorOptions(num_threads=2)
            options.do_ocr = True
            options.do_table_structure = False
            options.generate_parsed_pages = True
            options.heading_hierarchy_options = HeadingHierarchyOptions(enabled=True)
            options.ocr_options = RapidOcrOptions(backend='onnxruntime', lang=['ch'], force_full_page_ocr=args.force_ocr)
            options.enable_remote_services = False
            options.allow_external_plugins = False
            if os.environ.get('DOCLING_ARTIFACTS_PATH'):
                options.artifacts_path = Path(os.environ['DOCLING_ARTIFACTS_PATH'])
            converter = None  # cached jobs should not load model weights
            cache = Path(args.cache)
            cache.mkdir(parents=True, exist_ok=True)
            signature = hashlib.sha256(json.dumps({'schema': SCHEMA, 'versions': versions, 'force': args.force_ocr, 'artifacts': os.environ.get('DOCLING_ARTIFACTS_PATH', ''), 'batch': 12}, sort_keys=True).encode()).hexdigest()
            emit_result = None
    if args.check:
        emit(emit_result)
        return
    emit({'kind': 'ready', 'pageCount': count})
    for first in range(1, count + 1, 12):
        last = min(first + 11, count)
        path = cache / f'{signature}-{first}-{last}.json'
        if path.exists():
            document = json.loads(path.read_text(encoding='utf-8'))
            entries = headings(document, first, last)
            cached = True
        else:
            emit({'kind': 'phase', 'message': f'版面识别 / OCR：第 {first}～{last} 页'})
            with contextlib.redirect_stdout(sys.stderr):
                if converter is None:
                    converter = DocumentConverter(format_options={InputFormat.PDF: PdfFormatOption(pipeline_options=options)})
                def forward(event):
                    if getattr(event, 'kind', None) == 'page_completed':
                        # Explicitly write to the protocol stream even while library stdout is redirected.
                        protocol = sys.__stdout__
                        print(json.dumps({'kind': 'page', 'page': event.page_no, 'pageCount': count}), file=protocol, flush=True)
                converted = converter.convert(source, page_range=(first, last), raises_on_error=True, progress_callback=forward)
                if converted.status != ConversionStatus.SUCCESS:
                    raise RuntimeError('Docling did not finish every page in this batch')
                document = converted.document.export_to_dict()
            entries = headings(document, first, last)
            # Save the full structured stage so title filtering can change without re-running OCR.
            atomic_json(path, document)
            cached = False
        emit({'kind': 'batch', 'entries': entries, 'completedPages': last, 'pageCount': count, 'cached': cached})
    emit({'kind': 'done', 'pageCount': count})


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--source')
    parser.add_argument('--cache')
    parser.add_argument('--force-ocr', action='store_true')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    try:
        if not args.check and (not args.source or not args.cache):
            raise ValueError('source and cache are required')
        run(args)
    except Exception as exc:
        print(f'{type(exc).__name__}: {exc}', file=sys.stderr)
        emit({'kind': 'error', 'message': 'Docling 解析失败，请检查 Python 依赖、模型文件及文档是否损坏；已完成批次已保留'})
        sys.exit(1)
