"""教材依据与主动文献漫游的边界测试。"""
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


class WanderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.old_db = server.DB_PATH
        server.DB_PATH = Path(self.temp.name) / "learning.sqlite3"
        server.init_db()
        self.learner = "d" * 48

    def tearDown(self):
        server.DB_PATH = self.old_db
        self.temp.cleanup()

    def test_missing_book_does_not_invent_page_or_query_pubmed(self):
        with patch.object(server, "retrieve", return_value=[]), patch.object(server, "pubmed") as remote:
            with server.connect() as db:
                answer = server.ask_compat(db, self.learner, {"question": "小胶质细胞的功能"})
        self.assertTrue(answer["refused"])
        self.assertEqual(answer["citations"], [])
        self.assertIn("不能编造页码", answer["answer"])
        self.assertEqual(answer["wander"]["question"], "小胶质细胞的功能")
        remote.assert_not_called()

    def test_imported_page_gives_only_that_books_excerpt(self):
        with server.connect() as db:
            server.import_sources(db, self.learner, [{
                "book": "测试教材", "chapter": "神经组织", "page": 42,
                "keywords": ["小胶质细胞"],
                "text": "小胶质细胞的功能包含测试要点甲。另一句作为测试要点乙。"}])
            answer = server.ask_compat(db, self.learner, {"question": "小胶质细胞的功能"})
        self.assertFalse(answer["refused"])
        self.assertEqual(answer["citations"][0]["book"], "测试教材")
        self.assertEqual(answer["citations"][0]["chapter"], "神经组织")
        self.assertEqual(answer["citations"][0]["page"], 42)
        self.assertIn("测试要点甲", answer["answer"])
        self.assertEqual(answer["papers"], [])
        with server.connect() as db:
            books = server.overview_payload(db, self.learner)["books"]
        self.assertEqual(books[0]["book"], "测试教材")
        self.assertEqual(books[0]["min"], 42)

    def test_generic_glia_page_cannot_be_misreported_as_microglia(self):
        with server.connect() as db:
            server.import_sources(db, self.learner, [{
                "book": "测试教材", "chapter": "神经组织", "page": 9,
                "text": "神经胶质细胞具有支持功能。"}])
            answer = server.ask_compat(db, self.learner, {"question": "小胶质细胞的功能"})
        self.assertTrue(answer["refused"])
        self.assertEqual(answer["citations"], [])

    def test_wander_maps_microglia_and_never_uses_unrelated_template(self):
        fake = {"papers": [{"pmid": "123", "title": "Test"}], "count": 1,
                "fetched_at": 1, "cached": False}
        with patch.object(server, "pubmed", return_value=fake) as remote:
            with server.connect() as db:
                result = server.pubmed_compat(db, self.learner, {"question": "小胶质细胞的功能"})
        self.assertEqual(result["papers"][0]["pmid"], "123")
        self.assertIn("microglia", remote.call_args.args[0])
        self.assertNotIn("Oculomotor", remote.call_args.args[0])
        self.assertEqual(remote.call_args.kwargs["sort"], "pub date")
        with server.connect() as db:
            self.assertEqual(server.overview_payload(db, self.learner)["literature"]["week"], 1)
        with self.assertRaises(server.InputError):
            server.research_query_for("量子纠缠的功能")
        with self.assertRaises(server.InputError):
            server.research_query_for("microglia patient@example.com")

    def test_overview_counts_questions_not_quiz_answers(self):
        with server.connect() as db:
            task = server.make_task(db, self.learner, "oculomotor")
            server.grade(db, self.learner, {"token": task["token"],
                "answers": ["暂时不确定"] * 3})
            before = server.overview_payload(db, self.learner)
            self.assertEqual(before["questions"]["total"], 0)
            server.ask_compat(db, self.learner, {"question": "小胶质细胞的功能"})
            after = server.overview_payload(db, self.learner)
            self.assertEqual(after["questions"]["total"], 1)
            self.assertEqual(after["questions"]["week_cited"], 0)


if __name__ == "__main__":
    unittest.main()
