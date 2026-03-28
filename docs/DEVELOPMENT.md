# UniAudioAgent 开发指引

> 供 AI Agent 和开发者快速上手的参考文档。执行开发任务时以本文档约定为准。

---

## 一、项目定位

面向游戏音频设计师的桌面 AI 工具，当前提供稳定的 LLM 宿主与设置管理，后续通过 MCP 接入 Wwise、Reaper 等外部工具。

**核心架构原则**
1. **进程隔离安全**：所有 LLM API 调用和外部服务交互在 Electron **主进程**中进行，API Key 不暴露至渲染进程
2. **MCP 优先**（阶段二）：工具层最终基于 MCP 协议，保证对外扩展性和生态互通
3. **最小核心**：打包产物只含 App 本体；工具、知识库以独立包形式附加

---

## 二、技术栈

| 包 | 版本 | 用途 |
|---|---|---|
| `electron` | ^31.x | 桌面应用框架 |
| `electron-vite` | ^2.x | Electron + Vite 集成构建 |
| `react` | ^18.x | 渲染进程 UI |
| `typescript` | ^5.x | 全项目类型 |
| `tailwindcss` | ^3.x | UI 样式 |
| `ai` (Vercel AI SDK) | ^4.x | LLM 调用、Tool calling、流式输出 |
| `@openrouter/ai-sdk-provider` | ^0.4.x | OpenRouter provider |
| `ollama-ai-provider` | ^1.x | Ollama provider |
| `electron-store` | ^8.x | 配置持久化 |
| `zod` | ^3.x | Tool 参数 Schema 定义 |
| `react-markdown` + `remark-gfm` | ^9.x/^4.x | 渲染 LLM Markdown 输出 |

**阶段二新增**
- `@modelcontextprotocol/sdk` ^1.x — MCP Host 客户端，动态发现外部工具

**阶段三新增**
- `@lancedb/lancedb` latest — 本地嵌入式向量数据库

> 当前仓库已移除内置 WAAPI 连接与 Wwise Tool，后续统一通过 MCP Server 接入外部能力。

---

## 三、目录结构

```
UniAudioAgent/
├── docs/                         # 项目文档（MVP、路线图、本文）
├── resources/                    # 打包资源（图标等）
├── src/
│   ├── shared/                   # 跨进程共享代码（不含 Electron/DOM API）
│   │   ├── types.ts              # 核心类型定义
│   │   └── ipc-channels.ts      # IPC channel 名称常量
│   │
│   ├── main/                     # Electron 主进程（Node.js）
│   │   ├── index.ts              # 入口：创建窗口、注册 IPC、启动服务
│   │   ├── services/
│   │   │   ├── store.ts          # electron-store + safeStorage 封装
│   │       ├── llm.ts            # Vercel AI SDK streamText 封装
│   │       └── mcp-host.ts       # MCP Host：加载配置、连接服务、动态注册工具
│   │   ├── tools/
│   │   │   ├── index.ts          # 工具注册表（builtin + mcp 两层合并）
│   │   │   └── built-in.ts       # 内置工具（文件I/O、Shell等，随App常驻）
│   │   └── ipc/
│   │       ├── chat.ts           # chat:send handler（流式推送）
│   │       └── settings.ts       # settings:get / settings:set
│   │
│   ├── preload/
│   │   ├── index.ts              # contextBridge 暴露 window.api
│   │   └── env.d.ts              # Window.api 类型补全
│   │
│   └── renderer/                 # 渲染进程（React + Tailwind）
│       ├── index.html            # Vite 入口 HTML
│       └── src/
│           ├── env.d.ts          # Vite 环境类型
│           ├── main.tsx          # React 挂载入口
│           ├── App.tsx           # 根组件：布局 + 设置开关
│           ├── index.css         # Tailwind + 全局样式
│           ├── components/
│           │   ├── ChatWindow.tsx
│           │   ├── MessageList.tsx
│           │   ├── InputBar.tsx
│           │   └── SettingsPanel.tsx
│           └── hooks/
│               └── useChat.ts    # 聊天状态管理 hook
│
├── electron.vite.config.ts
├── electron-builder.yml
├── tailwind.config.js
├── postcss.config.js
├── package.json
├── tsconfig.json
├── tsconfig.node.json
└── tsconfig.web.json
```

---

## 四、关键架构模式

### 4.1 IPC 通信流

```
渲染进程                               主进程
─────────────────────────────────────────────────────────────
window.api.invoke('chat:send', msgs)
                        ──────────────────────> ipcMain.handle
                                                  │ streamText({...})
                                                  │ for await (part of fullStream)
                        <── send('chat:delta', textDelta)
                        <── send('chat:tool-call', {toolName, args})
                        <── send('chat:tool-result', {toolName, result})
                        <── send('chat:done')
invoke resolves void  <────────────────────────── return
```

**原则**：渲染进程只知道 channel 名称，所有业务逻辑在主进程。

### 4.2 Tool 接入规范

工具层分为两类，共同注册到 `allTools` 供 AI SDK 使用：

#### 内置工具（Built-in Tools）

定义在 `src/main/tools/built-in.ts`，随 App 启动常驻，无需任何配置。当前内置工具一览：

| 工具名 | 功能 | 实现 |
|---|---|---|
| `read_file` | 读取文件文本内容 | `fs.readFile` |
| `write_file` | 写入或创建文件（自动创建目录） | `fs.writeFile` |
| `list_directory` | 列出目录下文件和子目录 | `fs.readdir` |
| `get_directory_tree` | 递归生成目录树（可控深度） | 递归 `fs.readdir` |
| `search_files` | 按文件名或内容关键词搜索 | 递归遍历 |
| `exec_command` | 执行 Shell 命令（`execFile`） | `child_process.execFile` |

**注意**：移除的是 Wwise 专属工具，通用工具（文件系统、Shell）以内置工具形式长期存在。

添加新内置工具的约定：

```typescript
// src/main/tools/built-in.ts（追加到此文件）
import { tool } from 'ai'
import { z } from 'zod'

const myTool = tool({
  // description 决定 LLM 何时调用本工具 — 必须准确描述"功能"与"适用场景"
  description: '...',
  parameters: z.object({
    // 每个参数必须有 .describe() — 帮助 LLM 准确填写参数
    name: z.string().describe('要查找的对象名称'),
  }),
  execute: async ({ name }) => {
    try {
      return { name }
    } catch (err) {
      // 不抛出异常，返回错误对象让 LLM 感知并告知用户
      return { error: `操作失败: ${String(err)}` }
    }
  },
})

// 在文件末尾的 builtinTools 导出中加入
export const builtinTools = { ..., myTool }
```

#### MCP 工具（外部扩展工具）

- 由 MCP Host 在主进程动态发现外部 MCP Server 提供的工具
- 将 MCP 工具映射为 AI SDK 可调用工具，再注册到 `allTools`（追加，不覆盖内置工具）
- 工具实现与外部连接（如 WAAPI WebSocket）均下沉到 MCP Server，不放在 Electron App 内
- 工具名带前缀以区分来源（如 `wwise__getProjectInfo`）

#### 工具注册架构

```
src/main/tools/index.ts
│
├── builtinTools  (built-in.ts) ← 常驻，App 启动时注册
│
└── mcpTools      (mcp-host.ts 动态写入) ← 按配置启动时注册
         ↓
       allTools = builtinTools + mcpTools
         ↓
       LLM (AI SDK streamText)
```

### 4.3 LLM 流式调用

```typescript
// src/main/ipc/chat.ts
ipcMain.handle(IPC.CHAT_SEND, async (event, messages: CoreMessage[]) => {
  const result = streamText({
    model: openrouter(settings.defaultModel),
    messages,
    tools: allTools,
    maxSteps: 10,      // 允许最多 10 轮工具调用
    system: SYSTEM_PROMPT,
  })

  for await (const part of result.fullStream) {
    if (part.type === 'text-delta')   event.sender.send(IPC.CHAT_DELTA, part.textDelta)
    if (part.type === 'tool-call')    event.sender.send(IPC.CHAT_TOOL_CALL, {...})
    if (part.type === 'tool-result')  event.sender.send(IPC.CHAT_TOOL_RESULT, {...})
    if (part.type === 'error')        event.sender.send(IPC.CHAT_ERROR, String(part.error))
  }

  event.sender.send(IPC.CHAT_DONE)
})
```

---

## 五、编码规范

- **TypeScript strict 模式**（`@electron-toolkit/tsconfig` 已启用）
- **IPC channel**：全部使用 `src/shared/ipc-channels.ts` 中的常量，禁止魔法字符串
- **API Key**：使用 `safeStorage.encryptString()` 加密后存储，仅在主进程解密使用
- **Electron 安全**：`contextIsolation: true`、`nodeIntegration: false`；渲染进程只通过 `preload` 暴露的 `window.api` 访问 IPC
- **Tool 错误处理**：`execute` 函数内必须 `try/catch`，捕获后返回 `{ error: string }`，不允许向外抛出
- **Tool 返回数据量**：查询类 Tool 默认限制返回 `count: 50`，避免超出 LLM context 窗口

---

## 六、新增工具步骤

**新增内置工具（通用能力首选）：**
1. 在 `src/main/tools/built-in.ts` 内用 `tool()` + `zod` 定义工具（参考 4.2 规范）
2. 将工具加入文件末尾的 `builtinTools` 导出对象
3. 更新 DEVELOPMENT.md §4.2 内置工具一览表

**新增 MCP 外部工具（外部系统集成首选）：**
1. 优先实现独立 MCP Server，由 MCP 侧负责外部连接与实际执行
2. 在 `mcp.config.json` 中新增服务配置条目
3. `initializeMcpHost()` 会自动发现并注册工具，且不影响内置工具
4. 在相关文档中补充能力边界和接入方式

### 6.1 MCP Host 生命周期与工具注册

**初始化流程**
1. App 启动时在 `app.whenReady()` 后调用 `initializeMcpHost()`
2. 读取 `mcp.config.json`（查找顺序：当前 cwd → app.getAppPath() → userData → 环境变量覆盖）
3. 对每个 `enabled !== false` 的服务，启动 stdio 子进程并建立 MCP Client
4. 通过 `client.listTools()` 获取工具列表
5. 动态构建 Zod Schema 并包装为 AI SDK 工具，注入 `allTools`
6. 实时日志输出连接状态与工具数量

**健壮性保障**
- 单个服务连接失败不影响其他服务和应用启动
- 工具调用超时 (timeoutMs) 防止 LLM 流式阻塞
- 应用退出时自动释放所有 MCP Client 连接 (`app.on('before-quit'`)

**SDK 导入注意**
当前 TypeScript 配置须使用 MCP SDK 子路径 + .js 扩展：
```typescript
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'
// 不支持: import { Client } from '@modelcontextprotocol/sdk/client'
```

### 6.2 MCP 多服务配置（`mcp.config.json`）

App 会在启动时读取仓库根目录的 `mcp.config.json`，并连接所有 `enabled !== false` 的服务。

标准配置示例：

```json
{
  "version": 1,
  "servers": [
    {
      "id": "wwise",
      "enabled": true,
      "transport": "stdio",
      "command": "node",
      "args": ["F:/tools/mcp-wwise/dist/index.js"],
      "cwd": "F:/tools/mcp-wwise",
      "env": {
        "NODE_ENV": "production"
      },
      "toolPrefix": "wwise",
      "includeTools": ["getProjectInfo", "findObjects"],
      "excludeTools": [],
      "timeoutMs": 30000
    }
  ]
}
```

字段说明：

- `id`（必填）：服务唯一标识
- `enabled`（可选，默认启用）：是否启用该服务
- `transport`（必填）：当前支持 `stdio`
- `command`（必填）：启动 MCP Server 的可执行文件或脚本
- `args`（可选）：进程启动参数数组
- `cwd`（可选）：进程工作目录
- `env`（可选）：进程环境变量（会合并到当前环境）
- `toolPrefix`（可选，默认为 `id`）：注册到 LLM 的工具名前缀，最终工具名形如 `prefix__toolName`
- `includeTools`（可选）：工具名白名单，仅注册列表中的工具
- `excludeTools`（可选）：工具名黑名单，排除列表中的工具
- `timeoutMs`（可选，默认 30000ms）：单次工具调用超时

配置加载与覆盖：
- 通过环境变量 `UNIAUDIO_MCP_CONFIG=<path>` 指定自定义配置文件路径
- 配置文件不存在时自动降级（servers 为空数组）
- 解析失败时输出错误日志并继续启动

### 6.3 JSON Schema 到 Zod 的自动映射

MCP Server 通过 `inputSchema`（JSON Schema 格式）声明工具参数。App 自动将其转换为 Zod Schema 供 AI SDK 验证参数：

```typescript
// MCP Server 声明（JSON Schema）
{
  "type": "object",
  "properties": {
    "query": { "type": "string", "description": "搜索关键词" },
    "limit": { "type": "integer", "description": "返回数量" }
  },
  "required": ["query"]
}

// 自动转换为 Zod
z.object({
  query: z.string().describe('搜索关键词'),
  limit: z.number().int().optional().describe('返回数量')
})
```

支持的 JSON Schema 类型：
- 基础：`string`, `number`, `integer`, `boolean`, `array`, `object`
- 枚举：`enum`
- 联合：`anyOf`, `oneOf`
- 嵌套与可选字段

如遇到复杂 Schema 映射失败，会回退到 `z.any()` 并输出警告日志。

### 6.4 LLM 输入输出调试

开发时可通过环境变量开启主进程日志：

- PowerShell：`$env:UNIAUDIO_DEBUG='llm'; npm run dev`
- cmd：`set UNIAUDIO_DEBUG=llm && npm run dev`

开启后，主进程终端会输出以下日志：

- `[llm-debug] request`：送入 AI SDK 的标准化请求，包含 `provider`、`model`、`toolNames`、`system`、`messages`
- `[llm-debug] stream-part`：`streamText(...).fullStream` 返回的每个标准化分片
- `[llm-debug] done` / `[llm-debug] failure`：请求结束或失败
- 同时会镜像写入 Electron 日志目录下的 `llm-debug.log`（UTF-8 编码），用于绕开 Windows 控制台乱码

注意事项：
- 当前日志展示的是 **AI SDK 标准化后的输入/输出结构**，不是底层 OpenRouter/Ollama 的原始 HTTP JSON
- 渲染进程发送到主进程的 `messages` 结构来自聊天历史，形如 `[{ role: 'user' | 'assistant', content: string }]`
- 过长字符串会被截断，避免终端日志过大
---

## 七、开发命令

| 命令 | 说明 |
|---|---|
| `npm install` | 安装依赖 |
| `npm run dev` | 开发模式（electron-vite + HMR） |
| `npm run build` | 构建主进程和渲染进程 |
| `npm run distribute` | 打包可执行文件（electron-builder） |
| `npm run typecheck` | 全项目类型检查 |

---

## 八、待决策（阶段三前确认）

| 项目 | 状态 | 备注 |
|---|---|---|
| RAG embedding 来源 | 未定 | OpenRouter API vs 本地 `@xenova/transformers` |
| i18n | 未开始 | 阶段二或三引入 |
| 历史会话持久化 | 未开始 | SQLite 或 JSON 文件 |
| 自动更新机制 | 未开始 | `electron-updater` |

---

## 九、外部参考

- [Vercel AI SDK 文档](https://sdk.vercel.ai/docs)
- [OpenRouter 模型列表](https://openrouter.ai/models)
- [MCP 协议规范](https://modelcontextprotocol.io)
- [electron-vite 文档](https://electron-vite.org)
