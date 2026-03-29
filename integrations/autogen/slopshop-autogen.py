"""
Slopshop AutoGen Integration -- Official SDK wrapper
Wraps Slopshop tools as AutoGen-compatible function tools for use with
AssistantAgent and GroupChat workflows.

Usage:
    from slopshop_autogen import SlopFunction, SlopFunctionToolkit, SlopAgentMemory

    # Register a single tool with an AutoGen agent
    import autogen

    config_list = [{"model": "gpt-4", "api_key": "..."}]
    assistant = autogen.AssistantAgent("assistant", llm_config={"config_list": config_list})
    user_proxy = autogen.UserProxyAgent("user_proxy", code_execution_config=False)

    hash_fn = SlopFunction("crypto-hash-sha256", api_key="sk-slop-...")
    hash_fn.register(assistant, user_proxy)

    # Bulk-register from catalog
    toolkit = SlopFunctionToolkit(api_key="sk-slop-...")
    toolkit.register_tools(
        assistant, user_proxy,
        categories=["Text Processing", "Crypto & Security"],
    )

    # Agent-scoped persistent memory
    memory = SlopAgentMemory(agent_name="assistant", session="demo-1")
    memory.set("context", {"topic": "quantum computing"})
    memory.get("context")  # -> {"topic": "quantum computing"}

Environment:
    SLOPSHOP_BASE  -- API base URL (default: https://slopshop.gg)
    SLOPSHOP_KEY   -- API key for authenticated endpoints
"""

import os
import json
import logging
from typing import Any, Callable, Dict, List, Optional

import httpx

logger = logging.getLogger("slopshop.autogen")

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


class SlopFunction:
    """A single Slopshop API wrapped as an AutoGen function tool.

    AutoGen agents call functions by name. This class produces a callable
    that posts to the Slopshop endpoint and returns a JSON string result.

    Args:
        slug:        API slug to call.
        api_key:     Bearer token (or set SLOPSHOP_KEY).
        base_url:    API root URL.
        name:        Function name exposed to the LLM (defaults to slug).
        description: Function description for the LLM.
        client:      Optional shared SlopClient instance.
    """

    def __init__(
        self,
        slug: str,
        api_key: Optional[str] = None,
        base_url: Optional[str] = None,
        name: Optional[str] = None,
        description: Optional[str] = None,
        client: Optional[SlopClient] = None,
    ):
        self.slug = slug
        self.function_name = name or f"slopshop_{slug.replace('-', '_')}"
        self.description = description or f"Slopshop API: {slug}"
        self.client = client or SlopClient(base_url=base_url, api_key=api_key)

    def __call__(self, **kwargs) -> str:
        """Execute the function (called by AutoGen).

        Args:
            **kwargs: Parameters forwarded to the Slopshop API.

        Returns:
            JSON string with the API result.
        """
        try:
            result = self.client.call(self.slug, kwargs)
            result.pop("_engine", None)
            return json.dumps(result, indent=2)
        except SlopError as exc:
            logger.error("SlopFunction(%s) failed: %s", self.slug, exc)
            return json.dumps({"error": str(exc)})
        except Exception as exc:
            logger.error("SlopFunction(%s) unexpected error: %s", self.slug, exc)
            return json.dumps({"error": f"Unexpected error: {exc}"})

    def as_function_map_entry(self) -> tuple:
        """Return a (name, callable) tuple for AutoGen function_map.

        Returns:
            Tuple of (function_name, self).
        """
        return (self.function_name, self)

    def as_tool_spec(self) -> Dict:
        """Return an OpenAI-style function spec for llm_config.

        Returns:
            Dict with type, function name, description, and parameters
            schema suitable for AutoGen's llm_config["tools"].
        """
        return {
            "type": "function",
            "function": {
                "name": self.function_name,
                "description": self.description,
                "parameters": {
                    "type": "object",
                    "properties": {
                        "input": {
                            "type": "string",
                            "description": "JSON-encoded input parameters for the API.",
                        },
                    },
                    "required": [],
                },
            },
        }

    def register(self, assistant, user_proxy) -> None:
        """Register this tool with an AutoGen assistant/user_proxy pair.

        Adds the function spec to the assistant's llm_config and registers
        the callable on the user_proxy's function_map.

        Args:
            assistant:  autogen.AssistantAgent instance.
            user_proxy: autogen.UserProxyAgent instance.
        """
        # Add tool spec to assistant llm_config
        llm_config = assistant.llm_config or {}
        tools = llm_config.setdefault("tools", [])
        tools.append(self.as_tool_spec())
        assistant.llm_config = llm_config

        # Register callable on user_proxy
        if hasattr(user_proxy, "register_function"):
            user_proxy.register_function(
                function_map={self.function_name: self}
            )

    def __repr__(self):
        return f"SlopFunction({self.slug!r})"


class SlopFunctionToolkit:
    """Bulk-loads Slopshop tools for AutoGen agents.

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

    def get_functions(
        self,
        categories: Optional[List[str]] = None,
        slugs: Optional[List[str]] = None,
        max_tools: int = 30,
    ) -> List[SlopFunction]:
        """Return SlopFunction instances from the catalog.

        Args:
            categories: Filter by category names.
            slugs:      Include only these specific slugs.
            max_tools:  Maximum number of functions to return.
        """
        catalog = self._fetch()
        functions: List[SlopFunction] = []

        for category in catalog.get("categories", catalog if isinstance(catalog, list) else []):
            cat_name = category.get("name", "")
            if categories and cat_name not in categories:
                continue
            for api in category.get("apis", []):
                slug = api.get("slug", "")
                if slugs and slug not in slugs:
                    continue
                functions.append(SlopFunction(
                    slug=slug,
                    name=api.get("name", slug),
                    description=api.get("desc", ""),
                    client=self.client,
                ))
                if len(functions) >= max_tools:
                    return functions

        return functions

    def register_tools(
        self,
        assistant,
        user_proxy,
        categories: Optional[List[str]] = None,
        slugs: Optional[List[str]] = None,
        max_tools: int = 30,
    ) -> List[SlopFunction]:
        """Fetch tools and register them all with an AutoGen agent pair.

        Args:
            assistant:  autogen.AssistantAgent instance.
            user_proxy: autogen.UserProxyAgent instance.
            categories: Filter by category names.
            slugs:      Include only these specific slugs.
            max_tools:  Maximum number of tools to register.

        Returns:
            List of registered SlopFunction instances.
        """
        functions = self.get_functions(
            categories=categories, slugs=slugs, max_tools=max_tools,
        )
        for fn in functions:
            fn.register(assistant, user_proxy)
        logger.info("Registered %d Slopshop tools with AutoGen agents", len(functions))
        return functions

    def get_memory_functions(self) -> List[SlopFunction]:
        """Return functions for all free memory APIs."""
        return self.get_functions(slugs=[
            "memory-set", "memory-get", "memory-search", "memory-list",
            "memory-delete", "memory-history", "memory-stats",
            "memory-vector-search",
        ])

    def get_compute_functions(self, max_tools: int = 20) -> List[SlopFunction]:
        """Return popular pure-compute functions."""
        return self.get_functions(categories=[
            "Text Processing", "Crypto & Security", "Math & Numbers",
            "Data Transform", "Validation",
        ], max_tools=max_tools)


class SlopAgentMemory:
    """Agent-scoped persistent memory for AutoGen agents.

    Each agent gets its own namespace so agents in a GroupChat do not
    overwrite each other's state. Uses the free Slopshop memory APIs
    (0 credits).

    Args:
        agent_name: Name of the AutoGen agent.
        session:    Session identifier for multi-run isolation.
        client:     Optional shared SlopClient instance.

    Usage:
        memory = SlopAgentMemory(agent_name="researcher", session="run-42")
        memory.set("findings", {"papers": 42})
        memory.get("findings")   # -> {"papers": 42}
        memory.search("paper")   # -> search results
        memory.list_keys()       # -> ["findings", ...]
    """

    def __init__(
        self,
        agent_name: str,
        session: str = "default",
        client: Optional[SlopClient] = None,
    ):
        self.agent_name = agent_name
        self.session = session
        self.ns = f"autogen:{session}:{agent_name}"
        self.client = client or SlopClient()

    def _namespaced(self, key: str) -> str:
        return f"{self.ns}:{key}"

    def set(self, key: str, value: Any) -> None:
        """Store a value under this agent's namespace.

        Args:
            key:   Memory key.
            value: Any JSON-serializable value.
        """
        try:
            self.client.call("memory-set", {
                "key": self._namespaced(key),
                "value": json.dumps(value),
            })
        except SlopError as exc:
            logger.error("AgentMemory.set(%s) failed: %s", key, exc)
            raise

    def get(self, key: str) -> Any:
        """Retrieve a value from this agent's namespace.

        Args:
            key: Memory key.

        Returns:
            Deserialized value, or None if not found.
        """
        try:
            result = self.client.call("memory-get", {"key": self._namespaced(key)})
            raw = result.get("data", {}).get("value", "null")
            return json.loads(raw)
        except (SlopError, json.JSONDecodeError, TypeError):
            return None

    def search(self, query: str, limit: int = 10) -> List[Dict]:
        """Search memory values within this agent's namespace.

        Args:
            query: Search query string.
            limit: Maximum results to return.

        Returns:
            List of matching memory entries.
        """
        try:
            result = self.client.call("memory-search", {
                "query": query,
                "prefix": self.ns,
                "limit": limit,
            })
            return result.get("data", {}).get("results", [])
        except SlopError:
            return []

    def list_keys(self) -> List[str]:
        """List all memory keys for this agent."""
        try:
            result = self.client.call("memory-list", {"prefix": self.ns})
            keys = result.get("data", {}).get("keys", [])
            prefix = f"{self.ns}:"
            return [k.removeprefix(prefix) for k in keys]
        except SlopError:
            return []

    def delete(self, key: str) -> None:
        """Delete a memory key."""
        try:
            self.client.call("memory-delete", {"key": self._namespaced(key)})
        except SlopError as exc:
            logger.warning("AgentMemory.delete(%s) failed: %s", key, exc)

    def history(self, key: str) -> List[Dict]:
        """Get the change history for a memory key.

        Args:
            key: Memory key.

        Returns:
            List of historical values with timestamps.
        """
        try:
            result = self.client.call("memory-history", {"key": self._namespaced(key)})
            return result.get("data", {}).get("history", [])
        except SlopError:
            return []

    def clear_all(self) -> int:
        """Delete all memory keys for this agent.

        Returns:
            Number of keys deleted.
        """
        keys = self.list_keys()
        deleted = 0
        for key in keys:
            try:
                self.client.call("memory-delete", {"key": self._namespaced(key)})
                deleted += 1
            except SlopError:
                pass
        return deleted
