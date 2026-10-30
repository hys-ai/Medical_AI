"""Saved-answer report audit; synthetic learners never write the real database."""
import copy
import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server
from knowledge import CONCEPT_MAP, QUESTION_MAP
from reporting import build_report_evidence


class ReportingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old_db = server.DB_PATH
        server.DB_PATH = Path(self.temp.name) / 'report.sqlite3'
        server.init_db()
        self.learner = 'a' * 48

    def tearDown(self):
        server.DB_PATH = self.old_db
        self.temp.cleanup()

    def answer(self, db, cid='oculomotor', *, correct=(True, False, False), kind='diagnostic', assisted=False, learner=None):
        learner = learner or self.learner
        task = server.make_task(db, learner, cid, kind)
        active = server.state_get(db, learner)['active']
        _, question = QUESTION_MAP[active['question']]
        if assisted:
            server.request_hint(db, learner, {'token': task['token'], 'point': 0, 'level': 1})
        answers = [point['correct'] if ok else '暂时不确定' for point, ok in zip(question['points'], correct)]
        return server.grade(db, learner, {'token': task['token'], 'answers': answers})

    def evidence(self, db, learner=None):
        return server.report(db, learner or self.learner)['evidence_report']

    def test_empty_report_preserves_old_fields_without_inventing_attempts_or_mistakes(self):
        with server.connect() as db:
            result = server.report(db, self.learner)
        for key in ('concepts', 'stats', 'history', 'errors', 'events', 'method'):
            self.assertIn(key, result)
        evidence = result['evidence_report']
        self.assertEqual(evidence['recent_attempts'], [])
        self.assertEqual(evidence['review_items'], [])
        self.assertTrue(all(value == 0 for value in evidence['counts'].values()))
        self.assertFalse(evidence['limits']['recent_truncated'])
        self.assertIn('不是教学效果实验', evidence['notice'])

    def test_recent_attempt_has_actual_saved_points_and_safe_current_study_link(self):
        with server.connect() as db:
            saved = self.answer(db)
            evidence = self.evidence(db)
            rows = server.attempts_get(db, self.learner)
        recent = evidence['recent_attempts'][0]
        self.assertEqual(recent['attempt_id'], rows[0]['id'])
        self.assertEqual(recent['created'], rows[0]['created'])
        self.assertEqual(recent['question_id'], saved['question'])
        self.assertEqual(recent['kind'], 'diagnostic')
        self.assertEqual(recent['concept'], 'oculomotor')
        self.assertEqual(recent['name'], CONCEPT_MAP['oculomotor']['name'])
        self.assertEqual(recent['prompt'], QUESTION_MAP[saved['question']][1]['prompt'])
        self.assertEqual(recent['score'], 33)
        self.assertFalse(recent['assisted'])
        self.assertTrue(recent['is_latest_concept'])
        self.assertTrue(recent['can_study_current'])
        for point, original in zip(recent['points'], saved['rubric']):
            for key in ('label', 'selected', 'correct', 'expected', 'reason', 'category'):
                self.assertEqual(point[key], original[key])
        self.assertNotIn('tutor_token', recent)
        self.assertNotIn('reasoning', recent)
        self.assertEqual(evidence['counts']['missing_points'], 2)
        self.assertEqual(len(evidence['review_items'][0]['points']), 2)

    def test_other_learners_never_appear_in_audit_or_change_pending_points(self):
        other = 'b' * 48
        with server.connect() as db:
            self.answer(db, learner=self.learner)
            self.answer(db, cid='light', correct=(True, True, True), learner=other)
            first = self.evidence(db)
            second = self.evidence(db, other)
        self.assertEqual([row['concept'] for row in first['recent_attempts']], ['oculomotor'])
        self.assertEqual([row['concept'] for row in second['recent_attempts']], ['light'])
        self.assertEqual(first['counts']['missing_points'], 2)
        self.assertEqual(second['review_items'], [])

    def test_a_different_question_cannot_erase_old_errors_or_offer_mismatched_study(self):
        with server.connect() as db:
            first = self.answer(db)
            self.answer(db, kind='transfer', correct=(True, True, True))
            evidence = self.evidence(db)
        pending = evidence['review_items'][0]
        self.assertEqual(pending['question_id'], first['question'])
        self.assertEqual(pending['kind'], 'diagnostic')
        self.assertEqual(pending['missing_count'], 2)
        self.assertFalse(pending['is_latest_concept'])
        self.assertFalse(pending['can_study_current'])
        self.assertEqual(evidence['counts']['missing_points'], 2)
        self.assertEqual(evidence['recent_attempts'][0]['kind'], 'transfer')

    def test_same_question_independent_correct_answer_clears_its_own_points_only(self):
        with server.connect() as db:
            self.answer(db)
            self.answer(db, kind='transfer', correct=(False, False, True))
            self.answer(db, correct=(True, True, True))
            evidence = self.evidence(db)
        self.assertEqual(len(evidence['review_items']), 1)
        self.assertEqual(evidence['review_items'][0]['kind'], 'transfer')
        self.assertEqual(evidence['counts']['missing_points'], 2)
        self.assertEqual(evidence['counts']['independent_attempts'], 3)

    def test_assisted_correct_is_pending_independent_recheck_not_error_or_resolution(self):
        with server.connect() as db:
            self.answer(db)
            first_id = server.attempts_get(db, self.learner)[0]['id']
            self.answer(db, correct=(True, True, True), assisted=True)
            evidence = self.evidence(db)
        pending = evidence['review_items'][0]
        self.assertEqual(pending['status'], 'independent_recheck')
        self.assertEqual(pending['missing_count'], 0)
        self.assertEqual(pending['independent_recheck_count'], 2)
        self.assertFalse(pending['can_study_current'])
        self.assertTrue(pending['is_latest_concept'])
        self.assertTrue(all(point['correct'] for point in pending['points']))
        self.assertTrue(all(point['last_wrong_attempt_id'] == first_id for point in pending['points']))
        self.assertEqual(evidence['counts']['assisted_attempts'], 1)
        self.assertEqual(evidence['counts']['missing_points'], 0)
        self.assertEqual(evidence['counts']['independent_recheck_points'], 2)

    def test_initial_assisted_correct_does_not_invent_prior_errors(self):
        with server.connect() as db:
            self.answer(db, correct=(True, True, True), assisted=True)
            evidence = self.evidence(db)
        self.assertEqual(evidence['review_items'], [])
        self.assertEqual(evidence['counts']['assisted_attempts'], 1)
        self.assertEqual(evidence['counts']['independent_attempts'], 0)

    def test_points_clear_individually_and_a_new_wrong_answer_reopens_only_its_point(self):
        with server.connect() as db:
            self.answer(db, correct=(False, False, False))
            self.answer(db, correct=(True, False, True))
            halfway = self.evidence(db)
            self.answer(db, correct=(True, True, True))
            cleared = self.evidence(db)
            self.answer(db, correct=(False, True, True))
            reopened = self.evidence(db)
        self.assertEqual([point['index'] for point in halfway['review_items'][0]['points']], [1])
        self.assertEqual(cleared['review_items'], [])
        pending = reopened['review_items'][0]
        self.assertEqual([point['index'] for point in pending['points']], [0])
        self.assertEqual(pending['points'][0]['last_wrong_attempt_id'], pending['attempt_id'])

    def test_insertion_order_and_bounded_lists_keep_full_counts_without_mutating_input(self):
        with server.connect() as db:
            self.answer(db)
            base = server.attempts_get(db, self.learner)[0]
        rows = [{**base, 'id': i, 'created': 1000 - i} for i in range(1, 36)]
        before = copy.deepcopy(rows)
        evidence = build_report_evidence(list(reversed(rows)), QUESTION_MAP)
        self.assertEqual(rows, before)
        self.assertEqual(len(evidence['recent_attempts']), 30)
        self.assertEqual(evidence['recent_attempts'][0]['attempt_id'], 35)
        self.assertEqual(evidence['recent_attempts'][-1]['attempt_id'], 6)
        self.assertEqual(evidence['counts']['attempts'], 35)
        self.assertEqual(evidence['limits']['recent_total'], 35)
        self.assertTrue(evidence['limits']['recent_truncated'])
        self.assertEqual(evidence['review_items'][0]['attempt_id'], 35)
        self.assertEqual(evidence['review_items'][0]['created'], 965)

    def test_review_limit_is_explicit_and_counts_are_not_based_on_the_visible_slice(self):
        with server.connect() as db:
            for cid in ('oculomotor', 'light', 'abducens'):
                self.answer(db, cid=cid)
            rows = server.attempts_get(db, self.learner)
        evidence = build_report_evidence(rows, QUESTION_MAP, review_limit=2)
        self.assertEqual(len(evidence['review_items']), 2)
        self.assertEqual(evidence['counts']['review_questions'], 3)
        self.assertEqual(evidence['counts']['missing_points'], 6)
        self.assertTrue(evidence['limits']['review_truncated'])

    def test_invalid_records_are_not_reinterpreted_as_real_teaching_results(self):
        with server.connect() as db:
            self.answer(db)
            valid = server.attempts_get(db, self.learner)[0]
        malformed = [{**valid, 'id': 2, 'question': 'invented-id'},
                     {**valid, 'id': 3, 'concept': 'light'},
                     {**valid, 'id': 4, 'score': float('nan')},
                     {**valid, 'id': 5, 'payload': 'invalid json'}]
        evidence = build_report_evidence([valid] + malformed, QUESTION_MAP)
        self.assertEqual(evidence['counts']['attempts'], 1)
        self.assertEqual(evidence['recent_attempts'][0]['attempt_id'], valid['id'])

    def test_legacy_without_assisted_flag_still_honors_saved_hint_or_dialogue_evidence(self):
        with server.connect() as db:
            self.answer(db)
            self.answer(db, correct=(True, True, True))
            rows = server.attempts_get(db, self.learner)
        payload = json.loads(rows[1]['payload'])
        payload.pop('assisted')
        payload['dialogue_assisted'] = True
        rows[1]['payload'] = json.dumps(payload)
        evidence = build_report_evidence(rows, QUESTION_MAP)
        self.assertEqual(evidence['counts']['independent_recheck_points'], 2)
        self.assertTrue(evidence['recent_attempts'][0]['assisted'])


if __name__ == '__main__':
    unittest.main()
