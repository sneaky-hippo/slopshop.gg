# Slopshop Framework Integrations

Drop-in integrations for popular AI agent frameworks.

## LangChain

```python
from slopshop.integrations.langchain import SlopshopToolkit

toolkit = SlopshopToolkit(api_key="sk-slop-...")
tools = toolkit.get_tools(categories=["Text Processing", "Validation"])

# Use with any LangChain agent
from langchain.agents import initialize_agent
agent = initialize_agent(tools, llm, agent="zero-shot-react-description")
result = agent.run("Hash the word hello with SHA-256")
```

## CrewAI

```python
from slopshop.integrations.crewai import SlopshopCrewTools

tools = SlopshopCrewTools(api_key="sk-slop-...").get_tools()

from crewai import Agent
researcher = Agent(role="Researcher", tools=tools)
```

## Memory Tools (Free)

```python
# Get just the free memory tools
memory_tools = toolkit.get_memory_tools()
# memory-set, memory-get, memory-search, memory-list, etc.
# All 0 credits -- free forever
```
