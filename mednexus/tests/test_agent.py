import json
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server
from knowledge import CONCEPTS, CONCEPT_MAP, QUESTION_MAP


class AgentTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old_db = server.DB_PATH
        server.DB_PATH = Path(self.temp.name) / 'test.sqlite3'
        server.init_db()
        self.learner = 'a' * 48

    def tearDown(self):
        server.DB_PATH = self.old_db
        self.temp.cleanup()

    def answer(self, db, cid='oculomotor', correct_count=3, kind='auto', confidence='一般'):
        task = server.make_task(db, self.learner, cid, kind)
        c, q = QUESTION_MAP[server.state_get(db, self.learner)['active']['question']]
        answers = [p['correct'] if i < correct_count else '暂时不确定' for i, p in enumerate(q['points'])]
        return server.grade(db, self.learner, {'token': task['token'], 'answers': answers, 'confidence': confidence})

    def test_exactly_twenty_questions_with_three_points(self):
        self.assertEqual(len(QUESTION_MAP), 20)
        for cid, (c, q) in QUESTION_MAP.items():
            self.assertEqual(len(q['points']), 3)
            for p in q['points']:
                self.assertEqual(p['options'].count(p['correct']), 1)

    def test_empty_account_has_no_fake_achievements(self):
        with server.connect() as db:
            s = server.snapshot(db, self.learner)
            self.assertEqual(s['stats']['attempts'], 0)
            self.assertEqual(s['stats']['mastered'], 0)
            self.assertTrue(all(c['score'] is None for c in s['concepts']))

    def test_reading_is_coverage_not_mastery(self):
        with server.connect() as db:
            server.event(db, self.learner, 'study', 'oculomotor')
            c = server.progress(db, self.learner)[0]
            self.assertTrue(c['viewed'])
            self.assertIsNone(c['score'])
            self.assertEqual(c['status'], '未测评')

    def test_partial_correct_is_not_mastery(self):
        with server.connect() as db:
            r = self.answer(db, correct_count=1)
            self.assertEqual(r['score'], 33)
            self.assertEqual(r['action'], 'followup')
            self.assertEqual(sum(p['correct'] for p in r['rubric']), 1)
            self.assertEqual(server.progress(db, self.learner)[0]['status'], '需巩固')

    def test_wrong_and_correct_have_different_next_actions(self):
        with server.connect() as db:
            wrong = self.answer(db, 'oculomotor', 0)
            right = self.answer(db, 'light', 3)
            self.assertEqual(wrong['action'], 'study')
            self.assertEqual(right['action'], 'transfer')

    def test_one_perfect_task_is_only_initial_evidence(self):
        with server.connect() as db:
            self.answer(db)
            self.assertEqual(server.progress(db, self.learner)[0]['status'], '初步达标')

    def test_repeated_same_task_cannot_establish_mastery(self):
        with server.connect() as db:
            self.answer(db, kind='diagnostic')
            self.answer(db, kind='diagnostic')
            c = server.progress(db, self.learner)[0]
            self.assertEqual(c['distinct'], 1)
            self.assertNotEqual(c['status'], '已掌握')

    def test_two_different_passed_tasks_including_transfer_establish_mastery(self):
        with server.connect() as db:
            self.answer(db, kind='diagnostic')
            self.answer(db, kind='transfer')
            c = server.progress(db, self.learner)[0]
            self.assertEqual(c['distinct'], 2)
            self.assertEqual(c['status'], '已掌握')

    def test_regression_removes_mastered_status(self):
        with server.connect() as db:
            self.answer(db, kind='diagnostic')
            self.answer(db, kind='transfer')
            self.answer(db, correct_count=0, kind='transfer')
            self.assertEqual(server.progress(db, self.learner)[0]['status'], '需巩固')

    def test_repeated_submission_is_idempotent(self):
        with server.connect() as db:
            task = server.make_task(db, self.learner, 'oculomotor')
            answers = [p['correct'] for p in CONCEPTS[0]['questions'][0]['points']]
            body = {'token': task['token'], 'answers': answers}
            first = server.grade(db, self.learner, body)
            second = server.grade(db, self.learner, body)
            self.assertEqual(first, second)
            self.assertEqual(len(server.attempts_get(db, self.learner)), 1)

    def test_answers_cannot_supply_arbitrary_true_values(self):
        with server.connect() as db:
            task = server.make_task(db, self.learner, 'oculomotor')
            with self.assertRaises(server.InputError):
                server.grade(db, self.learner, {'token': task['token'], 'answers': [True, True, True]})

    def test_student_data_is_partitioned(self):
        with server.connect() as db:
            self.answer(db)
            other = server.snapshot(db, 'b' * 48)
            self.assertEqual(other['stats']['attempts'], 0)

    def test_refresh_retains_active_question_and_options(self):
        with server.connect() as db:
            first = server.make_task(db, self.learner, 'oculomotor')
            second = server.make_task(db, self.learner, 'oculomotor')
            self.assertEqual(first, second)
            self.assertNotIn('correct', json.dumps(first))

    def test_unsupported_question_is_refused(self):
        with server.connect() as db:
            for q in ('量子纠缠是什么', '明天郑州天气', 'Python怎样读取文件', '公司股权结构怎么设计', '为什么股票会上涨', '为什么量子纠缠会发生'):
                self.assertTrue(server.ask(db, self.learner, {'query': q})['refused'])

    def test_relevant_question_retrieves_notes_without_fake_pages(self):
        with server.connect() as db:
            out = server.ask(db, self.learner, {'query': '动眼神经损伤为什么上睑下垂'})
            self.assertFalse(out['refused'])
            self.assertTrue(all(s['page'] is None for s in out['citations']))
            sources = server.all_sources(db, self.learner)
            for seg in out['segments']:
                s = next(s for s in sources if s['id'] == seg['source_id'])
                self.assertTrue(server.verify_citation(s, seg['quote'], sources))

    def test_forged_page_and_nonexistent_excerpt_fail_validation(self):
        s = server.builtins()[0]
        self.assertFalse(server.verify_citation({**s, 'page': 119}, s['text'][:10], [s]))
        self.assertFalse(server.verify_citation(s, '这是一句不存在的话', [s]))

    def test_metadata_only_does_not_become_answer_evidence(self):
        with server.connect() as db:
            server.import_sources(db, self.learner, [{'book':'测试教材','chapter':'细胞焦亡的未知标记','page':123,'keywords':['细胞焦亡']}])
            out = server.ask(db, self.learner, {'query':'细胞焦亡的未知标记是什么'})
            self.assertTrue(out['refused'])
            self.assertTrue(out['citations'])

    def test_import_validation_is_atomic(self):
        with server.connect() as db:
            with self.assertRaises(server.InputError):
                server.import_sources(db, self.learner, [{'book':'有效','chapter':'脑神经','page':1},{'book':'无效','chapter':'脑神经','page':None}])
            self.assertEqual(db.execute('SELECT COUNT(*) FROM sources').fetchone()[0], 0)

    def test_text_import_can_be_matched_and_sources_are_private(self):
        with server.connect() as db:
            server.import_sources(db, self.learner, [{'book':'自写练习讲义','chapter':'细胞焦亡','page':12,'keywords':['细胞焦亡'],'text':'细胞焦亡的练习文本仅用于索引测试，不代表医学结论。'}])
            out=server.ask(db,self.learner,{'query':'细胞焦亡练习文本是什么'})
            self.assertFalse(out['refused'])
            self.assertEqual(out['citations'][0]['page'],12)
            self.assertTrue(server.ask(db,'b'*48,{'query':'细胞焦亡练习文本是什么'})['refused'])

    def test_javascript_source_url_is_rejected(self):
        with server.connect() as db:
            with self.assertRaises(server.InputError):
                server.import_sources(db,self.learner,[{'book':'x','chapter':'x','page':1,'url':'javascript:alert(1)'}])

    def test_research_gate_does_not_send_simple_memory_error_to_pubmed(self):
        c=CONCEPTS[0]
        self.assertFalse(server.research_gate(c,'动眼神经是第几对')['eligible'])
        self.assertFalse(server.research_gate(c,'量子纠缠有何研究证据')['eligible'])
        self.assertTrue(server.research_gate(c,c['research'])['eligible'])

    def test_pubmed_uses_real_response_and_specific_publication_type(self):
        search=json.dumps({'esearchresult':{'idlist':['1234'],'count':'1','querytranslation':'test'}}).encode()
        fetch=b'''<PubmedArticleSet><PubmedArticle><MedlineCitation><PMID>1234</PMID><Article><ArticleTitle>Test <i>Title</i></ArticleTitle><Journal><Title>Test Journal</Title><JournalIssue><PubDate><Year>2025</Year></PubDate></JournalIssue></Journal><Abstract><AbstractText Label="RESULTS">Only the returned evidence.</AbstractText></Abstract><PublicationTypeList><PublicationType>Review</PublicationType><PublicationType>Systematic Review</PublicationType></PublicationTypeList><AuthorList><Author><LastName>Li</LastName><Initials>A</Initials></Author></AuthorList></Article></MedlineCitation><PubmedData><ArticleIdList><ArticleId IdType="doi">10.1000/test</ArticleId></ArticleIdList></PubmedData></PubmedArticle></PubmedArticleSet>'''
        with patch('server.ncbi_get',side_effect=[search,fetch]):
            out=server.pubmed('test')
        p=out['papers'][0]
        self.assertEqual(p['title'],'Test Title')
        self.assertEqual(p['evidence'],'系统综述')
        self.assertEqual(p['pmid'],'1234')
        self.assertEqual(p['abstract'][0]['text'],'Only the returned evidence.')
        with patch('server.ncbi_get',side_effect=AssertionError('cache not used')):
            self.assertTrue(server.pubmed('test')['cached'])

    def test_full_recovery_loop_remains_conservative(self):
        with server.connect() as db:
            self.answer(db,correct_count=1,kind='diagnostic')
            server.event(db,self.learner,'study','oculomotor')
            self.answer(db,kind='transfer')
            self.assertNotEqual(server.progress(db,self.learner)[0]['status'],'已掌握')
            self.answer(db,kind='diagnostic')
            report=server.report(db,self.learner)
            self.assertEqual(report['concepts'][0]['status'],'已掌握')
            self.assertEqual(report['concepts'][0]['pre'],33)
            self.assertEqual(report['concepts'][0]['post'],100)
            self.assertEqual(report['stats']['attempts'],3)
            self.assertIn('机制理解',report['errors'])

    def test_all_default_research_templates_pass_gate(self):
        for c in CONCEPTS:
            self.assertTrue(server.research_gate(c,'')['eligible'], c['id'])

    def test_model_failure_falls_back_to_local_quotes(self):
        with server.connect() as db, patch('server.API_KEY','test-only'), patch('server.model_json',side_effect=TimeoutError):
            out=server.ask(db,self.learner,{'query':'动眼神经损伤为什么上睑下垂'})
        self.assertFalse(out['refused'])
        self.assertTrue(out['warning'])
        self.assertTrue(out['segments'])

    def test_model_forged_citations_are_discarded(self):
        fake={'segments':[{'source_id':'forged','quote':'编造的资料','explanation':'不应展示'}]}
        with server.connect() as db, patch('server.API_KEY','test-only'), patch('server.model_json',return_value=fake):
            out=server.ask(db,self.learner,{'query':'动眼神经损伤为什么上睑下垂'})
        self.assertTrue(out['warning'])
        self.assertNotIn('不应展示',json.dumps(out,ensure_ascii=False))

    def test_model_valid_quote_explanation_is_still_labeled_unverified(self):
        s=server.builtins()[0]
        generated={'segments':[{'source_id':s['id'],'quote':s['text'][:50],'explanation':'测试用解释'}]}
        with server.connect() as db, patch('server.API_KEY','test-only'), patch('server.model_json',return_value=generated):
            out=server.ask(db,self.learner,{'query':'动眼神经损伤为什么上睑下垂'})
        self.assertIn('解释仍需核对',out['mode'])

    def test_windows_https_fallback_never_evaluates_query_as_script(self):
        url='https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?term=test%26example'
        completed=server.subprocess.CompletedProcess([],0,stdout=b'{"ok":true}',stderr=b'')
        with patch('server.shutil.which',return_value='powershell.exe'), patch('server.subprocess.run',return_value=completed) as run:
            self.assertEqual(server.windows_https_get(url),b'{"ok":true}')
        args,kwargs=run.call_args
        self.assertNotIn(url,args[0])
        self.assertEqual(kwargs['input'],url.encode())
        self.assertNotIn('SkipCertificateCheck',' '.join(args[0]))
        self.assertNotIn('shell',kwargs)
        with self.assertRaises(server.InputError):
            server.windows_https_get('https://example.org/')


if __name__ == '__main__':
    unittest.main(verbosity=2)
