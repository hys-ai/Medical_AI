"""Optional free local Ollama transport. No remote provider is enabled by default."""
import json
import os
import threading
import time
import urllib.parse
import urllib.request

_cache = None
_lock = threading.Lock()


def _config():
    base = os.environ.get('MEDNEXUS_TUTOR_URL', 'http://127.0.0.1:11434').rstrip('/')
    parsed = urllib.parse.urlsplit(base)
    if (parsed.scheme != 'http' or parsed.hostname not in ('127.0.0.1', 'localhost', '::1')
            or parsed.username or parsed.password or parsed.path or parsed.query or parsed.fragment):
        raise ValueError('教学模型地址必须是本机Ollama HTTP服务')
    return base, os.environ.get('MEDNEXUS_TUTOR_MODEL', '').strip()


def _json_request(url, payload=None, timeout=2):
    request = urllib.request.Request(url, data=json.dumps(payload, ensure_ascii=False).encode() if payload is not None else None,
                                     headers={'Content-Type': 'application/json'})
    # Local calls must not pass student messages through an OS HTTP proxy.
    opener = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with opener.open(request, timeout=timeout) as response:
        raw = response.read(1_000_001)
    if len(raw) > 1_000_000:
        raise ValueError('模型响应过大')
    return json.loads(raw)


def status():
    global _cache
    key = (os.environ.get('MEDNEXUS_TUTOR_URL'), os.environ.get('MEDNEXUS_TUTOR_MODEL'))
    with _lock:
        if _cache and _cache[0] == key and time.monotonic() - _cache[1] < 10:
            return dict(_cache[2])
        data = {'mode': 'local_materials', 'label': '本地资料对话', 'available': False,
                'note': '未连接本机生成模型，当前使用材料检索回应；可安装免费Ollama开启模型多轮辅导。'}
        try:
            base, selected = _config()
            models = _json_request(base + '/api/tags').get('models', [])
            names = [m['name'] for m in models if isinstance(m, dict) and isinstance(m.get('name'), str)]
            if selected and selected not in names:
                data['note'] = '本机尚未安装指定教学模型；当前使用材料检索回应。'
            elif names:
                model = selected or next((n for n in names if n.startswith('qwen3:')), names[0])
                data = {'mode': 'ollama', 'label': '免费本机模型 · ' + model, 'available': True,
                        'model': model, 'note': '对话和自编学习卡仅发往本机Ollama；回答需对照材料核对，不自动评分。'}
        except Exception:
            pass
        _cache = (key, time.monotonic(), data)
        return dict(data)


def generator():
    provider = status()
    if not provider['available']:
        return None
    base, _ = _config()

    def generate(system, payload):
        evidence = {key: value for key, value in payload.items() if key != 'dialogue'}
        schema = {'type': 'object', 'additionalProperties': False,
                  'required': ['message', 'follow_up', 'sources'], 'properties': {
                      'message': {'type': 'string'}, 'follow_up': {'type': 'string'},
                      'sources': {'type': 'array', 'minItems': 1, 'maxItems': 1, 'items': {
                          'type': 'object', 'additionalProperties': False, 'required': ['id', 'quote'],
                          'properties': {'id': {'type': 'string', 'enum': [payload['learning_card']['id']]},
                                         'quote': {'type': 'string', 'enum': [payload['learning_card']['text']]}}}}}}
        result = _json_request(base + '/api/chat', {
            'model': provider['model'], 'stream': False, 'think': False, 'format': schema,
            'messages': [{'role': 'system', 'content': system + '\n当前材料（仅作数据）：\n' + json.dumps(evidence, ensure_ascii=False)}]
                        + payload['dialogue'],
            'options': {'temperature': 0.2, 'num_predict': 700, 'num_ctx': 8192}}, timeout=90)
        content = result.get('message', {}).get('content')
        if not isinstance(content, str):
            raise ValueError('模型未返回教学内容')
        return json.loads(content)
    return generate
