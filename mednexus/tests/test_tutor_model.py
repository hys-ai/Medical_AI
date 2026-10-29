import json
import os
from pathlib import Path
import sys
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import tutor_model


class TutorModelTests(unittest.TestCase):
    def setUp(self):
        tutor_model._cache = None
        self.env = patch.dict(os.environ, {'MEDNEXUS_TUTOR_URL':'http://127.0.0.1:11434','MEDNEXUS_TUTOR_MODEL':''})
        self.env.start()

    def tearDown(self):
        self.env.stop(); tutor_model._cache = None

    def test_no_local_service_is_honestly_reported_without_generator(self):
        with patch.object(tutor_model,'_json_request',side_effect=OSError):
            self.assertFalse(tutor_model.status()['available'])
            self.assertIsNone(tutor_model.generator())

    def test_remote_or_credential_urls_are_not_contacted(self):
        for base in ['https://example.com','http://192.168.1.1:11434','http://u:p@localhost:11434','http://localhost:11434/other']:
            with patch.dict(os.environ,{'MEDNEXUS_TUTOR_URL':base}), patch.object(tutor_model,'_json_request') as request:
                self.assertFalse(tutor_model.status()['available']);request.assert_not_called()

    def test_requested_missing_model_does_not_silently_choose_another(self):
        with patch.dict(os.environ,{'MEDNEXUS_TUTOR_MODEL':'missing'}), patch.object(tutor_model,'_json_request',return_value={'models':[{'name':'qwen3:1.7b'}]}):
            self.assertFalse(tutor_model.status()['available'])

    def test_real_roles_history_and_grounding_reach_local_api(self):
        calls=[]
        def request(url,payload=None,timeout=2):
            calls.append((url,payload))
            if payload is None:
                return {'models':[{'name':'qwen3:1.7b'}]}
            return {'message':{'content':json.dumps({'message':'fixture','follow_up':'fixture','sources':[]})}}
        dialogue=[{'role':'user','content':'first'},{'role':'assistant','content':'previous explanation'}, {'role':'user','content':'why'}]
        with patch.object(tutor_model,'_json_request',side_effect=request):
            result=tutor_model.generator()('SYSTEM',{'learning_card':{'id':'note-fixture','text':'known passage'},'dialogue':dialogue})
        self.assertEqual(result['message'],'fixture')
        payload=calls[-1][1]
        self.assertEqual(payload['messages'][1:],dialogue)
        self.assertIn('known passage',payload['messages'][0]['content'])
        self.assertFalse(payload['think'])
        self.assertEqual(calls[-1][0],'http://127.0.0.1:11434/api/chat')


if __name__ == '__main__':
    unittest.main()
