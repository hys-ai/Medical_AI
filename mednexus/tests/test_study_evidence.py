import inspect
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server
from knowledge import CONCEPT_MAP, QUESTION_MAP


class StudyEvidenceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.database = patch.object(server, 'DB_PATH', Path(self.temp.name) / 'study.sqlite3')
        self.database.start()
        self.textbooks = patch.object(server, 'textbook_sources', return_value=[])
        self.textbooks.start()
        server.init_db()
        self.learner = 'a' * 48

    def tearDown(self):
        self.textbooks.stop()
        self.database.stop()
        self.temp.cleanup()

    def answer(self, db, cid='oculomotor', wrong=(0, 1, 2), learner=None):
        learner = learner or self.learner
        task = server.make_task(db, learner, cid, 'diagnostic')
        _, question = QUESTION_MAP[server.state_get(db, learner)['active']['question']]
        return server.grade(db, learner, {
            'token': task['token'],
            'answers': ['暂时不确定' if i in wrong else p['correct'] for i, p in enumerate(question['points'])],
            # Extra client fields cannot replace the authoritative rubric.
            'rubric': [{'label': '客户端伪造', 'correct': False, 'expected': '伪造内容'}],
        })

    def add(self, db, book, text='', chapter='动眼神经', keywords=None, learner=None, page=17):
        server.import_sources(db, learner or self.learner, [{
            'book': book, 'chapter': chapter, 'page': page, 'text': text,
            'keywords': keywords or ['动眼神经'],
        }])

    def test_no_attempt_is_overview_and_keeps_honest_authored_card(self):
        with server.connect() as db:
            out = server.study_payload(db, self.learner, 'oculomotor')
            self.assertEqual(out['study_mode'], 'overview')
            self.assertEqual(out['retest_kind'], 'diagnostic')
            self.assertIsNone(out['last_result'])
            self.assertEqual(out['focus'], [])
            self.assertEqual(out['local_sources'], [])
            self.assertEqual(out['note'], CONCEPT_MAP['oculomotor']['note'])
            self.assertNotIn('page', out['source'])
            self.assertEqual(db.execute("SELECT COUNT(*) FROM events WHERE kind='study'").fetchone()[0], 1)
            self.assertTrue(server.progress(db, self.learner)[0]['viewed'])
            self.assertIsNone(server.progress(db, self.learner)[0]['score'])

    def test_partial_result_focuses_only_wrong_point_and_ignores_client_rubric(self):
        self.assertEqual(list(inspect.signature(server.study_payload).parameters), ['db', 'learner', 'cid'])
        with server.connect() as db:
            saved = self.answer(db, wrong=(2,))
            out = server.study_payload(db, self.learner, 'oculomotor')
            self.assertEqual(out['study_mode'], 'targeted')
            self.assertEqual(out['retest_kind'], 'transfer')
            self.assertEqual(out['last_result'], saved)
            self.assertEqual(len(out['focus']), 1)
            self.assertEqual(out['focus'][0]['label'], '瞳孔的变化')
            self.assertNotIn('客户端伪造', json.dumps(out, ensure_ascii=False))
            self.assertEqual(out['focus'][0]['evidence'], [])

    def test_last_result_is_scoped_to_same_concept_and_learner(self):
        with server.connect() as db:
            first = self.answer(db, wrong=(1,))
            self.answer(db, cid='light', wrong=())
            self.answer(db, wrong=(), learner='b' * 48)
            # state.last_result is for light; study must recover this concept's own result.
            out = server.study_payload(db, self.learner, 'oculomotor')
            self.assertEqual(out['last_result'], first)
            self.assertEqual([p['label'] for p in out['focus']], ['静息眼位'])
            self.assertEqual(out['retest_kind'], 'transfer')

    def test_latest_same_concept_result_replaces_prior_focus_and_zero_retests_basics(self):
        with server.connect() as db:
            self.answer(db, wrong=(2,))
            latest = self.answer(db)
            out = server.study_payload(db, self.learner, 'oculomotor')
            self.assertEqual(out['last_result'], latest)
            self.assertEqual(len(out['focus']), 3)
            self.assertEqual(out['retest_kind'], 'diagnostic')
            self.answer(db, wrong=())
            out = server.study_payload(db, self.learner, 'oculomotor')
            self.assertEqual(out['study_mode'], 'overview')
            self.assertEqual(out['focus'], [])
            self.assertEqual(out['retest_kind'], 'transfer')

    def test_sources_are_learner_scoped_even_when_global_retriever_returns_other_hits(self):
        with server.connect() as db:
            self.answer(db, wrong=(2,))
            text = '动眼神经：将瞳孔是否受累与损伤范围分开判断。'
            self.add(db, '本人授权资料', text)
            self.add(db, '另一学习者的资料', text, learner='b' * 48)
            foreign = {'id': 'foreign', 'book': '全局意外命中', 'chapter': '动眼神经',
                       'page': 999, 'kind': 'textbook', 'text': text, 'keywords': []}
            with patch.object(server.textbook, 'search', return_value=[foreign]):
                out = server.study_payload(db, self.learner, 'oculomotor')
            self.assertEqual({s['book'] for s in out['local_sources']}, {'本人授权资料'})
            self.assertEqual({s['book'] for s in out['focus'][0]['evidence']}, {'本人授权资料'})

    def test_each_focus_has_its_own_original_evidence_and_not_the_first_concept_hit(self):
        with server.connect() as db:
            self.answer(db)
            texts = {
                '上睑资料': '动眼神经。提上睑肌支配受损可解释上睑下垂。',
                '眼位资料': '动眼神经。外直肌、上斜肌的支配与动眼神经不同。',
                '瞳孔资料': '动眼神经。将瞳孔是否受累与损伤范围分开判断。',
            }
            for book, text in texts.items():
                self.add(db, book, text)
            out = server.study_payload(db, self.learner, 'oculomotor')
            expected_books = ['上睑资料', '眼位资料', '瞳孔资料']
            for point, book in zip(out['focus'], expected_books):
                self.assertIn(book, [s['book'] for s in point['evidence']])
                for source in point['evidence']:
                    self.assertIn(source['excerpt'], source['text'])
                    self.assertEqual(source['evidence_type'], 'text')
            identities = [(s['id'], s['book'], s['page']) for s in out['local_sources']]
            self.assertEqual(len(identities), len(set(identities)))

    def test_metadata_is_only_a_locator_and_never_supplies_a_text_excerpt(self):
        with server.connect() as db:
            self.answer(db, wrong=(2,))
            self.add(db, '只有页码的索引', chapter='动眼神经 · 瞳孔的变化', keywords=['动眼神经', '瞳孔的变化'])
            self.add(db, '有原文的资料', '动眼神经。将瞳孔是否受累与损伤范围分开判断。')
            out = server.study_payload(db, self.learner, 'oculomotor')
            by_book = {s['book']: s for s in out['focus'][0]['evidence']}
            locator = by_book['只有页码的索引']
            self.assertEqual(locator['kind'], 'metadata')
            self.assertEqual(locator['text'], '')
            self.assertEqual(locator['excerpt'], '')
            self.assertEqual(locator['evidence_type'], 'locator')
            self.assertIn('不能作为解释依据', locator['evidence_notice'])
            self.assertEqual(by_book['有原文的资料']['evidence_type'], 'text')

    def test_only_valid_page_sources_and_related_concept_are_used(self):
        with server.connect() as db:
            self.answer(db, wrong=(2,))
            self.add(db, '无关资料', '量子物理。将变化与范围分开判断。', chapter='物理学', keywords=['物理'])
            text = '动眼神经。将瞳孔是否受累与损伤范围分开判断。'
            invalid = [
                {'id': 'bad-page', 'book': '无页码', 'chapter': '动眼神经', 'page': None, 'kind': 'textbook', 'text': text},
                {'id': 'bool-page', 'book': '布尔页码', 'chapter': '动眼神经', 'page': True, 'kind': 'local', 'text': text},
                {'id': 'note-as-page', 'book': '自编卡', 'chapter': '动眼神经', 'page': 12, 'kind': 'note', 'text': text},
            ]
            with patch.object(server, 'textbook_sources', return_value=invalid):
                out = server.study_payload(db, self.learner, 'oculomotor')
            self.assertEqual(out['local_sources'], [])
            self.assertEqual(out['focus'][0]['evidence'], [])

    def test_global_textbook_remains_available_and_cannot_override_local_evidence(self):
        with server.connect() as db:
            self.answer(db, wrong=(2,))
            self.add(db, '本地瞳孔资料', '动眼神经。将瞳孔是否受累与损伤范围分开判断。')
            global_source = {'id': 'tb-allowed', 'book': '全局授权教材', 'chapter': '动眼神经', 'page': 21,
                             'kind': 'textbook', 'text': '动眼神经。提上睑肌支配受损可解释上睑下垂。',
                             'keywords': ['动眼神经'], 'provenance': '本地教材索引；需核验'}
            with patch.object(server, 'textbook_sources', return_value=[global_source]):
                targeted = server.study_payload(db, self.learner, 'oculomotor')
                self.assertIn('本地瞳孔资料', [s['book'] for s in targeted['focus'][0]['evidence']])
                overview = server.study_payload(db, 'c' * 48, 'oculomotor')
            self.assertIn('全局授权教材', [s['book'] for s in overview['local_sources']])
            self.assertNotIn('本地瞳孔资料', [s['book'] for s in overview['local_sources']])


if __name__ == '__main__':
    unittest.main()
