import json
from pathlib import Path
import sys
import tempfile
import unittest
import subprocess
import time
from concurrent.futures import ThreadPoolExecutor
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import materials


class MaterialTests(unittest.TestCase):
    def fixture(self, folder):
        data = {'source':'fixture.docx','pages':[{'id':'histology-1','image':'histology-1.png',
            'image_number':1,'lines':[{'text':'1、fixture OCR','confidence':.7,
                'box':[[10,10],[100,10],[100,30],[10,30]]}]}]}
        path = Path(folder) / 'histology.json'
        path.write_text(json.dumps(data), encoding='utf-8')
        token = materials.line_token(1, 0, data['pages'][0]['lines'][0])
        return path, {'page':1,'line':0,'token':token,'revision':0,
            'action':'save','text':'1、corrected fixture','checked':False}

    def test_review_persists_searchable_text_without_overwriting_ocr(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(materials,'DATA',Path(folder)):
            path, body = self.fixture(folder)
            original = path.read_bytes()
            self.assertEqual(materials.save_review(body)['revision'], 1)
            page = materials.load_materials()['histology']['pages'][0]
            self.assertIn('corrected fixture', page['text'])
            self.assertEqual(page['lines'][0]['base_text'], '1、fixture OCR')
            self.assertTrue(page['lines'][0]['needs_review'])
            self.assertFalse(page['lines'][0]['visually_checked'])
            self.assertEqual(path.read_bytes(), original)

    def test_restore_retains_history_and_reopens_review(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(materials,'DATA',Path(folder)):
            _, body = self.fixture(folder)
            materials.save_review({**body, 'checked':True})
            self.assertTrue(materials.load_materials()['histology']['pages'][0]['lines'][0]['user_reviewed'])
            materials.save_review({**body, 'revision':1, 'action':'restore'})
            line = materials.load_materials()['histology']['pages'][0]['lines'][0]
            self.assertEqual(line['text'], '1、fixture OCR')
            self.assertFalse(line['user_reviewed'])
            self.assertTrue(line['needs_review'])
            self.assertEqual(len(line['review_history']), 2)
            self.assertEqual(line['review_history'][0]['text'], body['text'])

    def test_stale_revision_and_regenerated_source_cannot_be_overwritten(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(materials,'DATA',Path(folder)):
            path, body = self.fixture(folder)
            materials.save_review(body)
            with self.assertRaises(materials.ReviewConflict):
                materials.save_review(body)
            data = json.loads(path.read_text())
            data['pages'][0]['lines'][0]['text'] = 'regenerated source'
            path.write_text(json.dumps(data), encoding='utf-8')
            with self.assertRaises(materials.ReviewConflict):
                materials.save_review({**body, 'revision':1})
            line = materials.load_materials()['histology']['pages'][0]['lines'][0]
            self.assertEqual(line['text'], 'regenerated source')
            self.assertFalse(line['user_edited'])
            self.assertEqual(len(line['review_history']), 1)

    def test_invalid_review_does_not_create_revision_file(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(materials,'DATA',Path(folder)):
            _, body = self.fixture(folder)
            for change in [{'page':True}, {'line':-1}, {'revision':False}, {'action':'delete'},
                           {'text':' '}, {'text':'a'*2001}, {'checked':'yes'}, {'page':99}]:
                with self.subTest(change=change), self.assertRaises(ValueError):
                    materials.save_review({**body, **change})
            self.assertFalse((Path(folder)/'histology.reviews.json').exists())

    def test_two_simultaneous_editors_cannot_silently_replace_each_other(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(materials,'DATA',Path(folder)):
            _, body = self.fixture(folder)
            def save(text):
                try:
                    materials.save_review({**body,'text':text})
                    return 'saved'
                except materials.ReviewConflict:
                    return 'conflict'
            with ThreadPoolExecutor(max_workers=2) as pool:
                results = list(pool.map(save,['editor A','editor B']))
            self.assertCountEqual(results, ['saved','conflict'])
            self.assertEqual(len(materials.load_reviews()['1:0']['history']), 1)

    def test_separate_server_processes_serialize_revision_files(self):
        child = '''
import json, sys, time
from pathlib import Path
sys.path.insert(0, sys.argv[1])
import materials
payload = json.load(sys.stdin)
materials.DATA = Path(payload['folder'])
time.sleep(max(0, payload['start'] - time.time()))
try:
    materials.save_review(payload['body'])
    print('saved')
except materials.ReviewConflict:
    print('conflict')
'''
        for same_line in [True, False]:
            with self.subTest(same_line=same_line), tempfile.TemporaryDirectory() as folder, patch.object(materials,'DATA',Path(folder)):
                path, body = self.fixture(folder)
                data = json.loads(path.read_text())
                second = {'text':'2、second fixture','confidence':.7}
                data['pages'][0]['lines'].append(second)
                path.write_text(json.dumps(data),encoding='utf-8')
                other = body if same_line else {**body,'line':1,'token':materials.line_token(1,1,second)}
                start = time.time() + .5
                def run_worker(request):
                    result = subprocess.run([sys.executable,'-c',child,str(Path(materials.__file__).parent)],
                        input=json.dumps({'folder':folder,'body':request,'start':start}),
                        text=True,capture_output=True,timeout=15)
                    self.assertEqual(result.returncode,0,result.stderr)
                    return result.stdout.strip()
                with ThreadPoolExecutor(max_workers=2) as pool:
                    outcomes = list(pool.map(run_worker,[body,other]))
                self.assertCountEqual(outcomes,['saved','conflict'] if same_line else ['saved','saved'])
                reviews = materials.load_reviews()
                self.assertEqual(sum(len(entry['history']) for entry in reviews.values()),1 if same_line else 2)

    def test_second_ocr_does_not_replace_card_heading_with_margin_note(self):
        box = [[100,100],[300,100],[300,120],[100,120]]
        page = {'id':'histology-1', 'image':'histology-1.png', 'image_number':1,
            'original_lines':[{'text':'1、original heading','box':box}],
            'lines':[{'text':'margin note','box':[[0,100],[80,100],[80,120],[0,120]]},
                     {'text':'1、refined heading','box':box}]}
        card = materials.review_cards({'pages':[page]})[0]
        self.assertEqual(card['id'], 'histology-1-0')
        self.assertEqual(card['cue'], '1、refined heading')
        self.assertIn('margin note', card['text'])

    def test_layout_keeps_columns_and_flags_uncertainty(self):
        data = {'pages':[{'image_number':1, 'lines':[
            {'text':'右栏','confidence':.99,'box':[[200,10],[300,10],[300,30],[200,30]]},
            {'text':'左栏','confidence':.7,'box':[[10,10],[100,10],[100,30],[10,30]]},
            {'text':'下一行','confidence':.98,'box':[[10,60],[100,60],[100,80],[10,80]]}]}]}
        with tempfile.TemporaryDirectory() as folder, patch.object(materials,'DATA',Path(folder)):
            result=materials.prepare_histology(data)['pages'][0]
        self.assertEqual(result['text'],'左栏 ｜ 右栏\n下一行')
        self.assertEqual(result['review_count'],1)
        self.assertNotIn('needs_review',data['pages'][0]['lines'][0])

    def test_visual_corrections_require_matching_page_and_exact_text(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(materials,'DATA',Path(folder)):
            (Path(folder)/'histology.corrections.json').write_text(json.dumps([
                {'page':8,'before':'fixture typo','after':'fixture fixed','basis':'原图核对'}]),encoding='utf-8')
            data={'pages':[{'image_number':page,'lines':[{'text':'fixture typo','confidence':.7}]} for page in [1,8]]}
            result=materials.prepare_histology(data)
            self.assertEqual(result['pages'][0]['text'],'fixture typo')
            self.assertEqual(result['pages'][1]['text'],'fixture fixed')
            self.assertEqual(result['pages'][1]['lines'][0]['source_text'],'fixture typo')
            self.assertTrue(result['pages'][1]['lines'][0]['visually_checked'])

    def test_missing_private_files_are_empty(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(materials, 'DATA', Path(folder)):
            self.assertEqual(materials.load_materials(), {'syllabus': {}, 'histology': {}})

    def test_review_cards_keep_source_and_do_not_invent_answers(self):
        source = {'source':'fixture.docx','pages':[{'id':'histology-1','image':'histology-1.png',
            'image_number':1,'lines':[{'text':'heading'},{'text':'0.2nm 薄切片'},{'text':'1. 测试题干'},
                {'text':'原资料要点甲'},{'text':'2、测试题乙'},{'text':'原资料要点乙'}]}]}
        cards = materials.review_cards(source)
        self.assertEqual(len(cards), 2)
        self.assertEqual(cards[0]['cue'], '1. 测试题干')
        self.assertIn('原资料要点甲', cards[0]['text'])
        self.assertNotIn('原资料要点乙', cards[0]['text'])
        self.assertEqual(cards[0]['image_number'], 1)
        self.assertNotIn('correct', cards[0])
        self.assertNotIn('page', cards[0])

    def test_image_allowlist_blocks_other_local_files(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(materials, 'DATA', Path(folder)):
            images = Path(folder) / 'images'; images.mkdir()
            image = images / 'histology-1.png'; image.write_bytes(b'test fixture')
            self.assertEqual(materials.image_path('histology-1.png'), image)
            for name in ['../syllabus.json', 'learning.sqlite3', 'histology-1.svg', 'histology-0.png']:
                self.assertIsNone(materials.image_path(name))

if __name__ == '__main__':
    unittest.main()
