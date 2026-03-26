# UniAudioAgent — AI Workspace Instructions

**Project:** AI desktop assistant for game audio designers, providing natural language interface to Wwise audio middleware via LLM with tool calling.

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
├── Wwise WAAPI WebSocket          ├── Component hierarchy
├── IPC handlers                   └── Event listeners
├── Persistent storage (encrypted)
└── Tool coordination
```

**Key principle:** All API keys and external service calls happen in main process. Renderer is sandboxed (`contextIsolation: true`).

### IPC Communication

All channels defined in [ipc-channels.ts](../src/shared/ipc-channels.ts) using dot notation:

| Pattern | Example | Direction | Purpose |
|---------|---------|-----------|---------|
| `CHAT_*` | `CHAT_SEND`, `CHAT_DELTA`, `CHAT_DONE` | Bi-directional | Streaming chat conversation |
| `WAAPI_*` | `WAAPI_STATUS`, `WAAPI_RECONNECT` | Bi-directional | Wwise connection state |
| `SETTINGS_*` | `SETTINGS_GET`, `SETTINGS_SET` | Bi-directional | Persistent configuration |

**Streaming pattern:** Renderer sends `CHAT_SEND` → Main streams tokens via `CHAT_DELTA` events → Ends with `CHAT_DONE`.

---

## Key Services (Main Process)

### [waapiService](../src/main/services/waapi.ts)
- WebSocket WAMP v2 client to Wwise (custom implementation via `ws` package)
- Calls Wwise RPC methods: `ak.wwise.core.getInfo`, `ak.wwise.core.object.setProperty`, etc.
- Connection timeout: 15 seconds per call
- Reports connection state to renderer via `WAAPI_STATUS` IPC

### [storeService](../src/main/services/store.ts)
- Persistent encrypted storage using `electron-store` + OS keychain (`safeStorage`)
- Stores: `waapiUrl`, `openrouterApiKey`, `defaultModel`
- Automatically available across app restarts

### [LLM Streaming](../src/main/services/llm.ts)
- Uses Vercel AI SDK (`ai@^4.3.15`) with OpenRouter provider
- Chinese system prompt (Wwise domain expert persona)
- Tool calling loop (max 10 iterations)
- Runs inside main process, streams tokens to renderer

---

## Naming Conventions

- **IPC channels:** Lowercase dot notation (`chat:send`, `waapi:status`)
- **Services:** Suffix with `Service` (`waapiService`, `storeService`)
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

**Phase 1 (MVP):** Core Wwise + LLM interaction. In progress.
- [x] Project skeleton (electron-vite + React + Tailwind)
- [x] electron-store + safeStorage (encrypted API key)
- [x] WAAPI service (native WAMP/ws client, auto-reconnect, SSRF guard)
- [x] LLM service (Vercel AI SDK + OpenRouter, streaming, tool calling)
- [x] 6 Wwise tools (getProjectInfo, findObjects, getObject, getChildren, setProperty, getSelectedObjects)
- [x] IPC handlers (chat:send streaming, settings:get/set)
- [x] Preload bridge (window.api)
- [x] Chat UI (MessageList, InputBar, SettingsPanel, StatusBar)
- [ ] npm install + first run validation
- [ ] End-to-end test with live Wwise instance

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

### Adding a Wwise tool
1. Create new file in [src/main/tools/wwise/](../src/main/tools/wwise/) (e.g., `newTool.ts`)
2. Export with `tool({ description, parameters: z.object({...}), execute })`
3. Import and add to `allTools` in [src/main/tools/index.ts](../src/main/tools/index.ts)
4. Update the Tool table in [docs/MVP.md](../docs/MVP.md)

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
| **LLM** | Vercel AI SDK 4.x + OpenRouter | Streaming + tool calling |
| **IPC** | Electron IPC (preload + context isolation) | Type-safe via ipc-channels.ts |
| **Wwise API** | WAMP v2 over WebSocket | Custom client (`ws` package) |
| **Storage** | electron-store 8.x | Encrypted with OS keychain |
| **Serialization** | Zod 3.x | Schema validation for tool parameters |

**⚠️ Note:** Official `waapi-client` npm package hasn't been maintained in 8+ years (v2017.2.1). This project uses a lightweight WAMP v2 client built with `ws`.

---

## Security Notes

- **Context isolation:** Enabled (`contextIsolation: true` in [src/main/index.ts](../src/main/index.ts))
- **SSRF protection:** WAAPI client only accepts loopback addresses (`127.0.0.1`, `localhost`, `::1`)
- **API keys:** Encrypted in electron-store using OS keychain (`safeStorage`)
- **Preload script:** Implemented at [src/preload/index.ts](../src/preload/index.ts), exposes `window.api` with `invoke/on/once/send`

---

## Next Steps for AI Agents

When implementing features:
1. Check [MVP.md](../docs/MVP.md) for acceptance criteria
2. Verify channel types are defined in [ipc-channels.ts](../src/shared/ipc-channels.ts)
3. Follow naming conventions in existing code
4. Run `npm run typecheck` before committing
5. Document new IPC channels and services in this file or refer existing docs

---

## Troubleshooting

- **Hot reload not working** → Ensure you ran `npm run dev` not just `npm run build`
- **Type errors across processes** → Check you're using the correct `tsconfig` path
- **Wwise not connecting** → Check [waapiService](../src/main/services/waapi.ts) logs and verify Wwise is running on configured URL
