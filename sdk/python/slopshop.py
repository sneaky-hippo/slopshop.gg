"""
Slopshop Python SDK

Usage:
    from slopshop import Slopshop
    slop = Slopshop('sk-slop-your-key')
    result = slop.call('crypto-hash-sha256', {'text': 'hello'})
"""

import json
import urllib.request
import urllib.error


class SlopshopError(Exception):
    def __init__(self, message, status_code=None, body=None):
        super().__init__(message)
        self.status_code = status_code
        self.body = body


class Slopshop:
    def __init__(self, api_key, base_url='https://slopshop.gg', timeout=30):
        self.api_key = api_key
        self.base_url = base_url.rstrip('/')
        self.timeout = timeout

    def _request(self, method, path, body=None):
        url = self.base_url + path
        headers = {
            'Content-Type': 'application/json',
            'Authorization': f'Bearer {self.api_key}',
            'User-Agent': 'slopshop-sdk-python/3.2.0',
        }
        data = json.dumps(body).encode() if body else None
        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as res:
                return json.loads(res.read().decode())
        except urllib.error.HTTPError as e:
            body = json.loads(e.read().decode()) if e.fp else {}
            raise SlopshopError(body.get('error', {}).get('message', str(e)), e.code, body)

    def call(self, slug, input_data=None):
        return self._request('POST', f'/v1/{slug}', input_data or {})

    def batch(self, calls):
        return self._request('POST', '/v1/batch', {'calls': calls})

    def agent(self, task, **kwargs):
        return self._request('POST', '/v1/agent/run', {'task': task, **kwargs})

    def memory_set(self, key, value, **kwargs):
        return self.call('memory-set', {'key': key, 'value': value, **kwargs})

    def memory_get(self, key, **kwargs):
        return self.call('memory-get', {'key': key, **kwargs})

    def memory_search(self, query, **kwargs):
        return self.call('memory-search', {'query': query, **kwargs})

    def me(self):
        return self._request('GET', '/v1/auth/me')

    def balance(self):
        return self._request('GET', '/v1/credits/balance')

    def search(self, query, **kwargs):
        return self._request('POST', '/v1/tools/search', {'query': query, **kwargs})

    def recommend(self, task):
        return self._request('POST', '/v1/tools/recommend', {'task': task})

    def health(self):
        return self._request('GET', '/v1/health')

    def stats(self):
        return self._request('GET', '/v1/stats')

    def hive_create(self, name, **kwargs):
        return self._request('POST', '/v1/hive/create', {'name': name, **kwargs})

    def hive_send(self, hive_id, message, channel='general'):
        return self._request('POST', f'/v1/hive/{hive_id}/send', {'message': message, 'channel': channel})

    def stream(self, slug, input_data=None):
        return self._request('POST', f'/v1/stream/{slug}', input_data or {})

    def dry_run(self, slug, input_data=None):
        return self._request('POST', f'/v1/dry-run/{slug}', input_data or {})
