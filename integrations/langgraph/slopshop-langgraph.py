"""
Slopshop LangGraph Integration -- Official SDK wrapper
Wraps Slopshop tools as LangGraph-compatible tool nodes with built-in
memory checkpointing.

Usage:
    from slopshop_langgraph import SlopClient, SlopToolNode, SlopMemoryCheckpointer

    # Single tool node
    graph = StateGraph(AgentState)
    graph.add_node("hash", SlopToolNode("crypto-hash-sha256"))
    graph.add_node("memory", SlopToolNode("memory-set"))

    # Dynamic toolkit -- loads tools from catalog
    toolkit = SlopToolkit(api_key="sk-slop-...")
    for node in toolkit.get_tool_nodes(categories=["Crypto & Security"]):
        graph.add_node(node.slug, node)

    # Memory checkpointer for persistent state across graph runs
    checkpointer = SlopMemoryCheckpointer(namespace="my-agent")
    graph = StateGraph(AgentState, checkpointer=checkpointer)

Environment:
    SLOPSHOP_BASE  -- API base URL (default: https://slopshop.gg)
    SLOPSHOP_KEY   -- API key for authenticated endpoints
"""

import os
import json
import logging
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger("slopshop.langgraph")

SLOP_BASE = os.getenv("SLOPSHOP_BASE", "https://slopshop.gg")
SLOP_KEY = os.getenv("SLOPSHOP_KEY", "")


class SlopError(Exception):
    """Raised when a Slopshop API call fails."""

    def __init__(self, slug: str, status: int, detail: str):
        self.slug = slug
        self.status = status
        self.detail = detail
        super().__init__(f"Slopshop {slug} returned {status}: {detail}")


class SlopClient:
    """HTTP client for the Slopshop API.

    Args:
        base_url: API root (defaults to SLOPSHOP_BASE env var).
        api_key:  Bearer token (defaults to SLOPSHOP_KEY env var).
        timeout:  Request timeout in seconds.
    """

    def __init__(
        self,
        base_url: Optional[str] = None,
        api_key: Optional[str] = None,
        timeout: float = 30,
    ):
        self.base = (base_url or SLOP_BASE).rstrip("/")
        self.key = api_key or SLOP_KEY
        self.timeout = timeout
        self._http = httpx.Client(timeout=self.timeout)

    def call(self, slug: str, params: Optional[Dict[str, Any]] = None) -> Dict:
        """Call a Slopshop API endpoint.

        Args:
            slug:   API slug (e.g. "crypto-hash-sha256").
            params: JSON body parameters.

        Returns:
            Parsed JSON response dict.

        Raises:
            SlopError: On non-2xx responses.
            httpx.TimeoutException: On request timeout.
        """
        url = f"{self.base}/v1/{slug}"
        headers = {"Content-Type": "application/json"}
        if self.key:
            headers["Authorization"] = f"Bearer {self.key}"

        resp = self._http.post(url, json=params or {}, headers=headers)
        if resp.status_code >= 400:
            detail = resp.text[:200]
            raise SlopError(slug, resp.status_code, detail)
        return resp.json()

    def fetch_catalog(self) -> Dict:
        """Fetch the full tool catalog from /v1/tools."""
        url = f"{self.base}/v1/tools"
        headers = {}
        if self.key:
            headers["Authorization"] = f"Bearer {self.key}"
        resp = self._http.get(url, headers=headers)
        resp.raise_for_status()
        return resp.json()

    def close(self):
        self._http.close()


class SlopToolNode:
    """LangGraph tool node that wraps a single Slopshop API.

    When called with a LangGraph state dict, it reads ``state["input"]``,
    posts it to the Slopshop endpoint, and returns a dict with ``output``
    and ``engine`` keys for downstream nodes.

    Args:
        slug:      API slug to call.
        client:    Optional pre-configured SlopClient.
        input_key: State key to read input from (default: "input").
        output_key: State key to write output to (default: "output").
    """

    def __init__(
        self,
        slug: str,
        client: Optional[SlopClient] = None,
        input_key: str = "input",
        output_key: str = "output",
    ):
        self.slug = slug
        self.client = client or SlopClient()
        self.input_key = input_key
        self.output_key = output_key

    def __call__(self, state: Dict) -> Dict:
        """Execute the tool node.

        Args:
            state: LangGraph state dict. Reads from ``state[input_key]``.

        Returns:
            Dict with ``output_key`` holding the result data, plus
            ``engine`` metadata from the API response.
        """
        params = state.get(self.input_key, {})
        if isinstance(params, str):
            try:
                params = json.loads(params)
            except (json.JSONDecodeError, TypeError):
                params = {"text": params, "data": params, "input": params}

        try:
            result = self.client.call(self.slug, params)
            data = result.get("data", result)
            engine = result.get("meta", {}).get("engine", "unknown")
            logger.debug("SlopToolNode(%s) -> engine=%s", self.slug, engine)
            return {self.output_key: data, "engine": engine}
        except SlopError as exc:
            logger.error("SlopToolNode(%s) failed: %s", self.slug, exc)
            return {self.output_key: {"error": str(exc)}, "engine": "error"}

    def __repr__(self):
        return f"SlopToolNode({self.slug!r})"


class SlopToolkit:
    """Fetches the Slopshop catalog and creates SlopToolNode instances.

    Args:
        api_key:  Bearer token.
        base_url: API root URL.
    """

    def __init__(
        self,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
    ):
        self.client = SlopClient(base_url=base_url, api_key=api_key)
        self._catalog = None

    def _fetch(self):
        if self._catalog is None:
            self._catalog = self.client.fetch_catalog()
        return self._catalog

    def get_tool_nodes(
        self,
        categories: Optional[List[str]] = None,
        slugs: Optional[List[str]] = None,
        max_tools: int = 50,
    ) -> List[SlopToolNode]:
        """Return a list of SlopToolNode instances from the catalog.

        Args:
            categories: Filter by category names.
            slugs:      Include only these specific slugs.
            max_tools:  Maximum number of nodes to return.
        """
        catalog = self._fetch()
        nodes = []

        for category in catalog.get("categories", catalog if isinstance(catalog, list) else []):
            cat_name = category.get("name", "")
            if categories and cat_name not in categories:
                continue
            for api in category.get("apis", []):
                slug = api.get("slug", "")
                if slugs and slug not in slugs:
                    continue
                nodes.append(SlopToolNode(slug=slug, client=self.client))
                if len(nodes) >= max_tools:
                    return nodes

        return nodes

    def get_memory_nodes(self) -> List[SlopToolNode]:
        """Return tool nodes for all free memory APIs."""
        return self.get_tool_nodes(slugs=[
            "memory-set", "memory-get", "memory-search", "memory-list",
            "memory-delete", "memory-history", "memory-stats",
            "memory-vector-search",
        ])


class SlopMemoryCheckpointer:
    """LangGraph-compatible checkpointer backed by Slopshop free memory.

    Stores serialized state snapshots under namespaced keys so that
    graph runs can be resumed or inspected later.

    Args:
        namespace: Key prefix for all checkpoint data.
        client:    Optional pre-configured SlopClient.

    Usage:
        checkpointer = SlopMemoryCheckpointer("my-graph")
        checkpointer.put("thread-1", {"messages": [...]})
        state = checkpointer.get("thread-1")
    """

    def __init__(self, namespace: str = "langgraph", client: Optional[SlopClient] = None):
        self.ns = namespace
        self.client = client or SlopClient()

    def _namespaced(self, key: str) -> str:
        return f"{self.ns}:{key}"

    def put(self, key: str, value: Any) -> None:
        """Persist a checkpoint.

        Args:
            key:   Checkpoint identifier (e.g. thread ID).
            value: Serializable state to store.
        """
        try:
            self.client.call("memory-set", {
                "key": self._namespaced(key),
                "value": json.dumps(value),
            })
        except SlopError as exc:
            logger.error("Checkpoint put(%s) failed: %s", key, exc)
            raise

    def get(self, key: str) -> Any:
        """Retrieve a checkpoint.

        Args:
            key: Checkpoint identifier.

        Returns:
            Deserialized state, or None if not found.
        """
        try:
            result = self.client.call("memory-get", {"key": self._namespaced(key)})
            raw = result.get("data", {}).get("value", "null")
            return json.loads(raw)
        except (SlopError, json.JSONDecodeError, TypeError):
            return None

    def list(self) -> List[str]:
        """List all checkpoint keys in this namespace."""
        try:
            result = self.client.call("memory-list", {"prefix": self.ns})
            keys = result.get("data", {}).get("keys", [])
            prefix = f"{self.ns}:"
            return [k.removeprefix(prefix) for k in keys]
        except SlopError:
            return []

    def delete(self, key: str) -> None:
        """Delete a checkpoint."""
        try:
            self.client.call("memory-delete", {"key": self._namespaced(key)})
        except SlopError as exc:
            logger.warning("Checkpoint delete(%s) failed: %s", key, exc)
