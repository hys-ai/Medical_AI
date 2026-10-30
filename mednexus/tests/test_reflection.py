"""Synthetic learning reflections, isolated from real student records."""
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server
from knowledge import QUESTION_MAP


class ReflectionTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.override = patch.object(server, 'DB_PATH', Path(self.temp.name) / 'reflection.sqlite3')
        self.override.start()
        server.init_db()
        self.learner = 'a' * 48

    def tearDown(self):
        self.override.stop()
        self.temp.cleanup()

    def body(self, db, correct=1):
        task = server.make_task(db, self.learner, 'oculomotor', 'diagnostic')
        _, question = QUESTION_MAP[server.state_get(db, self.learner)['active']['question']]
        return {'token': task['token'], 'answers': [p['correct'] if i < correct else '暂时不确定'
                                                   for i, p in enumerate(question['points'])]}

    def test_omitted_confidence_is_not_fabricated_and_high_confidence_error_is_visible(self):
        with server.connect() as db:
            result = server.grade(db, self.learner, self.body(db))
            self.assertEqual(result['confidence'], '未填写')
            self.assertEqual(result['confidence_source'], 'omitted')
            self.assertEqual(result['calibration'], '')
            result = server.grade(db, self.learner, {**self.body(db), 'confidence': '很有把握'})
            self.assertEqual(result['score'], 33)
            self.assertTrue(result['calibration'])
            self.assertEqual(result['confidence_source'], 'self_reported')

    def test_reflection_and_confidence_do_not_change_structured_grade_or_assistance(self):
        with server.connect() as db:
            body = self.body(db)
            result = server.grade(db, self.learner, {**body, 'confidence': '不确定', 'reasoning': '  合成推理，仅记录。  '})
            self.assertEqual(result['score'], 33)
            self.assertFalse(result['assisted'])
            self.assertEqual(result['reasoning'], '合成推理，仅记录。')
            self.assertEqual(server.export_learning(db, self.learner)['report']['history'][0]['confidence_source'], 'self_reported')
            self.assertEqual(server.state_get(db, self.learner)['last_result']['reasoning'], result['reasoning'])
            # An idempotent retry cannot replace the actual submitted reflection.
            again = server.grade(db, self.learner, {**body, 'confidence': '很有把握', 'reasoning': '更改内容'})
            self.assertEqual(again, result)
            self.assertEqual(db.execute('SELECT COUNT(*) FROM attempts').fetchone()[0], 1)

    def test_invalid_reflection_is_rejected_without_grading_or_removing_the_active_task(self):
        with server.connect() as db:
            body = self.body(db)
            for extra in ({'reasoning': {}}, {'reasoning': None}, {'reasoning': ['text']},
                          {'reasoning': '字' * 3001}, {'confidence': 'arbitrary'}, {'confidence': []}):
                with self.subTest(extra_type=type(extra.get('reasoning')).__name__), self.assertRaises(server.InputError):
                    server.grade(db, self.learner, {**body, **extra})
                self.assertEqual(db.execute('SELECT COUNT(*) FROM attempts').fetchone()[0], 0)
                self.assertEqual(server.state_get(db, self.learner)['active']['token'], body['token'])

    def test_obvious_personal_fields_are_rejected_before_persistence(self):
        with server.connect() as db:
            body = self.body(db)
            for reasoning in ('姓名：合成测试', 'patient name: synthetic', 'test@example.org', '13800138000'):
                with self.assertRaisesRegex(server.InputError, '补充推理'):
                    server.grade(db, self.learner, {**body, 'reasoning': reasoning})
            self.assertEqual(db.execute('SELECT COUNT(*) FROM attempts').fetchone()[0], 0)

    def test_submitted_reasoning_is_scoped_and_excluded_from_export(self):
        with server.connect() as db:
            server.grade(db, self.learner, {**self.body(db), 'reasoning': 'SYNTHETIC_PRIVATE_REFLECTION'})
            self.assertIn('SYNTHETIC_PRIVATE_REFLECTION', json.dumps(server.report(db, self.learner)))
            self.assertNotIn('SYNTHETIC_PRIVATE_REFLECTION', json.dumps(server.report(db, 'b' * 48)))
            self.assertNotIn('SYNTHETIC_PRIVATE_REFLECTION', json.dumps(server.export_learning(db, self.learner)))
            server.reset_learning(db, self.learner, {'scope': 'learning', 'confirmation': 'CLEAR_MY_LEARNING'})
            self.assertIsNone(server.state_get(db, self.learner).get('last_result'))
            self.assertEqual(server.report(db, self.learner)['history'], [])

    def test_legacy_confidence_export_is_distinct_from_a_student_report(self):
        with server.connect() as db:
            result = server.grade(db, self.learner, {**self.body(db), 'confidence': '一般'})
            result.pop('confidence_source')
            db.execute('UPDATE attempts SET payload=? WHERE learner=?', (json.dumps(result), self.learner))
            history = server.export_learning(db, self.learner)['report']['history']
            self.assertEqual(history[0]['confidence'], '一般')
            self.assertEqual(history[0]['confidence_source'], 'legacy_default')


if __name__ == '__main__':
    unittest.main()
