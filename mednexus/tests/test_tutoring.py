import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
from datetime import datetime, timezone

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class TutoringTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.patcher = patch.object(server, 'DB_PATH', Path(self.temp.name) / 'test.sqlite3')
        self.patcher.start()
        server.init_db()
        self.learner = 'd' * 48

    def tearDown(self):
        self.patcher.stop()
        self.temp.cleanup()

    def answer(self, db, kind, assisted=False):
        task = server.make_task(db, self.learner, 'oculomotor', kind)
        if assisted:
            server.request_hint(db, self.learner, {'token':task['token'], 'point':0, 'level':1})
        _, question = server.QUESTION_MAP[server.state_get(db,self.learner)['active']['question']]
        return server.grade(db, self.learner, {'token':task['token'],
            'answers':[p['correct'] for p in question['points']], 'assisted':False, 'hinted_points':[]})

    def test_hints_are_sequential_idempotent_and_restored(self):
        with server.connect() as db:
            task = server.make_task(db, self.learner, 'oculomotor')
            request = {'token':task['token'], 'point':1, 'level':1}
            first = server.request_hint(db, self.learner, request)
            self.assertEqual(server.request_hint(db,self.learner,request), first)
            second = server.request_hint(db,self.learner,{**request,'level':2})
            self.assertNotEqual(first['text'],second['text'])
            restored = server.make_task(db,self.learner,'oculomotor')
            self.assertEqual(restored['points'][1]['hints'],[first['text'],second['text']])
            self.assertEqual(db.execute("SELECT COUNT(*) FROM events WHERE kind='hint'").fetchone()[0],2)
            self.assertNotIn('expected',json.dumps(restored))

    def test_stale_foreign_and_invalid_hint_requests_are_rejected(self):
        with server.connect() as db:
            task = server.make_task(db,self.learner,'oculomotor')
            body = {'token':task['token'],'point':0,'level':1}
            for change in [{'point':True},{'point':3},{'level':2},{'level':False},{'token':'stale'}]:
                with self.subTest(change=change), self.assertRaises(server.InputError):
                    server.request_hint(db,self.learner,{**body,**change})
            with self.assertRaises(server.InputError):
                server.request_hint(db,'other learner',body)
            self.assertNotIn('hints',server.state_get(db,self.learner)['active'])

    def test_assisted_scores_cannot_be_forged_as_independent_mastery(self):
        with server.connect() as db:
            first = self.answer(db,'diagnostic',True)
            second = self.answer(db,'transfer',True)
            self.assertEqual(first['score'],100)
            self.assertTrue(second['assisted'])
            self.assertEqual(second['hinted_points'],[0])
            self.assertNotEqual(server.progress(db,self.learner)[0]['status'],'已掌握')
            self.answer(db,'diagnostic')
            self.answer(db,'transfer')
            self.assertEqual(server.progress(db,self.learner)[0]['status'],'已掌握')
            history = server.export_learning(db,self.learner)['report']['history']
            self.assertTrue(history[0]['assisted'])
            self.assertFalse(history[-1]['assisted'])

    def test_hint_is_rejected_after_submission_and_duplicate_grade_is_stable(self):
        with server.connect() as db:
            task = server.make_task(db,self.learner,'oculomotor')
            result = server.grade(db,self.learner,{'token':task['token'],'answers':['暂时不确定']*3})
            with self.assertRaises(server.InputError):
                server.request_hint(db,self.learner,{'token':task['token'],'point':0,'level':1})
            self.assertEqual(server.grade(db,self.learner,{'token':task['token']}),result)

    def test_overview_and_plan_share_shanghai_day_even_on_other_host_timezones(self):
        now = datetime(2026,10,28,18,tzinfo=timezone.utc).timestamp()
        with patch.object(server.time,'time',return_value=now), server.connect() as db:
            server.event(db,self.learner,'ask',payload={'query':'fixture'})
            self.answer(db,'diagnostic')
            data = server.overview_payload(db,self.learner)
            self.assertEqual(data['day_date'],'2026-10-29')
            self.assertEqual(data['questions']['day'],1)
            self.assertEqual(data['learning_plan']['counts']['practiced_today'],1)


if __name__ == '__main__':
    unittest.main()
