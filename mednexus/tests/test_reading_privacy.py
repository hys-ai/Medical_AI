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


if __name__ == "__main__":
    unittest.main()
