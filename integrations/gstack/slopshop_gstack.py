"""
slopshop_gstack.py
------------------
Production-ready Slopshop client for GStack integrations.

Usage:
    from slopshop_gstack import SlopshopClient
    import os

    slop = SlopshopClient(api_key=os.environ["SLOPSHOP_KEY"])

    result = slop.remember("task-output", "hello world", namespace="gstack")
    print(result["proof_hash"])

    value = slop.recall("task-output", namespace="gstack")

    hits  = slop.search("hello", namespace="gstack")

    data  = slop.vault_proxy("vlt_abc123", "https://api.github.com/user")

    wf    = slop.run_workflow(steps=[
                {"api": "crypto-hash-sha256", "input": {"text": "hello"}},
                {"api": "text-token-count",   "input": {"text": "hello"}},
            ])

Dependencies: requests (pip install requests)
"""

from __future__ import annotations

import os
import time
import logging
from typing import Any, Optional, Union

try:
    import requests
    from requests.adapters import HTTPAdapter
    from urllib3.util.retry import Retry
except ImportError as exc:
    raise ImportError(
        "slopshop_gstack requires the 'requests' library. "
        "Install it with: pip install requests"
    ) from exc

__version__ = "1.0.0"
__all__ = ["SlopshopClient", "SlopshopError", "SlopshopAuthError", "SlopshopNotFoundError"]

logger = logging.getLogger(__name__)

SLOPSHOP_DEFAULT_BASE = "https://slopshop.gg"
DEFAULT_TIMEOUT = 30  # seconds
DEFAULT_MAX_RETRIES = 3
DEFAULT_BACKOFF_FACTOR = 0.5


class SlopshopError(Exception):
    """Base exception for Slopshop API errors."""

    def __init__(self, message: str, status_code: int = 0, response_body: Any = None):
        super().__init__(message)
        self.status_code = status_code
        self.response_body = response_body


class SlopshopAuthError(SlopshopError):
    """Raised on 401 / invalid key."""


class SlopshopNotFoundError(SlopshopError):
    """Raised on 404."""


class SlopshopRateLimitError(SlopshopError):
    """Raised on 429."""


class SlopshopClient:
    """
    Slopshop REST client for GStack agent roles.

    Parameters
    ----------
    api_key : str
        Your Slopshop API key (sk-slop-...). Defaults to SLOPSHOP_KEY env var.
    base_url : str
        Base URL for the Slopshop server. Defaults to https://slopshop.gg.
        Override to http://localhost:3000 for a self-hosted instance.
    timeout : int
        Request timeout in seconds. Default 30.
    max_retries : int
        Number of retries on 5xx errors and network failures. Default 3.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: str = SLOPSHOP_DEFAULT_BASE,
        timeout: int = DEFAULT_TIMEOUT,
        max_retries: int = DEFAULT_MAX_RETRIES,
    ):
        self.api_key = api_key or os.environ.get("SLOPSHOP_KEY", "")
        if not self.api_key:
            raise SlopshopError(
                "No API key provided. Pass api_key=... or set SLOPSHOP_KEY env var. "
                "Get a key at https://slopshop.gg or run: slop signup"
            )
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

        # Build a requests Session with retry + connection pooling
        self._session = requests.Session()
        retry = Retry(
            total=max_retries,
            backoff_factor=DEFAULT_BACKOFF_FACTOR,
            status_forcelist={502, 503, 504},
            allowed_methods={"POST", "GET", "DELETE"},
            raise_on_status=False,
        )
        adapter = HTTPAdapter(max_retries=retry)
        self._session.mount("https://", adapter)
        self._session.mount("http://", adapter)
        self._session.headers.update({
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "User-Agent": f"slopshop-gstack/{__version__}",
        })

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _post(self, path: str, body: dict) -> dict:
        url = f"{self.base_url}{path}"
        try:
            resp = self._session.post(url, json=body, timeout=self.timeout)
        except requests.exceptions.Timeout as exc:
            raise SlopshopError(f"Request to {path} timed out after {self.timeout}s") from exc
        except requests.exceptions.ConnectionError as exc:
            raise SlopshopError(f"Connection failed to {self.base_url}: {exc}") from exc
        return self._handle_response(resp, path)

    def _get(self, path: str, params: Optional[dict] = None) -> dict:
        url = f"{self.base_url}{path}"
        try:
            resp = self._session.get(url, params=params, timeout=self.timeout)
        except requests.exceptions.Timeout as exc:
            raise SlopshopError(f"Request to {path} timed out after {self.timeout}s") from exc
        except requests.exceptions.ConnectionError as exc:
            raise SlopshopError(f"Connection failed to {self.base_url}: {exc}") from exc
        return self._handle_response(resp, path)

    def _delete(self, path: str, body: dict) -> dict:
        url = f"{self.base_url}{path}"
        try:
            resp = self._session.delete(url, json=body, timeout=self.timeout)
        except requests.exceptions.Timeout as exc:
            raise SlopshopError(f"Request to {path} timed out after {self.timeout}s") from exc
        except requests.exceptions.ConnectionError as exc:
            raise SlopshopError(f"Connection failed to {self.base_url}: {exc}") from exc
        return self._handle_response(resp, path)

    @staticmethod
    def _handle_response(resp: requests.Response, path: str) -> dict:
        if resp.status_code == 401:
            raise SlopshopAuthError(
                "Invalid or missing API key. Run 'slop signup' to get one.",
                status_code=401,
            )
        if resp.status_code == 404:
            raise SlopshopNotFoundError(
                f"Resource not found: {path}",
                status_code=404,
            )
        if resp.status_code == 429:
            raise SlopshopRateLimitError(
                "Rate limit hit. Back off and retry.",
                status_code=429,
            )
        try:
            data = resp.json()
        except ValueError:
            raise SlopshopError(
                f"Non-JSON response from {path} (HTTP {resp.status_code}): "
                f"{resp.text[:200]}",
                status_code=resp.status_code,
            )
        if resp.status_code >= 400:
            err = data.get("error", {})
            msg = err.get("message", str(data)) if isinstance(err, dict) else str(err)
            raise SlopshopError(msg, status_code=resp.status_code, response_body=data)
        return data

    # ------------------------------------------------------------------
    # Memory
    # ------------------------------------------------------------------

    def remember(
        self,
        key: str,
        value: Any,
        namespace: str = "default",
        tags: Optional[list] = None,
        ttl_seconds: Optional[int] = None,
    ) -> dict:
        """
        Store a value in Slopshop memory.

        Returns the full response dict including:
          - status: "stored"
          - proof_hash: SHA-256 commitment for this write
          - merkle_root: rolling Merkle chain root for the namespace
          - version: monotonically increasing write counter for this key

        Parameters
        ----------
        key : str
            Unique key within the namespace.
        value : any
            Value to store. Can be a string, dict, list, or number.
        namespace : str
            Namespace for isolation (default "default").
        tags : list[str], optional
            Tags for filtering/search.
        ttl_seconds : int, optional
            If set, the key will auto-expire after this many seconds.
        """
        body: dict = {"key": key, "value": value, "namespace": namespace}
        if tags is not None:
            body["tags"] = tags
        if ttl_seconds is not None:
            body["ttl_seconds"] = ttl_seconds
        return self._post("/v1/memory-set", body)

    def recall(
        self,
        key: str,
        namespace: str = "default",
    ) -> Any:
        """
        Retrieve a stored value by key.

        Returns the raw value (string, dict, list, number, etc.) or None if
        the key does not exist or has expired.
        """
        data = self._post("/v1/memory-get", {"key": key, "namespace": namespace})
        return data.get("value")

    def recall_full(
        self,
        key: str,
        namespace: str = "default",
    ) -> dict:
        """
        Like recall(), but returns the full response dict including
        found, tags, version, created, updated timestamps.
        """
        return self._post("/v1/memory-get", {"key": key, "namespace": namespace})

    def search(
        self,
        query: str,
        namespace: str = "default",
        limit: int = 20,
    ) -> list:
        """
        Full-text search over stored memories in a namespace.

        Returns a list of results sorted by relevance score:
          [{"key": ..., "value": ..., "tags": [...], "score": 0.92, "updated": "..."}, ...]
        """
        data = self._post("/v1/memory-search", {
            "query": query,
            "namespace": namespace,
            "limit": limit,
        })
        return data.get("results", [])

    def list_keys(
        self,
        namespace: str = "default",
        tag: Optional[str] = None,
        include_meta: bool = False,
    ) -> list:
        """
        List all keys in a namespace.

        Returns a list of key strings when include_meta=False (default), or
        a list of dicts {key, size, tags, created, updated} when include_meta=True.
        """
        body: dict = {"namespace": namespace, "include_meta": include_meta}
        if tag is not None:
            body["tag"] = tag
        data = self._post("/v1/memory-list", body)
        return data.get("entries" if include_meta else "keys", [])

    def forget(self, key: str, namespace: str = "default") -> bool:
        """
        Delete a key from memory. Returns True if the key existed.
        """
        data = self._post("/v1/memory-delete", {"key": key, "namespace": namespace})
        return data.get("deleted", False)

    # ------------------------------------------------------------------
    # Proof verification
    # ------------------------------------------------------------------

    def verify_proof(self, proof_hash: str, merkle_root: str) -> bool:
        """
        Verify a memory write proof. Returns True if valid.

        Use the proof_hash and merkle_root returned by remember() to confirm
        that a specific write has not been tampered with.
        """
        data = self._post("/v1/proof/verify", {
            "leaf": proof_hash,
            "root": merkle_root,
        })
        return bool(data.get("valid", False))

    def get_merkle_root(self, namespace: str = "default") -> dict:
        """
        Get the current Merkle root for a namespace.

        Returns {"merkle_root": "...", "leaf_count": N, "last_updated": "..."}
        Useful for external auditing — snapshot the root and compare later.
        """
        return self._post("/v1/proof/merkle", {"namespace": namespace})

    # ------------------------------------------------------------------
    # Credential vault
    # ------------------------------------------------------------------

    def vault_store(
        self,
        name: str,
        credential: str,
        credential_type: str = "api_key",
    ) -> str:
        """
        Encrypt and store a credential. Returns the vault_id.

        The raw credential is never returned again after this call.
        Share vault_id with agent roles — they use vault_proxy() to make
        authenticated calls without ever seeing the raw key.

        Parameters
        ----------
        name : str
            Human-readable label (e.g. "github-prod", "openai-gstack").
        credential : str
            The raw secret (API key, token, password, etc.).
        credential_type : str
            One of "api_key", "token", "password", "oauth_token". Default "api_key".
        """
        data = self._post("/v1/vault/set", {
            "name": name,
            "credential": credential,
            "type": credential_type,
        })
        return data["vault_id"]

    def vault_proxy(
        self,
        vault_id: str,
        url: str,
        method: str = "GET",
        body: Optional[dict] = None,
        extra_headers: Optional[dict] = None,
    ) -> dict:
        """
        Proxy an external API call using a stored credential.

        Slopshop decrypts the credential server-side, injects it into the
        outbound Authorization header, and returns the target API's response.
        The raw credential never leaves the Slopshop server.

        SSRF protection is enforced: RFC-1918 addresses, loopback, and
        link-local addresses are blocked. HTTPS only in production.

        Parameters
        ----------
        vault_id : str
            The vault_id returned by vault_store().
        url : str
            Target URL to call (must be HTTPS, no private IPs).
        method : str
            HTTP method: GET, POST, PUT, PATCH, DELETE. Default GET.
        body : dict, optional
            Request body for POST/PUT/PATCH.
        extra_headers : dict, optional
            Additional headers to include in the outbound request.
        """
        req_body: dict = {
            "vault_id": vault_id,
            "url": url,
            "method": method.upper(),
        }
        if body is not None:
            req_body["body"] = body
        if extra_headers is not None:
            req_body["headers"] = extra_headers
        return self._post("/v1/vault/proxy", req_body)

    def vault_list(self) -> list:
        """
        List all vault entries for this API key. Credential values are never included.

        Returns [{"vault_id": ..., "name": ..., "type": ..., "created": ...}, ...]
        """
        data = self._get("/v1/vault/list")
        return data if isinstance(data, list) else data.get("vaults", [])

    def vault_delete(self, vault_id: str) -> bool:
        """
        Permanently delete a vault entry. Returns True on success.
        """
        data = self._delete("/v1/vault/delete", {"vault_id": vault_id})
        return data.get("deleted", False)

    def vault_audit(self) -> list:
        """
        Get the full audit log for vault operations.

        Returns [{action, vault_id, url, status, latency_ms, ts}]
        Credential values are never included in the audit log.
        """
        data = self._get("/v1/vault/audit")
        return data if isinstance(data, list) else data.get("log", [])

    # ------------------------------------------------------------------
    # Tool calls (1,303 tools)
    # ------------------------------------------------------------------

    def call(self, tool_slug: str, input_data: Optional[dict] = None) -> dict:
        """
        Call any Slopshop tool by slug.

        Examples:
            slop.call("crypto-hash-sha256", {"text": "hello world"})
            slop.call("text-token-count", {"text": "some text"})
            slop.call("net-ssl-check", {"hostname": "stripe.com"})
            slop.call("crypto-uuid", {})

        Browse all 1,303 tool slugs at https://slopshop.gg/tools.html
        or call slop.list_tools() for the full catalog.
        """
        return self._post(f"/v1/{tool_slug}", input_data or {})

    def resolve(self, query: str, limit: int = 5) -> list:
        """
        Semantic tool search. Returns matching tool slugs ranked by relevance.

        Example:
            slop.resolve("extract JSON from text")
            # → [{"slug": "llm-output-extract-json", "score": 0.94, ...}, ...]
        """
        data = self._post("/v1/resolve", {"query": query, "limit": limit})
        return data.get("matches", data.get("results", []))

    def list_tools(self, category: Optional[str] = None) -> list:
        """
        Retrieve the full tool catalog (1,303 tools across 82 categories).

        Returns a list of tool definitions: [{slug, name, desc, credits, tier, category}]
        """
        params = {"category": category} if category else {}
        data = self._get("/v1/tools", params=params)
        return data.get("tools", data.get("data", []))

    # ------------------------------------------------------------------
    # Batch
    # ------------------------------------------------------------------

    def batch(self, calls: list) -> list:
        """
        Execute multiple tool calls in parallel.

        Parameters
        ----------
        calls : list[dict]
            List of {"api": "<slug>", "input": {...}} dicts.

        Returns a list of per-call results in the same order.

        Example:
            results = slop.batch([
                {"api": "crypto-hash-sha256", "input": {"text": "hello"}},
                {"api": "text-token-count",   "input": {"text": "hello"}},
                {"api": "crypto-uuid",         "input": {}},
            ])
        """
        data = self._post("/v1/batch", {"calls": calls})
        return data.get("results", [])

    # ------------------------------------------------------------------
    # Workflow execution
    # ------------------------------------------------------------------

    def run_workflow(
        self,
        steps: list,
        name: Optional[str] = None,
        initial_context: Optional[dict] = None,
    ) -> dict:
        """
        Execute a declarative multi-step workflow (up to 20 steps).

        Each step can include a condition field that uses result values from
        previous steps to decide whether to execute.

        Parameters
        ----------
        steps : list[dict]
            Each step: {"api": "<slug>", "input": {...}, "condition": "result.ok == true"}
        name : str, optional
            Human-readable workflow name for logging.
        initial_context : dict, optional
            Seed context passed into the first step.

        Returns
        -------
        dict with keys:
          - results: list of per-step results
          - total_credits: credits consumed
          - steps_executed: number of steps that ran
          - steps_skipped: number of steps that were skipped due to conditions
          - latency_ms: total execution time

        Example:
            slop.run_workflow(steps=[
                {"api": "text-token-count",   "input": {"text": "hello world"}},
                {"api": "crypto-hash-sha256", "input": {"text": "hello world"},
                 "condition": "result.tokens_estimated > 0"},
                {"api": "memory-set",         "input": {
                    "key": "workflow-output",
                    "value": "done",
                    "namespace": "gstack",
                }},
            ])
        """
        body: dict = {"steps": steps}
        if name:
            body["name"] = name
        if initial_context:
            body["input"] = initial_context
        return self._post("/v1/workflows/run", body)

    # ------------------------------------------------------------------
    # Agent orchestration
    # ------------------------------------------------------------------

    def agent_run(
        self,
        task: str,
        max_steps: int = 5,
        model: Optional[str] = None,
        tools: Optional[list] = None,
    ) -> dict:
        """
        Natural language task dispatch. Slopshop auto-discovers relevant tools
        and chains them to complete the task.

        Parameters
        ----------
        task : str
            What to do in plain English.
        max_steps : int
            Maximum tool calls to chain. Default 5, max 10.
        model : str, optional
            Model preference: "claude", "gpt", "grok", "deepseek".
        tools : list[str], optional
            Restrict tool discovery to these slugs.
        """
        body: dict = {"task": task, "max_steps": max_steps}
        if model:
            body["model"] = model
        if tools:
            body["tools"] = tools
        return self._post("/v1/agent/run", body)

    def chain_create(
        self,
        name: str,
        steps: list,
        loop: bool = False,
    ) -> dict:
        """
        Create a multi-LLM agent chain.

        Parameters
        ----------
        name : str
            Chain name.
        steps : list[dict]
            Each step: {"model": "claude|gpt|grok|deepseek", "role": "...", "prompt": "..."}
        loop : bool
            Whether the chain should loop infinitely. Default False.
        """
        return self._post("/v1/chain/create", {
            "name": name,
            "steps": steps,
            "loop": loop,
        })

    def chain_run(self, chain_id: str, input_data: Optional[dict] = None) -> dict:
        """Execute a previously created chain."""
        return self._post("/v1/chain/run", {
            "chain_id": chain_id,
            **(input_data or {}),
        })

    # ------------------------------------------------------------------
    # Account
    # ------------------------------------------------------------------

    def account(self) -> dict:
        """
        Get account info: balance, tier, key prefix, creation date.
        """
        return self._get("/v1/auth/me")

    def balance(self) -> int:
        """Get current credit balance."""
        return self.account().get("balance", 0)

    # ------------------------------------------------------------------
    # Context manager support
    # ------------------------------------------------------------------

    def __enter__(self) -> "SlopshopClient":
        return self

    def __exit__(self, *args: Any) -> None:
        self._session.close()

    def close(self) -> None:
        """Close the underlying HTTP session."""
        self._session.close()


# ---------------------------------------------------------------------------
# Convenience function for quick scripts
# ---------------------------------------------------------------------------

def quick_remember(key: str, value: Any, namespace: str = "default") -> dict:
    """
    One-liner memory write. Reads SLOPSHOP_KEY from environment.

    Returns the full response dict with proof_hash and merkle_root.
    """
    client = SlopshopClient()
    return client.remember(key, value, namespace=namespace)


def quick_recall(key: str, namespace: str = "default") -> Any:
    """
    One-liner memory read. Reads SLOPSHOP_KEY from environment.

    Returns the stored value or None.
    """
    client = SlopshopClient()
    return client.recall(key, namespace=namespace)
