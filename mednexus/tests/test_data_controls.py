import json
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch
sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server

class DataTests(unittest.TestCase):
    def test_reset_scopes_are_isolated(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(server,'DB_PATH',Path(folder)/'db.sqlite3'):
            server.init_db()
            with server.connect() as db:
                for learner in ['a','b']:
                    server.import_sources(db,learner,[{'book':'测试','chapter':'测试','page':3}])
                    server.make_task(db,learner,'light')
                server.reset_learning(db,'a',{'scope':'learning','confirmation':'CLEAR_MY_LEARNING'})
                self.assertEqual(db.execute('SELECT COUNT(*) FROM sources WHERE learner=?',('a',)).fetchone()[0],1)
                self.assertIsNotNone(server.state_get(db,'b')['active'])
                server.reset_learning(db,'a',{'scope':'all','confirmation':'CLEAR_MY_DATA'})
                self.assertEqual(db.execute('SELECT COUNT(*) FROM sources WHERE learner=?',('a',)).fetchone()[0],0)
                self.assertEqual(db.execute('SELECT COUNT(*) FROM sources WHERE learner=?',('b',)).fetchone()[0],1)

    def test_export_excludes_private_source_and_task_token(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(server,'DB_PATH',Path(folder)/'db.sqlite3'):
            server.init_db()
            with server.connect() as db:
                server.import_sources(db,'a',[{'book':'测试','chapter':'测试','page':3,'text':'PRIVATE_FIXTURE_PASSAGE'}])
                task=server.make_task(db,'a','light')
                exported=json.dumps(server.export_learning(db,'a'))
                self.assertNotIn('PRIVATE_FIXTURE_PASSAGE',exported)
                self.assertNotIn(task['token'],exported)

if __name__=='__main__': unittest.main()
