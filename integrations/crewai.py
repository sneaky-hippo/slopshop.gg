"""
Slopshop CrewAI Integration

Usage:
    from slopshop.integrations.crewai import SlopshopCrewTools

    slop_tools = SlopshopCrewTools(api_key="sk-slop-...")

    # Use with CrewAI
    from crewai import Agent
    researcher = Agent(
        role="Researcher",
        tools=slop_tools.get_tools(categories=["Text Processing", "Analyze"]),
    )
"""

import json
import urllib.request


class SlopshopCrewTool:
    """A Slopshop API as a CrewAI-compatible tool."""

    name: str
    description: str

    def __init__(self, slug, name, description, api_key, base_url="https://slopshop.gg"):
        self.name = f"slopshop_{slug.replace('-', '_')}"
        self.slug = slug
        self.description = f"{name}: {description}"
        self.api_key = api_key
        self.base_url = base_url

    def _run(self, **kwargs):
        """Execute the tool."""
        url = f"{self.base_url}/v1/{self.slug}"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.api_key}",
        }
        data = json.dumps(kwargs).encode()
        req = urllib.request.Request(url, data=data, headers=headers, method="POST")

        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                result = json.loads(res.read().decode())
                result.pop("_engine", None)
                return json.dumps(result, indent=2)
        except Exception as e:
            return f"Error: {str(e)}"


class SlopshopCrewTools:
    """Get CrewAI-compatible tools from Slopshop."""

    def __init__(self, api_key, base_url="https://slopshop.gg"):
        self.api_key = api_key
        self.base_url = base_url

    def get_tools(self, categories=None, slugs=None, max_tools=30):
        url = f"{self.base_url}/v1/tools"
        headers = {"Authorization": f"Bearer {self.api_key}"}
        req = urllib.request.Request(url, headers=headers)

        try:
            with urllib.request.urlopen(req, timeout=30) as res:
                catalog = json.loads(res.read().decode())
        except Exception:
            return []

        tools = []
        for category in catalog.get("categories", catalog if isinstance(catalog, list) else []):
            cat_name = category.get("name", "")
            if categories and cat_name not in categories:
                continue
            for api in category.get("apis", []):
                slug = api.get("slug", "")
                if slugs and slug not in slugs:
                    continue
                tools.append(SlopshopCrewTool(
                    slug=slug, name=api.get("name", slug),
                    description=api.get("desc", ""),
                    api_key=self.api_key, base_url=self.base_url,
                ))
                if len(tools) >= max_tools:
                    return tools
        return tools
