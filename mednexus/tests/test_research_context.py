"""Research searches retain their learning concept and original gated question."""
from io import BytesIO
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace
import unittest
import urllib.parse
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class ResearchContextTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old_db = server.DB_PATH
        server.DB_PATH = Path(self.temp.name) / "research.sqlite3"
        server.init_db()
        self.learner = "a" * 48
        self.remote_result = {"papers": [{"pmid": "123", "title": "Fixture"}],
                              "count": 1, "fetched_at": 1, "cached": False}

    def tearDown(self):
        server.DB_PATH = self.old_db
        self.temp.cleanup()

    def post(self, body, path="/api/pubmed"):
        raw = json.dumps(body).encode()
        received = []
        handler = SimpleNamespace(allowed=lambda: True, learner=lambda: self.learner,
            headers={"Content-Type": "application/json", "Content-Length": str(len(raw))},
            rfile=BytesIO(raw), path=path, client_address=("127.0.0.1", 1234),
            send=lambda payload, status=200: received.append((status, payload)))
        server.Handler.do_POST(handler)
        return received[0]

    def search(self, body):
        with server.connect() as db:
            return server.pubmed_compat(db, self.learner, body)

    def test_ambiguous_question_keeps_selected_concept_template_and_log(self):
        question = "上斜肌与外直肌损伤的恢复差异？"
        expected = server.CONCEPT_MAP["trochlear"]["query"]
        with patch.object(server, "pubmed", return_value=self.remote_result) as remote:
            result = self.search({"question": question, "concept": "trochlear"})
        remote.assert_called_once_with(expected, sort="pub date")
        self.assertEqual(result["concept"], "trochlear")
        self.assertEqual(result["question"], question)
        self.assertEqual(result["query"], expected)
        self.assertEqual(result["note"], expected)
        with server.connect() as db:
            row = db.execute("SELECT concept,payload FROM events WHERE kind='literature'").fetchone()
        self.assertEqual(row["concept"], "trochlear")
        self.assertEqual(json.loads(row["payload"])["question"], question)

    def test_eyelid_cause_question_passes_current_gate_without_global_remapping(self):
        with patch.object(server, "pubmed", return_value=self.remote_result) as remote:
            result = self.search({"concept": "oculomotor", "question": "眼睑下垂是否与病因有关？"})
        self.assertIn('"third nerve palsy"[Title/Abstract]', result["query"])
        self.assertIn('etiology[Title/Abstract]', result["query"])
        self.assertNotIn('pupil[Title/Abstract]', result["query"])
        self.assertEqual(remote.call_args.args[0], result["query"])

    def test_edited_query_is_used_with_original_question(self):
        query = '"third nerve palsy"[Title/Abstract] AND recovery[Title/Abstract]'
        body = {"concept": "oculomotor", "question": "眼睑下垂是否与病因有关？", "query": query}
        with patch.object(server, "pubmed", return_value=self.remote_result) as remote:
            status, result = self.post(body)
        self.assertEqual(status, 200)
        remote.assert_called_once_with(query, sort="pub date")
        self.assertEqual(result["query"], query)
        self.assertEqual(result["question"], body["question"])
        self.assertIn("用户", result["mapping"])

    def test_gate_returns_transparent_focus_proposal_without_querying_pubmed(self):
        with patch.object(server, 'pubmed') as remote:
            status, result = self.post({'concept': 'oculomotor', 'question': '动眼神经损伤恢复是否存在差异？'}, path='/api/research')
        self.assertEqual(status, 200)
        self.assertEqual(result['query_plan']['focus']['id'], 'recovery')
        self.assertEqual(result['query_plan']['original_query'], server.CONCEPT_MAP['oculomotor']['query'])
        self.assertIn('recovery[Title/Abstract]', result['query'])
        remote.assert_not_called()

    def test_gate_rejects_private_invalid_and_oversized_questions_before_recording(self):
        for question in (None, [], {}, 42, '字' * 301, '动眼神经恢复patient@example.com', '姓名：测试；动眼神经恢复'):
            with self.subTest(question_type=type(question).__name__), patch.object(server, 'event') as event, patch.object(server, 'pubmed') as remote:
                status, _ = self.post({'concept': 'oculomotor', 'question': question}, path='/api/research')
            self.assertEqual(status, 400)
            event.assert_not_called()
            remote.assert_not_called()

    def test_edited_query_overrides_the_new_focus_proposal_exactly(self):
        query = 'oculomotor[Title/Abstract] AND prognosis[Title/Abstract]'
        with patch.object(server, 'pubmed', return_value=self.remote_result) as remote:
            status, result = self.post({'concept': 'oculomotor', 'question': '动眼神经损伤恢复是否存在差异？', 'query': query})
        self.assertEqual(status, 200)
        self.assertEqual(result['query'], query)
        remote.assert_called_once_with(query, sort='pub date')

    def test_invalid_question_types_cannot_bypass_gate_via_search_endpoints(self):
        for path in ('/api/pubmed', '/api/literature'):
            for question in (['动眼神经损伤恢复是否存在差异？'], {'question':'动眼神经恢复是否不同？'}, None, 42):
                with self.subTest(path=path, question_type=type(question).__name__), patch.object(server, 'event') as event, patch.object(server, 'pubmed') as remote:
                    status, _ = self.post({'concept':'oculomotor', 'question':question, 'query':'oculomotor AND recovery'}, path=path)
                self.assertEqual(status, 400)
                event.assert_not_called()
                remote.assert_not_called()

    def test_edited_query_cannot_bypass_recall_question_gate(self):
        with patch.object(server, "pubmed") as remote:
            status, result = self.post({"concept": "oculomotor", "question": "动眼神经的功能是什么？",
                                        "query": "oculomotor AND recovery"})
        self.assertEqual(status, 400)
        self.assertIn("研究疑问", result["error"])
        remote.assert_not_called()

    def test_unrelated_original_question_cannot_be_rescued_by_query(self):
        with patch.object(server, "pubmed") as remote:
            status, _ = self.post({"concept": "trochlear", "question": "面神经恢复是否存在差异？",
                                   "query": "trochlear AND recovery"})
        self.assertEqual(status, 400)
        remote.assert_not_called()

    def test_invalid_concept_does_not_fall_back_to_free_search(self):
        for cid in ("missing", "", [], 42):
            with self.subTest(concept=cid), patch.object(server, "pubmed") as remote:
                status, result = self.post({"concept": cid, "question": "小胶质细胞的功能"})
                self.assertEqual(status, 400)
                self.assertIn("未知知识点", result["error"])
                remote.assert_not_called()

    def test_invalid_or_unrelated_edited_queries_never_leave_server(self):
        invalid = ["ab", "1" * 1501, "oculomotor 神经", "oculomotor\nAND recovery",
                   "\noculomotor", "oculomotor\tAND recovery", "microglia AND recovery", 123,
                   "oculomotors AND recovery"]
        for query in invalid:
            with self.subTest(query=query), patch.object(server, "pubmed") as remote:
                status, _ = self.post({"concept": "oculomotor", "question": "眼睑下垂是否与病因有关？",
                                       "query": query})
                self.assertEqual(status, 400)
                remote.assert_not_called()

    def test_private_question_or_query_is_rejected_before_search(self):
        cases = [
            {"question": "眼睑下垂是否与病因有关？patient@example.com"},
            {"question": "眼睑下垂是否与病因有关？13800138000"},
            {"question": "患者姓名：测试；眼睑下垂是否与病因有关？"},
            {"query": "oculomotor AND patient@example.com"},
            {"query": "oculomotor AND 110101199001010011"},
            {"query": "oculomotor AND medical record number: 42"},
        ]
        for fields in cases:
            with self.subTest(fields=fields), patch.object(server, "pubmed") as remote:
                body = {"concept": "oculomotor", "question": "眼睑下垂是否与病因有关？", **fields}
                status, result = self.post(body)
                self.assertEqual(status, 400)
                self.assertIn("匿名", result["error"])
                remote.assert_not_called()

    def test_network_failure_preserves_actual_edited_query_and_context(self):
        query = "trochlear AND recovery[Title/Abstract]"
        body = {"concept": "trochlear", "question": "上斜肌与外直肌损伤的恢复差异？", "query": query}
        with patch.object(server, "pubmed", side_effect=TimeoutError):
            status, result = self.post(body)
        self.assertEqual(status, 502)
        self.assertEqual(result["concept"], body["concept"])
        self.assertEqual(result["question"], body["question"])
        self.assertEqual(result["note"], query)
        self.assertEqual(urllib.parse.parse_qs(urllib.parse.urlparse(result["url"]).query)["term"], [query])

    def test_network_failure_without_edit_preserves_selected_template(self):
        body = {"concept": "trochlear", "question": "上斜肌与外直肌损伤的恢复差异？"}
        with patch.object(server, "pubmed", side_effect=TimeoutError):
            status, result = self.post(body)
        self.assertEqual(status, 502)
        self.assertEqual(result["query"], server.CONCEPT_MAP["trochlear"]["query"])

    def test_free_microglia_search_keeps_existing_mapping(self):
        with patch.object(server, "pubmed", return_value=self.remote_result) as remote:
            status, result = self.post({"question": "小胶质细胞的功能"})
        self.assertEqual(status, 200)
        self.assertEqual(result["concept"], "")
        self.assertIn("microglia", result["query"])
        self.assertEqual(remote.call_args.args[0], result["query"])

    def test_free_english_search_remains_accepted(self):
        query = "microglia AND neuroinflammation"
        self.assertEqual(server.research_request({"question": query})["query"], query)

    def test_legacy_literature_endpoint_cannot_bypass_query_checks(self):
        for query in ("microglia AND recovery", "trochlear AND patient@example.com"):
            with self.subTest(query=query), patch.object(server, "pubmed") as remote:
                status, _ = self.post({"concept": "trochlear", "question": "上斜肌损伤恢复是否存在差异？",
                                       "query": query}, path="/api/literature")
                self.assertEqual(status, 400)
                remote.assert_not_called()


if __name__ == "__main__":
    unittest.main()
