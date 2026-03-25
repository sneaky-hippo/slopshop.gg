"""
Slopshop Python SDK - The API bazaar for lobsters.

    pip install slopshop

Usage:
    from slopshop import Slop
    s = Slop()  # reads SLOPSHOP_KEY from env
    result = s.call("lead-scoring-ai", {"company": "Acme"})
    print(result.data)
"""

import os
import json
import urllib.request
import urllib.error

__version__ = "1.0.0"

DEFAULT_BASE = "https://api.slopshop.gg"


class SlopError(Exception):
    def __init__(self, code, message, status=None):
        self.code = code
        self.message = message
        self.status = status
        super().__init__(f"[{code}] {message}")


class SlopResult:
    def __init__(self, raw):
        self._raw = raw
        self.data = raw.get("data", {})
        self.meta = raw.get("meta", {})
        self.credits_used = self.meta.get("credits_used", 0)
        self.credits_remaining = self.meta.get("credits_remaining")
        self.request_id = self.meta.get("request_id")

    def __repr__(self):
        return f"SlopResult(api={self.meta.get('api')}, credits={self.credits_used})"

    def __getitem__(self, key):
        return self.data[key]

    def get(self, key, default=None):
        return self.data.get(key, default)


class Slop:
    def __init__(self, key=None, base_url=None):
        self.key = key or os.environ.get("SLOPSHOP_KEY")
        if not self.key:
            raise SlopError("no_key", "Set SLOPSHOP_KEY env var or pass key= to Slop()")
        self.base = (base_url or os.environ.get("SLOPSHOP_BASE", DEFAULT_BASE)).rstrip("/")

    def _request(self, method, path, body=None, auth=True):
        url = f"{self.base}{path}"
        data = json.dumps(body).encode() if body else None
        headers = {"Content-Type": "application/json"}
        if auth:
            headers["Authorization"] = f"Bearer {self.key}"

        req = urllib.request.Request(url, data=data, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req) as resp:
                return json.loads(resp.read())
        except urllib.error.HTTPError as e:
            body = json.loads(e.read()) if e.headers.get("content-type", "").startswith("application/json") else {}
            err = body.get("error", {})
            raise SlopError(err.get("code", "http_error"), err.get("message", str(e)), e.code)

    def call(self, api, input_data=None, idempotency_key=None):
        """Call any Slopshop API by slug. Returns SlopResult."""
        return SlopResult(self._request("POST", f"/v1/{api}", input_data or {}))

    def batch(self, calls):
        """Batch call multiple APIs. calls = [{"api": "slug", "input": {...}}, ...]"""
        return self._request("POST", "/v1/batch", {"calls": calls})

    def async_call(self, api, input_data=None):
        """Fire-and-forget for complex APIs. Returns job_id."""
        return self._request("POST", f"/v1/async/{api}", input_data or {})

    def job(self, job_id):
        """Check async job status."""
        return self._request("GET", f"/v1/jobs/{job_id}")

    def resolve(self, query):
        """Find the right API by describing what you need in plain English."""
        return self._request("POST", "/v1/resolve", {"query": query}, auth=False)

    def tools(self, format="native", category=None, limit=100, offset=0):
        """Get tool manifest for agent integration."""
        params = f"?format={format}&limit={limit}&offset={offset}"
        if category:
            params += f"&category={category}"
        return self._request("GET", f"/v1/tools{params}", auth=False)

    def balance(self):
        """Check credit balance."""
        return self._request("GET", "/v1/credits/balance")

    def buy_credits(self, amount, payment_method=None):
        """Buy credits. amount: 1000, 10000, 100000, or 1000000."""
        body = {"amount": amount}
        if payment_method:
            body["payment_method"] = payment_method
        return self._request("POST", "/v1/credits/buy", body)

    def transfer(self, to_key, amount):
        """Transfer credits to another key."""
        return self._request("POST", "/v1/credits/transfer", {"to_key": to_key, "amount": amount})

    def pipe(self, steps, until=None, max_iterations=1):
        """Turing-complete pipeline. steps = [{"api": "slug", "input": {...}}, ...]"""
        body = {"steps": steps, "max_iterations": max_iterations}
        if until:
            body["until"] = until
        return self._request("POST", "/v1/pipe", body)

    def state_get(self, key):
        """Get persistent state value."""
        return self._request("GET", f"/v1/state/{key}")

    def state_set(self, key, value):
        """Set persistent state value."""
        return self._request("PUT", f"/v1/state/{key}", {"value": value})

    def state_delete(self, key):
        """Delete persistent state value."""
        return self._request("DELETE", f"/v1/state/{key}")

    def health(self):
        """Check API health (no auth required)."""
        return self._request("GET", "/v1/health", auth=False)
