# UniAudioAgent — AI Workspace Instructions

**Project:** AI desktop assistant for game audio designers. The current app is an LLM host and settings shell; Wwise integration will be reintroduced later via MCP.

**Language:** Electron + React + TypeScript + Tailwind. Documentation in Chinese (see [DEVELOPMENT.md](../docs/DEVELOPMENT.md)).

---

## Quick Start

### Commands
- **Dev mode:** `npm run dev` — Hot-reload development server
- **Build:** `npm run build` — Compile TypeScript and bundle
- **Package:** `npm run distribute` — Build + electron-builder (creates installers)
- **Type check:** `npm run typecheck` — Type-check both main and renderer

### Entry Points
- **Main process:** [src/main/index.ts](../src/main/index.ts)
- **Shared types:** [src/shared/ipc-channels.ts](../src/shared/ipc-channels.ts) (type-safe IPC catalog)
- **Package config:** [package.json](../package.json)

---

## Architecture

### Process Separation
```
Main Process (Node.js)              Renderer Process (Chromium)
├── LLM API calls                  ├── React UI
├── IPC handlers                   └── Event listeners
├── Persistent storage (encrypted)
└── Future MCP host integration
```

**Key principle:** All API keys and external service calls happen in main process. Renderer is sandboxed (`contextIsolation: true`).

### IPC Communication

All channels defined in [ipc-channels.ts](../src/shared/ipc-channels.ts) using dot notation:

| Pattern | Example | Direction | Purpose |
|---------|---------|-----------|---------|
| `CHAT_*` | `CHAT_SEND`, `CHAT_DELTA`, `CHAT_DONE` | Bi-directional | Streaming chat conversation |
| `SETTINGS_*` | `SETTINGS_GET`, `SETTINGS_SET` | Bi-directional | Persistent configuration |

**Streaming pattern:** Renderer sends `CHAT_SEND` → Main streams tokens via `CHAT_DELTA` events → Ends with `CHAT_DONE`.

---

## Key Services (Main Process)

### [storeService](../src/main/services/store.ts)
- Persistent encrypted storage using `electron-store` + OS keychain (`safeStorage`)
- Stores: `llmProvider`, `openrouterApiKey`, `ollamaBaseUrl`, `defaultModel`
- Automatically available across app restarts

### [LLM Streaming](../src/main/services/llm.ts)
- Uses Vercel AI SDK (`ai@^4.3.15`) with OpenRouter and Ollama providers
- Chinese system prompt tuned for the current pre-MCP host phase
- Tool calling loop reserved for future MCP tool integration
- Runs inside main process, streams tokens to renderer

---

## Naming Conventions

- **IPC channels:** Lowercase dot notation (`chat:send`, `settings:get`)
- **Services:** Suffix with `Service` (`storeService`)
- **Tools/Functions:** Camel case with descriptive names (`getProjectInfo`, `setProperty`)
- **Types:** Re-export from [types.ts](../src/shared/types.ts) for type safety

---

## TypeScript Configuration

Split into three configs:
- **[tsconfig.json](../tsconfig.json)** — Root (references the others)
- **[tsconfig.node.json](../tsconfig.node.json)** — Main process (Node.js target)
- **[tsconfig.web.json](../tsconfig.web.json)** — Renderer process (Browser target)

Path aliases:
- `@shared/*` → `src/shared/`
- `@renderer/*` → `src/renderer/src/` (when renderer directory exists)

---

## Project Status & Phases

**Phase 1 (Complete):** LLM host shell with MCP Host framework.
- [x] Project skeleton (electron-vite + React + Tailwind)
- [x] electron-store + safeStorage (encrypted API key)
- [x] LLM service (Vercel AI SDK + OpenRouter / Ollama, streaming)
- [x] IPC handlers (chat:send streaming, settings:get/set)
- [x] Preload bridge (window.api)
- [x] Chat UI (MessageList, InputBar, SettingsPanel)
- [x] Removed built-in WAAPI and Wwise tools pending MCP integration
- [x] MCP Host initial integration (@modelcontextprotocol/sdk Client)
- [x] Multi-server MCP config support (mcp.config.json)
- [x] Dynamic tool discovery and registration
- [x] npm install + full typecheck validation

**Phase 2:** MCP architecture (Wwise tools as independent MCP Server)  
**Phase 3:** Local RAG knowledge base (LanceDB)  
**Phase 4:** DAW integration (Reaper, batch workflows)

See [ROADMAP.md](../docs/ROADMAP.md) for full roadmap.

---

## Common Development Tasks

### Adding a new IPC channel
1. Add channel definition to [ipc-channels.ts](../src/shared/ipc-channels.ts) with `as const`
2. Export types for request/response payloads in [types.ts](../src/shared/types.ts)
3. Register handler in main process (e.g., in [src/main/index.ts](../src/main/index.ts))
4. Call from renderer via `ipcRenderer.invoke()` or `ipcRenderer.on()`

### Adding a new tool

**Built-in tool** (general-purpose capabilities — file I/O, shell, etc.):
1. Add the tool to `src/main/tools/built-in.ts` using `tool({ description, parameters: z.object({...}), execute })`
2. Export it from the `builtinTools` object at the bottom of the file
3. Builtin tools are automatically included in `allTools` at startup — no changes to `index.ts` needed

**MCP tool** (external system integrations — Wwise, DAW, etc.):
1. Prefer implementing as an independent MCP Server package
2. Add a server entry to `mcp.config.json`; `initializeMcpHost()` handles discovery automatically

### Running type checks
```powershell
npm run typecheck:node    # Main process only
npm run typecheck:web     # Renderer only
npm run typecheck         # Both
```

---

## Documentation

- **[DEVELOPMENT.md](../docs/DEVELOPMENT.md)** — Reference for AI agents and developers (in Chinese)
- **[ROADMAP.md](../docs/ROADMAP.md)** — Phase-by-phase feature plan
- **[MVP.md](../docs/MVP.md)** — Phase 1 acceptance criteria
- Always update these docs when adding features or changing architecture! If nessary, add new markdown files for specific features or guides.
- Write in Chinese.

---

## Technology Stack

| Layer | Technology | Notes |
|-------|-----------|-------|
| **Bundler** | electron-vite | Optimized Electron + Vite integration |
| **Framework** | Electron 31.x, React 18.x | Main + Renderer |
| **Styling** | Tailwind CSS 3.x | Utility-first CSS |
| **Language** | TypeScript 5.5 | Full type safety |
| **LLM** | Vercel AI SDK 4.x + OpenRouter / Ollama | Streaming + tool calling |
| **IPC** | Electron IPC (preload + context isolation) | Type-safe via ipc-channels.ts |
| **MCP** | @modelcontextprotocol/sdk 1.18+| Multi-server host, stdio transport |
| **Storage** | electron-store 8.x | Encrypted with OS keychain |
| **Serialization** | Zod 3.x | Schema validation + JSON Schema → Zod mapping |

**ℹ️ Current Phase:** Phase 1 complete. MCP Host framework operational. Ready for external MCP servers.
- App loads `mcp.config.json` at startup and dynamically registers tools from external MCP servers.
- Supports tool filtering, timeout protection, and namespace isolation via `toolPrefix`.
- WAAPI/WebSocket logic stays in future Wwise MCP server, not in Electron app.

---

## Security Notes

- **Context isolation:** Enabled (`contextIsolation: true` in [src/main/index.ts](../src/main/index.ts))
- **API keys:** Encrypted in electron-store using OS keychain (`safeStorage`)
- **Preload script:** Implemented at [src/preload/index.ts](../src/preload/index.ts), exposes `window.api` with `invoke/on/once/send`
- **MCP Process Spawn:** Child MCP server processes inherit minimal environment; all credentials passed explicitly via env config.

---

## Next Steps for Continuing Phase 2


### Priority 1: MCP Server Integration
1. Update `mcp.config.json` with your server launch command and parameters
2. Run `npm run dev` and verify server connects (check console logs `[mcp]` prefix)
3. Test tool calling via chat UI
4. Document available tools in README and server-side code

### Priority 2: App Feature Extension
1. New IPC channels → define in [ipc-channels.ts](../src/shared/ipc-channels.ts) first
2. New services → add to `src/main/services/` following [storeService](../src/main/services/store.ts) pattern
3. New React components → place in [src/renderer/src/components/](../src/renderer/src/components/) with Tailwind styling
4. MCP service management UI → extend Settings panel with:
   - Connected servers list + status
   - Tool groups display (priority, context budget, enabled state)
   - Tool search / filtering
5. Run `npm run typecheck` after all changes; commit only when passing

### Architecture: Tool Execution (Not via OpenRouter API)

**Key Clarification:** Tools are NOT executed through OpenRouter API. All tool definition, validation, and execution happen locally:

```
Local (Main Process)
├── MCP Servers + Built-in Tools + Tool Groups
└── allTools {} (Zod schema + execute functions)
        ↓
        → AI SDK (validate params, control flow)
        ↓
      Send tool names + params to OpenRouter LLM
        ↓
LLM 推理：根据上下文选择合适的工具
        ↓
Main process 本地执行工具 (stdio, file ops, queries, etc.)
        ↓
结果返回给 LLM 继续推理
```

**Benefits:**
- Low latency (local execution, no API roundtrips)
- Privacy (tool params/results stay local)
- Cost-effective (only LLM tokens counted)
- Flexible (add/remove tools anytime without API changes)

### Testing MCP Integration
- Enable debug logs: `UNIAUDIO_DEBUG=mcp` (future enhancement)
- Verify server connects at startup (console `[mcp] Connected server ...`)
- Test tool timeout: simulate slow MCP responses (should timeout gracefully)
- Test tool call/result streaming: verify `CHAT_TOOL_CALL` messages appear in chat UI
- Test tool group filtering: verify high-priority tools always included, low-priority culled under context pressure

---

## Troubleshooting

- **Hot reload not working** → Ensure you ran `npm run dev` not just `npm run build`
- **Type errors across processes** → Check you're using the correct `tsconfig` path, especially MCP SDK imports need `.js` extension
- **MCP server fails to connect** → Check command path, process launch permissions, and environment variables; review console `[mcp]` error logs
- **MCP tool not showing up** → Verify `toolPrefix`, `includeTools` filtering, and `listTools()` output from server
- **Tool call timeout** → Increase `timeoutMs` in config, or check if MCP server is overloaded/slow
- **Too many tools in context** → Implement tool grouping with priorities to dynamically cull low-priority tools (see [DEVELOPMENT.md § 6.4](../docs/DEVELOPMENT.md#64-混合工具源架构工具分组与优先级阶段二后期设计))
