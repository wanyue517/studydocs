import importlib.util
import json
from pathlib import Path
import tempfile
import unittest

spec = importlib.util.spec_from_file_location('worker', Path(__file__).with_name('worker.py'))
worker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(worker)

class HeadingsTest(unittest.TestCase):
    def test_layout_provenance(self):
        document = {'texts': [
            {'label': 'section_header', 'text': '1.2.3 Architecture', 'level': 1, 'prov': [{'page_no': 14}]},
            {'label': 'section_header', 'text': 'A visual heading', 'level': 2, 'prov': [{'page_no': 15}]},
            {'label': 'page_header', 'text': 'Repeated header', 'prov': [{'page_no': 15}]},
            {'label': 'text', 'text': 'Ordinary body text', 'prov': [{'page_no': 15}]},
            {'label': 'section_header', 'text': 'TOC item ...... 48', 'prov': [{'page_no': 15}]},
        ]}
        self.assertEqual(worker.headings(document, 13, 24), [
            {'title':'1.2.3 Architecture','level':3,'page':14},
            {'title':'A visual heading','level':2,'page':15},
        ])
        with self.assertRaises(ValueError):
            worker.headings(document, 1, 12)

    def test_atomic_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'stage.json'
            worker.atomic_json(path, {'texts': [], 'pages': {'1': {}}})
            self.assertEqual(json.loads(path.read_text()), {'texts': [], 'pages': {'1': {}}})
            self.assertFalse(path.with_suffix('.tmp').exists())

if __name__ == '__main__':
    unittest.main()
