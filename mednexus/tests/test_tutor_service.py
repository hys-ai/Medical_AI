import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class TutorServiceTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.patches = [patch.object(server, 'DB_PATH', Path(self.temp.name)/'chat.sqlite3'),
                        patch.object(server.tutor_model, 'generator', return_value=None),
                        patch.object(server.tutor_model, 'status', return_value={
                            'mode':'local_materials','label':'本地资料对话','available':False,'note':'fixture'})]
        for item in self.patches:
            item.start()
        server.init_db()
        self.learner = 'a'*48
        with server.connect() as db:
            self.task = server.make_task(db, self.learner, 'oculomotor')

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.temp.cleanup()

    def turn(self, message='为什么会出现上睑下垂', request_id='1'*32):
        return server.tutor_turn(self.learner, {'token':self.task['token'], 'message':message, 'request_id':request_id})

    def test_history_resume_idempotency_and_foreign_identity(self):
        first = self.turn()
        self.assertEqual(len(first['messages']), 2)
        self.assertEqual(first['remaining'], 11)
        self.assertEqual(self.turn()['messages'], first['messages'])
        with self.assertRaises(server.InputError):
            self.turn('同一编号换个问题')
        second = self.turn('还是不懂，能再解释一下吗', '2'*32)
        self.assertEqual(len(second['messages']), 4)
        with server.connect() as db:
            self.assertEqual(server.tutor_snapshot(db,self.learner,self.task['token'])['messages'],second['messages'])
            with self.assertRaises(server.InputError):
                server.tutor_snapshot(db,'b'*48,self.task['token'])
            self.assertEqual(len(server.attempts_get(db,self.learner)),0)

    def test_dialogue_assistance_is_server_owned_and_post_answer_does_not_regrade(self):
        self.turn()
        with server.connect() as db:
            question = server.QUESTION_MAP[server.state_get(db,self.learner)['active']['question']][1]
            result = server.grade(db,self.learner, {'token':self.task['token'],
                'answers':[p['correct'] for p in question['points']], 'dialogue_assisted':False})
            self.assertTrue(result['assisted'])
            self.assertTrue(result['dialogue_assisted'])
            self.assertEqual(result['hinted_points'],[])
            self.assertEqual(result['score'],100)
        self.turn('为什么不是所有情况都散瞳', '3'*32)
        with server.connect() as db:
            self.assertEqual(server.grade(db,self.learner,{'token':self.task['token']}), result)
            summary = server.export_learning(db,self.learner)
            self.assertTrue(summary['report']['history'][0]['dialogue_assisted'])
            self.assertNotIn('为什么会出现',json.dumps(summary,ensure_ascii=False))

    def test_post_answer_only_dialogue_keeps_independent_grade(self):
        with server.connect() as db:
            result = server.grade(db,self.learner,{'token':self.task['token'],'answers':['暂时不确定']*3})
        self.turn()
        with server.connect() as db:
            result2 = server.grade(db,self.learner,{'token':self.task['token']})
        self.assertEqual(result,result2)
        self.assertFalse(result2['assisted'])

    def test_limit_and_invalid_input_do_not_add_messages(self):
        for message in [None,[],True,'a','x'*1001]:
            with self.assertRaises(server.InputError):
                self.turn(message)
        for index in range(12):
            last = self.turn(request_id=f'{index:032x}')
        self.assertEqual(last['remaining'],0)
        with self.assertRaises(server.InputError):
            self.turn(request_id='f'*32)
        self.assertEqual(len(self.turn(request_id='0'*32)['messages']),24)

    def test_late_generation_cannot_restore_reset_data(self):
        def reset_then_reply(*args, **kwargs):
            with server.LOCK, server.connect() as db:
                server.reset_learning(db,self.learner,{'confirmation':'CLEAR_MY_LEARNING'})
            return {'message':'fixture','follow_up':'fixture','sources':[],'mode':'fixture'}
        with patch.object(server.tutor_chat,'reply',side_effect=reset_then_reply):
            with self.assertRaises(server.InputError):
                self.turn()
        with server.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM tutor_conversations').fetchone()[0],0)

    def test_parallel_duplicate_is_generated_once_and_other_learning_can_run(self):
        started, release = threading.Event(), threading.Event()
        outputs, errors = [], []
        def generate(*args, **kwargs):
            started.set()
            self.assertTrue(release.wait(5))
            return {'message':'fixture','follow_up':'fixture','sources':[],'mode':'fixture'}
        def worker():
            try:
                outputs.append(self.turn())
            except Exception as error:
                errors.append(error)
        with patch.object(server.tutor_chat,'reply',side_effect=generate) as mocked:
            one = threading.Thread(target=worker); two = threading.Thread(target=worker)
            one.start(); self.assertTrue(started.wait(3)); two.start()
            with server.LOCK, server.connect() as db:
                result = server.grade(db,self.learner,{'token':self.task['token'],'answers':['暂时不确定']*3})
                self.assertTrue(result['dialogue_assisted'])
            release.set(); one.join(5); two.join(5)
            self.assertFalse(errors)
            self.assertEqual(mocked.call_count,1)
            self.assertEqual(len(outputs),2)
            self.assertEqual(outputs[0]['messages'], outputs[1]['messages'])


if __name__ == '__main__':
    unittest.main()
