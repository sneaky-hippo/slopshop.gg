"""
Slopshop LangChain Integration

Usage:
    from slopshop.integrations.langchain import SlopshopToolkit

    toolkit = SlopshopToolkit(api_key="sk-slop-...")
    tools = toolkit.get_tools()  # Returns List[Tool] for all 1,244 APIs

    # Or get specific tools
    tools = toolkit.get_tools(categories=["Text Processing", "Crypto & Security"])

    # Use with any LangChain agent
    from langchain.agents import initialize_agent
    agent = initialize_agent(tools, llm, agent="zero-shot-react-description")
"""

import json
import urllib.request


class SlopshopTool:
    """A single Slopshop API as a LangChain-compatible Tool."""

    def __init__(self, slug, name, description, api_key, base_url="https://slopshop.gg"):
        self.name = f"slopshop_{slug.replace('-', '_')}"
        self.slug = slug
        self.description = f"{name}: {description}"
        self.api_key = api_key
        self.base_url = base_url
        self.return_direct = False

    def __call__(self, input_text):
        return self.run(input_text)

    def run(self, input_text):
        """Execute the tool with string input."""
        # Try to parse as JSON, fall back to text
        try:
            body = json.loads(input_text)
        except (json.JSONDecodeError, TypeError):
            body = {"text": str(input_text), "data": str(input_text), "input": str(input_text)}

        url = f"{self.base_url}/v1/{self.slug}"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        data = json.dumps(body).encode()
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")

        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                result = json.loads(res.read().decode())
                # Return a clean string for the agent
                if isinstance(result, dict):
                    result.pop("_engine", None)
                return json.dumps(result, indent=2)
        except Exception as e:
            return f"Error: {str(e)}"

    async def arun(self, input_text):
        """Async version (falls back to sync)."""
        return self.run(input_text)


class SlopshopToolkit:
    """Get LangChain-compatible tools from Slopshop."""

    def __init__(self, api_key, base_url="https://slopshop.gg"):
        self.api_key = api_key
        self.base_url = base_url
        self._catalog = None

    def _fetch_catalog(self):
        if self._catalog:
            return self._catalog
        url = f"{self.base_url}/v1/tools"
        headers = {"Authorization": f"Bearer {self.api_key}"}
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=30) as res:
            self._catalog = json.loads(res.read().decode())
        return self._catalog

    def get_tools(self, categories=None, slugs=None, max_tools=50):
        """Get LangChain Tool objects for Slopshop APIs.

        Args:
            categories: Filter by category names (e.g., ["Text Processing"])
            slugs: Specific tool slugs to include
            max_tools: Max tools to return (default 50)
        """
        catalog = self._fetch_catalog()
        tools = []

        for category in catalog.get("categories", catalog if isinstance(catalog, list) else []):
            cat_name = category.get("name", "")
            if categories and cat_name not in categories:
                continue

            for api in category.get("apis", []):
                slug = api.get("slug", "")
                if slugs and slug not in slugs:
                    continue

                tools.append(SlopshopTool(
                    slug=slug,
                    name=api.get("name", slug),
                    description=api.get("desc", ""),
                    api_key=self.api_key,
                    base_url=self.base_url,
                ))

                if len(tools) >= max_tools:
                    return tools

        return tools

    def get_memory_tools(self):
        """Get just the memory tools (free, 0 credits)."""
        return self.get_tools(slugs=[
            "memory-set", "memory-get", "memory-search", "memory-list",
            "memory-delete", "memory-history", "memory-stats",
            "memory-vector-search",
        ])

    def get_compute_tools(self, max_tools=20):
        """Get popular compute tools."""
        return self.get_tools(categories=[
            "Text Processing", "Crypto & Security", "Math & Numbers",
            "Data Transform", "Validation",
        ], max_tools=max_tools)
