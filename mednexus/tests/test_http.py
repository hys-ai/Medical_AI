import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request

sys.path.insert(0,str(Path(__file__).resolve().parents[1]))
import server


class HttpTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp=tempfile.TemporaryDirectory()
        cls.old_db=server.DB_PATH
        server.DB_PATH=Path(cls.temp.name)/'http.sqlite3'
        server.init_db()
        cls.http=server.ThreadingHTTPServer(('127.0.0.1',0),server.Handler)
        cls.thread=threading.Thread(target=cls.http.serve_forever,daemon=True)
        cls.thread.start()
        cls.base='http://127.0.0.1:'+str(cls.http.server_port)

    @classmethod
    def tearDownClass(cls):
        cls.http.shutdown();cls.http.server_close();cls.thread.join(timeout=3)
        server.DB_PATH=cls.old_db
        cls.temp.cleanup()

    def request(self,path,body=None,headers=None):
        hs={'X-Learner-ID':'c'*48,'Content-Type':'application/json',**(headers or {})}
        req=urllib.request.Request(self.base+path,data=json.dumps(body).encode() if body is not None else None,headers=hs)
        try:
            with urllib.request.urlopen(req,timeout=5) as r:
                return r.status,r.read(),dict(r.headers)
        except urllib.error.HTTPError as r:
            return r.code,r.read(),dict(r.headers)

    def test_health_and_static_app_serve(self):
        status,raw,headers=self.request('/api/health')
        self.assertEqual(status,200)
        self.assertTrue(json.loads(raw)['ok'])
        status,raw,headers=self.request('/')
        self.assertEqual(status,200)
        self.assertIn('医枢'.encode(),raw)
        self.assertIn("script-src 'self'",headers['Content-Security-Policy'])

    def test_foreign_origin_cannot_submit(self):
        status,_,_=self.request('/api/task',{'concept':'oculomotor'},{'Origin':'https://example.org'})
        self.assertEqual(status,403)

    def test_untrusted_host_is_rejected(self):
        status,_,_=self.request('/api/health',headers={'Host':'attacker.example'})
        self.assertEqual(status,403)

    def test_invalid_learning_identity_is_rejected(self):
        status,_,_=self.request('/api/bootstrap',headers={'X-Learner-ID':'other'})
        self.assertEqual(status,400)

    def test_api_does_not_expose_server_files(self):
        status,_,_=self.request('/../server.py')
        self.assertEqual(status,404)
        status,_,_=self.request('/data/learning.sqlite3')
        self.assertEqual(status,404)

    def test_current_task_must_match_submission(self):
        status,raw,_=self.request('/api/task',{'concept':'oculomotor'})
        self.assertEqual(status,200)
        self.assertNotIn(b'"correct"',raw)
        status,_,_=self.request('/api/answer',{'token':'wrong','answers':[]})
        self.assertEqual(status,400)

    def test_reset_needs_explicit_confirmation(self):
        status,_,_=self.request('/api/reset',{})
        self.assertEqual(status,400)


if __name__=='__main__':
    unittest.main(verbosity=2)
