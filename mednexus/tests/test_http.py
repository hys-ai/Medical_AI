import json
from pathlib import Path
import sys
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from unittest.mock import patch
from types import SimpleNamespace
from io import BytesIO

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

    def test_plan_and_hint_follow_the_current_learning_identity(self):
        identity = {'X-Learner-ID':'9'*48}
        status,raw,_ = self.request('/api/overview',headers=identity)
        self.assertEqual(status,200)
        self.assertEqual(json.loads(raw)['learning_plan']['counts']['practiced_today'],0)
        status,raw,_ = self.request('/api/task',{'concept':'oculomotor'},identity)
        token = json.loads(raw)['token']
        status,raw,_ = self.request('/api/hint',{'token':token,'point':0,'level':1},identity)
        self.assertEqual(status,200)
        self.assertNotIn(b'"expected"',raw)
        status,_,_ = self.request('/api/hint',{'token':token,'point':0,'level':1},{'X-Learner-ID':'8'*48})
        self.assertEqual(status,400)
        status,raw,_ = self.request('/api/answer',{'token':token,'answers':['暂时不确定']*3},identity)
        self.assertEqual(status,200)
        self.assertTrue(json.loads(raw)['assisted'])
        status,raw,_ = self.request('/api/overview',headers=identity)
        plan = json.loads(raw)['learning_plan']
        self.assertEqual(plan['counts']['weak'],1)
        self.assertEqual(plan['items'][0]['concept'],'oculomotor')
        self.assertTrue(plan['items'][0]['weak_points'])

    def test_foreign_origin_cannot_submit(self):
        status,_,_=self.request('/api/task',{'concept':'oculomotor'},{'Origin':'https://example.org'})
        self.assertEqual(status,403)

    def test_multi_turn_tutor_http_restores_and_isolates_conversations(self):
        identity = {'X-Learner-ID':'7'*48}
        with patch.object(server.tutor_model,'generator',return_value=None), patch.object(server.tutor_model,'status',return_value={
                'mode':'local_materials','label':'本地资料对话','available':False,'note':'fixture'}):
            status,raw,_ = self.request('/api/task',{'concept':'oculomotor'},identity)
            token = json.loads(raw)['token']
            url = '/api/tutor?token=' + token
            self.assertEqual(json.loads(self.request(url,headers=identity)[1])['messages'],[])
            body = {'token':token,'message':'为什么会出现上睑下垂','request_id':'f'*32}
            status,raw,_ = self.request('/api/tutor',body,identity)
            self.assertEqual(status,200)
            self.assertEqual(len(json.loads(raw)['messages']),2)
            self.assertEqual(self.request(url,headers={'X-Learner-ID':'6'*48})[0],400)
            self.assertEqual(self.request('/api/tutor',body,{**identity,'Origin':'https://example.org'})[0],403)
            status,raw,_ = self.request('/api/tutor',{**body,'message':'还是不懂，为什么','request_id':'e'*32},identity)
            self.assertEqual(len(json.loads(raw)['messages']),4)
            status,raw,_ = self.request('/api/answer',{'token':token,'answers':['暂时不确定']*3},identity)
            self.assertTrue(json.loads(raw)['dialogue_assisted'])
            self.assertTrue(json.loads(self.request(url,headers=identity)[1])['completed'])
            self.request('/api/reset',{'confirmation':'CLEAR_MY_LEARNING'},identity)
            self.assertEqual(self.request(url,headers=identity)[0],400)

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

    def test_import_requires_rights_and_privacy_confirmation(self):
        record = {'book':'测试索引','chapter':'测试章节','page':1}
        status,_,_=self.request('/api/import',{'records':[record]})
        self.assertEqual(status,400)
        status,raw,_=self.request('/api/import',{'records':[record],'authorized':True})
        self.assertEqual(status,200)
        self.assertEqual(json.loads(raw)['count'],1)

    def test_course_material_review_round_trip_and_conflict(self):
        with tempfile.TemporaryDirectory() as folder, patch.object(server.materials,'DATA',Path(folder)):
            source = {'source':'fixture.docx','pages':[{'id':'histology-1','image':'histology-1.png',
                'image_number':1,'lines':[{'text':'1、fixture','confidence':.7}]}]}
            (Path(folder)/'histology.json').write_text(json.dumps(source),encoding='utf-8')
            status, raw, _ = self.request('/api/course-materials')
            self.assertEqual(status,200)
            line = json.loads(raw)['histology']['pages'][0]['lines'][0]
            body = {'page':1,'line':0,'token':line['review_token'],'revision':0,
                'action':'save','text':'1、revised fixture','checked':True}
            self.assertEqual(self.request('/api/course-materials/review',body)[0],200)
            self.assertEqual(self.request('/api/course-materials/review',body)[0],409)
            self.assertEqual(self.request('/api/course-materials/review',body,{'Origin':'https://example.org'})[0],403)
            status,raw,_ = self.request('/api/course-materials')
            revised = json.loads(raw)['histology']['pages'][0]['lines'][0]
            self.assertEqual(revised['text'],'1、revised fixture')
            self.assertTrue(revised['user_reviewed'])

    def test_course_review_rejects_non_loopback_client_even_with_allowed_host(self):
        received=[]
        fake = SimpleNamespace(allowed=lambda:True, learner=lambda:'c'*48,
            headers={'Content-Type':'application/json','Content-Length':'2'},
            rfile=BytesIO(b'{}'), path='/api/course-materials/review', client_address=('192.168.1.2',1234),
            send=lambda payload,status=200:received.append((payload,status)))
        with patch.object(server.materials,'save_review') as save:
            server.Handler.do_POST(fake)
            save.assert_not_called()
        self.assertEqual(received[0][1],403)


if __name__=='__main__':
    unittest.main(verbosity=2)
