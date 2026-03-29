"""
Slopshop CrewAI Integration -- Official SDK wrapper
Wraps Slopshop tools as CrewAI-compatible tools with role-based memory
namespaces so each crew member gets isolated persistent state.

Usage:
    from slopshop_crewai import SlopCrewTool, SlopCrewToolkit, SlopRoleMemory

    # Single tool
    hash_tool = SlopCrewTool("crypto-hash-sha256", api_key="sk-slop-...")

    # Toolkit -- bulk-load from catalog
    toolkit = SlopCrewToolkit(api_key="sk-slop-...")
    tools = toolkit.get_tools(categories=["Text Processing"])

    # CrewAI agent with Slopshop tools
    from crewai import Agent, Task, Crew

    researcher = Agent(
        role="Researcher",
        goal="Gather and process data",
        tools=toolkit.get_tools(categories=["Text Processing", "Analyze"]),
    )

    # Role-scoped memory (free, 0 credits)
    memory = SlopRoleMemory(role="researcher", crew="my-crew")
    memory.set("last_query", "quantum computing")
    memory.get("last_query")  # -> "quantum computing"

Environment:
    SLOPSHOP_BASE  -- API base URL (default: https://slopshop.gg)
    SLOPSHOP_KEY   -- API key for authenticated endpoints
"""

import os
import json
import logging
from typing import Any, Dict, List, Optional

import httpx

logger = logging.getLogger("slopshop.crewai")

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


class SlopCrewTool:
    """A single Slopshop API as a CrewAI-compatible tool.

    CrewAI tools need ``name``, ``description``, and a ``_run`` method.

    Args:
        slug:        API slug to call.
        api_key:     Bearer token (or set SLOPSHOP_KEY).
        base_url:    API root URL.
        name:        Human-readable tool name (auto-derived from slug if omitted).
        description: Tool description for the LLM.
        client:      Optional shared SlopClient instance.
    """

    name: str
    description: str

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
        self.name = f"slopshop_{slug.replace('-', '_')}"
        self.description = description or f"Slopshop API: {name or slug}"
        if name and description:
            self.description = f"{name}: {description}"
        self.client = client or SlopClient(base_url=base_url, api_key=api_key)

    def _run(self, **kwargs) -> str:
        """Execute the tool (called by CrewAI).

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
            logger.error("SlopCrewTool(%s) failed: %s", self.slug, exc)
            return json.dumps({"error": str(exc)})
        except Exception as exc:
            logger.error("SlopCrewTool(%s) unexpected error: %s", self.slug, exc)
            return json.dumps({"error": f"Unexpected error: {exc}"})

    def __repr__(self):
        return f"SlopCrewTool({self.slug!r})"


class SlopCrewToolkit:
    """Bulk-loads Slopshop tools for CrewAI agents.

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

    def get_tools(
        self,
        categories: Optional[List[str]] = None,
        slugs: Optional[List[str]] = None,
        max_tools: int = 30,
    ) -> List[SlopCrewTool]:
        """Return CrewAI-compatible tool instances from the catalog.

        Args:
            categories: Filter by category names (e.g. ["Text Processing"]).
            slugs:      Include only these specific slugs.
            max_tools:  Maximum number of tools to return.
        """
        catalog = self._fetch()
        tools: List[SlopCrewTool] = []

        for category in catalog.get("categories", catalog if isinstance(catalog, list) else []):
            cat_name = category.get("name", "")
            if categories and cat_name not in categories:
                continue
            for api in category.get("apis", []):
                slug = api.get("slug", "")
                if slugs and slug not in slugs:
                    continue
                tools.append(SlopCrewTool(
                    slug=slug,
                    name=api.get("name", slug),
                    description=api.get("desc", ""),
                    client=self.client,
                ))
                if len(tools) >= max_tools:
                    return tools

        return tools

    def get_memory_tools(self) -> List[SlopCrewTool]:
        """Return tools for all free memory APIs."""
        return self.get_tools(slugs=[
            "memory-set", "memory-get", "memory-search", "memory-list",
            "memory-delete", "memory-history", "memory-stats",
            "memory-vector-search",
        ])

    def get_compute_tools(self, max_tools: int = 20) -> List[SlopCrewTool]:
        """Return popular pure-compute tools."""
        return self.get_tools(categories=[
            "Text Processing", "Crypto & Security", "Math & Numbers",
            "Data Transform", "Validation",
        ], max_tools=max_tools)


class SlopRoleMemory:
    """Role-scoped persistent memory for CrewAI agents.

    Each agent role gets its own namespace so crew members do not
    overwrite each other's state. Uses the free Slopshop memory APIs
    (0 credits).

    Args:
        role:   Agent role name (e.g. "researcher").
        crew:   Crew identifier for multi-crew isolation.
        client: Optional shared SlopClient instance.

    Usage:
        memory = SlopRoleMemory(role="researcher", crew="alpha-crew")
        memory.set("findings", {"papers": 42})
        memory.get("findings")   # -> {"papers": 42}
        memory.search("paper")   # -> search results
        memory.list_keys()       # -> ["findings", ...]
    """

    def __init__(
        self,
        role: str,
        crew: str = "default",
        client: Optional[SlopClient] = None,
    ):
        self.role = role
        self.crew = crew
        self.ns = f"crewai:{crew}:{role}"
        self.client = client or SlopClient()

    def _namespaced(self, key: str) -> str:
        return f"{self.ns}:{key}"

    def set(self, key: str, value: Any) -> None:
        """Store a value under this role's namespace.

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
            logger.error("RoleMemory.set(%s) failed: %s", key, exc)
            raise

    def get(self, key: str) -> Any:
        """Retrieve a value from this role's namespace.

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
        """Search memory values within this role's namespace.

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
        """List all memory keys for this role."""
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
            logger.warning("RoleMemory.delete(%s) failed: %s", key, exc)

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
