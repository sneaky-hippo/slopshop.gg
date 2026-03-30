"""
Slopshop + LangGraph Integration v2
====================================
Drop-in adapter that gives LangGraph agents access to all 1,269 Slopshop tools
with free persistent memory checkpoints (no Redis/Postgres needed).

Usage:
    pip install langchain-core langgraph requests
    export SLOPSHOP_KEY=sk-slop-...
    python slopshop-langgraph-v2.py

Features:
- All 1,269 compute tools as LangGraph ToolNodes
- Free persistent memory checkpoints (survives restarts)
- Autonomous memory evolution (consolidate/summarize between runs)
- North Star research integration
- Multi-LLM routing (Claude/Grok/DeepSeek/GPT)
"""

import os
import json
import requests
from typing import Any, Dict, List, Optional

SLOP_BASE = os.getenv("SLOPSHOP_URL", "https://slopshop.gg")
SLOP_KEY = os.getenv("SLOPSHOP_KEY", "sk-slop-demo-key-12345678")
HEADERS = {"Authorization": f"Bearer {SLOP_KEY}", "Content-Type": "application/json"}


class SlopshopMemoryCheckpointer:
    """Free persistent checkpoints using Slopshop memory (0 credits forever)."""

    def __init__(self, namespace: str = "langgraph-checkpoints"):
        self.namespace = namespace

    def put(self, thread_id: str, checkpoint_id: str, data: dict):
        requests.post(f"{SLOP_BASE}/v1/memory-set", json={
            "key": f"{thread_id}:{checkpoint_id}",
            "value": json.dumps(data),
            "namespace": self.namespace,
            "tags": "checkpoint,langgraph"
        }, headers=HEADERS)

    def get(self, thread_id: str, checkpoint_id: str) -> Optional[dict]:
        r = requests.post(f"{SLOP_BASE}/v1/memory-get", json={
            "key": f"{thread_id}:{checkpoint_id}",
            "namespace": self.namespace
        }, headers=HEADERS)
        data = r.json().get("data", {})
        if data.get("value"):
            return json.loads(data["value"])
        return None

    def list(self, thread_id: str) -> List[str]:
        r = requests.post(f"{SLOP_BASE}/v1/memory-search", json={
            "query": thread_id,
            "namespace": self.namespace
        }, headers=HEADERS)
        return [item["key"] for item in r.json().get("data", {}).get("results", [])]

    def evolve(self):
        """Trigger autonomous memory evolution (consolidate/summarize)."""
        requests.post(f"{SLOP_BASE}/v1/memory/evolve/start", json={
            "namespace": self.namespace,
            "strategy": "consolidate"
        }, headers=HEADERS)


class SlopshopToolkit:
    """Wraps all 1,269 Slopshop handlers as callable tools for LangGraph."""

    def __init__(self, categories: Optional[List[str]] = None):
        self.tools = self._load_tools(categories)

    def _load_tools(self, categories=None):
        r = requests.get(f"{SLOP_BASE}/v1/tools?limit=2000", headers=HEADERS)
        apis = r.json().get("apis", [])
        if categories:
            apis = [a for a in apis if a.get("category", "").lower() in [c.lower() for c in categories]]
        return apis

    def get_tool_definitions(self):
        """Returns LangGraph-compatible tool definitions."""
        return [{
            "name": t["slug"],
            "description": t.get("description", t.get("name", t["slug"])),
            "parameters": t.get("input_schema", {})
        } for t in self.tools]

    def execute(self, slug: str, params: dict) -> dict:
        """Execute a Slopshop tool and return result."""
        r = requests.post(f"{SLOP_BASE}/v1/{slug}", json=params, headers=HEADERS)
        return r.json().get("data", r.json())


class SlopshopResearch:
    """Advanced Research with multi-LLM (Claude + Grok + DeepSeek + GPT)."""

    @staticmethod
    def research(topic: str, tier: str = "basic") -> dict:
        r = requests.post(f"{SLOP_BASE}/v1/research", json={
            "topic": topic, "tier": tier
        }, headers=HEADERS)
        return r.json().get("data", {})

    @staticmethod
    def set_northstar(goal: str) -> dict:
        r = requests.post(f"{SLOP_BASE}/v1/northstar/set", json={
            "goal": goal
        }, headers=HEADERS)
        return r.json().get("data", {})


# Example: Full LangGraph agent with Slopshop backend
if __name__ == "__main__":
    toolkit = SlopshopToolkit(categories=["Crypto & Security", "Math & Numbers", "Text Processing"])
    checkpoint = SlopshopMemoryCheckpointer()

    print(f"Loaded {len(toolkit.tools)} tools")
    print(f"Categories: {set(t.get('category') for t in toolkit.tools)}")

    # Execute a tool
    result = toolkit.execute("crypto-hash-sha256", {"text": "langgraph + slopshop"})
    print(f"Hash: {result.get('hash', result)}")

    # Save checkpoint (free forever)
    checkpoint.put("thread-1", "step-1", {"hash_result": result, "step": "completed"})
    retrieved = checkpoint.get("thread-1", "step-1")
    print(f"Checkpoint retrieved: {retrieved is not None}")

    # Trigger evolution
    checkpoint.evolve()
    print("Memory evolution triggered")

    # Research
    research = SlopshopResearch.research("AI agent frameworks comparison")
    print(f"Research: {research.get('providers_used', 0)} providers used")
