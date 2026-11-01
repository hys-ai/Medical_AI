"""Paper-reading questions are validated before events or external model calls."""
from io import BytesIO
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class ReadingPrivacyTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old_db = server.DB_PATH
        server.DB_PATH = Path(self.temp.name) / "reading.sqlite3"
        server.init_db()
        self.learner = "b" * 48
        self.paper = {"pmid": "123", "title": "Fixture paper",
                      "abstract": [{"label": "Results", "text": "Fixture result"}]}
        with server.connect() as db:
            db.execute("INSERT INTO cache VALUES(?,?,?)",
                       ("fixture", json.dumps({"papers": [self.paper]}), 1))

    def tearDown(self):
        server.DB_PATH = self.old_db
        self.temp.cleanup()

    def post(self, fields):
        raw = json.dumps({"concept": "trochlear", "pmid": "123", **fields}).encode()
        responses = []
        handler = SimpleNamespace(allowed=lambda: True, learner=lambda: self.learner,
            headers={"Content-Type": "application/json", "Content-Length": str(len(raw))},
            rfile=BytesIO(raw), path="/api/read-paper",
            send=lambda payload, status=200: responses.append((status, payload)))
        server.Handler.do_POST(handler)
        return responses[0]

    def test_private_questions_are_rejected_before_event_or_provider(self):
        for question in ("patient name: TEST; patient@example.com", "上斜肌研究 13800138000",
                         "姓名：测试；上斜肌研究", "上斜肌研究 110101199001010011"):
            with self.subTest(question=question), patch.object(server, "API_KEY", "fixture"), \
                    patch.object(server, "event") as event, patch.object(server, "model_json") as provider:
                status, result = self.post({"question": question})
                self.assertEqual(status, 400)
                self.assertIn("匿名", result["error"])
                event.assert_not_called()
                provider.assert_not_called()

    def test_invalid_length_or_type_is_rejected_before_event_or_provider(self):
        for question in ("", "   ", "a" * 301, None, [], 42):
            with self.subTest(question=question), patch.object(server, "API_KEY", "fixture"), \
                    patch.object(server, "event") as event, patch.object(server, "model_json") as provider:
                status, result = self.post({"question": question})
                self.assertEqual(status, 400)
                self.assertIn("1–300", result["error"])
                event.assert_not_called()
                provider.assert_not_called()

    def test_missing_question_uses_current_concept_default(self):
        with patch.object(server, "API_KEY", "fixture"), patch.object(server, "model_json", return_value={}) as provider:
            status, result = self.post({})
        self.assertEqual(status, 200)
        self.assertEqual(result["question"], server.CONCEPT_MAP["trochlear"]["research"])
        self.assertEqual(provider.call_args.args[1]["learning_question"], result["question"])
        with server.connect() as db:
            events = db.execute("SELECT concept FROM events WHERE kind='read-paper' AND learner=?", (self.learner,)).fetchall()
        self.assertEqual([row[0] for row in events], ["trochlear"])

    def test_valid_question_is_trimmed_and_forwarded_without_truncation(self):
        question = "上斜肌损伤后的恢复是否存在差异？"
        with patch.object(server, "API_KEY", "fixture"), patch.object(server, "model_json", return_value={}) as provider:
            status, result = self.post({"question": "  " + question + "  "})
        self.assertEqual(status, 200)
        self.assertEqual(result["question"], question)
        self.assertEqual(provider.call_args.args[1]["learning_question"], question)

    def test_independent_reading_keeps_its_question_without_inventing_a_concept(self):
        with patch.object(server, 'API_KEY', ''):
            status, result = self.post({'concept': None, 'question': 'microglia synaptic pruning'})
        self.assertEqual(status, 200)
        self.assertIsNone(result['concept'])
        self.assertEqual(result['question'], 'microglia synaptic pruning')
        self.assertTrue(result['sections'])
        self.assertNotIn('ai_guide', result)
        self.assertIn('Fixture result', json.dumps(result['sections']))
        with server.connect() as db:
            self.assertEqual(db.execute('SELECT COUNT(*) FROM attempts').fetchone()[0], 0)
            event = db.execute("SELECT concept FROM events WHERE kind='read-paper' AND learner=?", (self.learner,)).fetchone()
        self.assertEqual(event[0], '')

    def test_independent_reading_still_requires_an_original_question_and_a_real_cached_pmid(self):
        for fields in ({'concept': None}, {'concept': None, 'question': ''},
                       {'concept': None, 'question': 'microglia', 'pmid': '999999'},
                       {'concept': 'invented', 'question': 'microglia'},
                       {'concept': [], 'question': 'microglia'}):
            with self.subTest(fields=fields), patch.object(server, 'event') as event:
                status, _ = self.post(fields)
                self.assertEqual(status, 400)
                event.assert_not_called()

    def test_independent_private_question_is_rejected_without_provider_or_event(self):
        with patch.object(server, 'API_KEY', 'fixture'), patch.object(server, 'event') as event, \
                patch.object(server, 'model_json') as provider:
            status, _ = self.post({'concept': None, 'question': 'patient name: synthetic'})
        self.assertEqual(status, 400)
        event.assert_not_called()
        provider.assert_not_called()

    def test_reading_prefers_newest_category_preserving_cache_for_the_same_pmid(self):
        paper = {**self.paper, 'title': 'NEW_SCHEMA', 'abstract': [
            {'label': '', 'category': 'METHODS', 'text': 'Synthetic classified methods.'}]}
        with server.connect() as db:
            db.execute('INSERT INTO cache VALUES(?,?,?)', ('v2', json.dumps({'schema_version': 2, 'papers': [paper]}), 2))
            # A more recently touched legacy query must not erase known category metadata.
            db.execute('INSERT INTO cache VALUES(?,?,?)', ('legacy', json.dumps({'papers': [self.paper]}), 99))
        with patch.object(server, 'API_KEY', ''):
            status, result = self.post({'question': '上斜肌恢复是否有差异？'})
        self.assertEqual(status, 200)
        self.assertEqual(result['paper']['title'], 'NEW_SCHEMA')
        methods = next(section for section in result['sections'] if section['id'] == 'methods')
        self.assertEqual(methods['excerpts'][0]['category'], 'METHODS')
        with server.connect() as db:
            db.execute('INSERT INTO cache VALUES(?,?,?)', ('v2-newer', json.dumps({
                'schema_version': 2, 'papers': [{**paper, 'title': 'NEWEST_SCHEMA'}]}), 3))
        with patch.object(server, 'API_KEY', ''):
            self.assertEqual(self.post({'question': '上斜肌恢复是否有差异？'})[1]['paper']['title'], 'NEWEST_SCHEMA')


if __name__ == "__main__":
    unittest.main()
