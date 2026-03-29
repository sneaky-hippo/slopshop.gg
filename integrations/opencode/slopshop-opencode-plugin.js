// Slopshop OpenCode Plugin — full event-driven integration
// Provides 925+ real compute tools, persistent memory, agent swarms,
// and hive workspaces as native OpenCode capabilities.

const BASE_URL = process.env.SLOPSHOP_URL || "https://slopshop.gg";
const API_KEY = process.env.SLOPSHOP_KEY || "";

async function slopFetch(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Slopshop API error: ${res.status} ${res.statusText}`);
  return res.json();
}

async function fetchToolRegistry() {
  const res = await fetch(`${BASE_URL}/v1/tools`, {
    headers: { Authorization: `Bearer ${API_KEY}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.tools || [];
}

module.exports = {
  name: "@slopshop/opencode-plugin",
  version: "1.0.0",
  description: "925+ real deterministic compute handlers, persistent memory, agent swarms, and hive workspaces for OpenCode.",

  // --- Lifecycle hooks ---

  async onInit(ctx) {
    console.log("[slopshop] Initializing plugin...");
    if (!API_KEY) {
      console.warn("[slopshop] SLOPSHOP_KEY not set. Set it in your environment for full access.");
      return;
    }

    // Dynamically register tools from the remote registry
    try {
      const tools = await fetchToolRegistry();
      for (const tool of tools) {
        ctx.registerTool({
          name: tool.slug || tool.name,
          description: tool.description,
          inputSchema: tool.inputSchema || { type: "object", properties: {} },
          handler: async (input) => slopFetch(`/v1/call/${tool.slug || tool.name}`, input),
        });
      }
      console.log(`[slopshop] Registered ${tools.length} tools from registry.`);
    } catch (err) {
      console.error("[slopshop] Failed to fetch tool registry:", err.message);
    }

    // Register persistent memory as a resource
    ctx.registerResource({
      name: "slopshop-memory",
      description: "Persistent key-value memory that survives across sessions. Free forever.",
      uri: "slopshop://memory",
      async read({ key, prefix }) {
        if (key) return slopFetch("/v1/call/slop-memory-get", { key });
        if (prefix) return slopFetch("/v1/call/slop-memory-list", { prefix });
        return slopFetch("/v1/call/slop-memory-list", {});
      },
      async write({ key, value }) {
        return slopFetch("/v1/call/slop-memory-set", { key, value });
      },
    });

    console.log("[slopshop] Plugin initialized successfully.");
  },

  async onToolCall(ctx, { toolName, input }) {
    // Intercept tool calls for logging and credit tracking
    const startTime = Date.now();
    console.log(`[slopshop] Tool call: ${toolName}`);

    // Let the call proceed naturally — this hook is for observation
    return {
      beforeCall: () => {
        ctx.metadata = { ...ctx.metadata, slopshop_start: startTime };
      },
      afterCall: (result) => {
        const elapsed = Date.now() - startTime;
        console.log(`[slopshop] ${toolName} completed in ${elapsed}ms`);

        // Auto-store results in memory if configured
        if (ctx.config?.autoMemory) {
          const memKey = `auto/${toolName}/${Date.now()}`;
          slopFetch("/v1/call/slop-memory-set", {
            key: memKey,
            value: JSON.stringify({ tool: toolName, input, result, elapsed }),
          }).catch(() => {});
        }

        return result;
      },
    };
  },

  async onCommand(ctx, { command, args }) {
    // Custom slash commands for OpenCode
    switch (command) {
      case "/slop": {
        // Quick tool call: /slop crypto-hash-sha256 {data: "hello"}
        const [slug, ...rest] = args;
        const input = rest.length ? JSON.parse(rest.join(" ")) : {};
        return slopFetch(`/v1/call/${slug}`, input);
      }

      case "/slop-search": {
        // Search tools: /slop-search hash
        const query = args.join(" ");
        return slopFetch("/v1/call/slop-tools-search", { query });
      }

      case "/slop-memory": {
        // Memory operations: /slop-memory get mykey, /slop-memory set mykey myvalue
        const [action, key, ...valueParts] = args;
        if (action === "get") return slopFetch("/v1/call/slop-memory-get", { key });
        if (action === "set") return slopFetch("/v1/call/slop-memory-set", { key, value: valueParts.join(" ") });
        if (action === "search") return slopFetch("/v1/call/slop-memory-search", { query: key });
        if (action === "list") return slopFetch("/v1/call/slop-memory-list", { prefix: key });
        return { error: "Usage: /slop-memory <get|set|search|list> <key> [value]" };
      }

      case "/slop-army": {
        // Deploy swarm: /slop-army deploy "task" 10
        const [action, task, count] = args;
        if (action === "deploy") return slopFetch("/v1/call/slop-army-deploy", { task, count: parseInt(count) || 5 });
        if (action === "status") return slopFetch("/v1/call/slop-army-status", { army_id: task });
        if (action === "collect") return slopFetch("/v1/call/slop-army-collect", { army_id: task });
        return { error: "Usage: /slop-army <deploy|status|collect> <task|army_id> [count]" };
      }

      case "/slop-balance": {
        return slopFetch("/v1/call/slop-credit-balance", {});
      }

      default:
        return null; // Not our command, pass through
    }
  },

  async onSessionEnd(ctx) {
    // Persist session summary to memory on exit
    if (!API_KEY) return;

    try {
      const sessionId = ctx.sessionId || `session-${Date.now()}`;
      const summary = {
        sessionId,
        endedAt: new Date().toISOString(),
        toolCalls: ctx.metadata?.toolCallCount || 0,
        project: ctx.project?.name || "unknown",
      };
      await slopFetch("/v1/call/slop-memory-set", {
        key: `sessions/${sessionId}`,
        value: JSON.stringify(summary),
      });
      console.log(`[slopshop] Session summary saved to memory: sessions/${sessionId}`);
    } catch (err) {
      // Silent fail on session end — don't block exit
    }
  },

  // --- Static tool definitions (fallback if registry fetch fails) ---
  tools: [
    {
      name: "slop-call",
      description: "Call any of 925+ Slopshop compute handlers by slug. Use slop-tools-search to discover available tools.",
      inputSchema: {
        type: "object",
        properties: {
          slug: { type: "string", description: "Tool slug (e.g. crypto-hash-sha256)" },
          input: { type: "object", description: "Tool-specific input parameters" },
        },
        required: ["slug"],
      },
      handler: async ({ slug, input }) => slopFetch(`/v1/call/${slug}`, input || {}),
    },
    {
      name: "slop-memory-set",
      description: "Store a key-value pair in persistent memory. Free forever, no expiration.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string" },
          value: { type: "string" },
        },
        required: ["key", "value"],
      },
      handler: async (input) => slopFetch("/v1/call/slop-memory-set", input),
    },
    {
      name: "slop-memory-get",
      description: "Retrieve a value from persistent memory by key.",
      inputSchema: {
        type: "object",
        properties: { key: { type: "string" } },
        required: ["key"],
      },
      handler: async (input) => slopFetch("/v1/call/slop-memory-get", input),
    },
    {
      name: "slop-memory-search",
      description: "Semantic search across all stored memories.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
      handler: async (input) => slopFetch("/v1/call/slop-memory-search", input),
    },
    {
      name: "slop-army-deploy",
      description: "Deploy a parallel agent swarm with Merkle-verified results.",
      inputSchema: {
        type: "object",
        properties: {
          task: { type: "string" },
          count: { type: "number" },
        },
        required: ["task"],
      },
      handler: async (input) => slopFetch("/v1/call/slop-army-deploy", input),
    },
    {
      name: "slop-tools-search",
      description: "Search available tools by keyword or category.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
      handler: async (input) => slopFetch("/v1/call/slop-tools-search", input),
    },
  ],

  // --- Plugin configuration ---
  config: {
    autoMemory: false, // Set to true to auto-log all tool calls to memory
  },
};
