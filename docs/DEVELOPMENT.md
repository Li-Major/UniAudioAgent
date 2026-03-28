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
│   │   │   └── llm.ts            # Vercel AI SDK streamText 封装
│   │   ├── tools/
│   │   │   └── index.ts          # 工具注册表（当前为空，等待 MCP 动态接入）
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

当前仓库不再内置 Wwise Tool。后续接入方式：
- 由 MCP Host 在主进程动态发现外部 MCP Server 提供的工具
- 将 MCP 工具映射为 AI SDK 可调用工具，再注册到 `allTools`
- 工具实现与 WebSocket 连接均下沉到 MCP Server，不放在 Electron App 内

如果需要临时保留本地工具，仍然遵守以下约定：

```typescript
// src/main/tools/myTool.ts
import { tool } from 'ai'
import { z } from 'zod'

export const myTool = tool({
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
```

在 `src/main/tools/index.ts` 中注册：
```typescript
export const allTools = { myTool, ...otherTools }
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

## 六、新增 MCP / Tool 步骤

1. 优先实现独立 MCP Server，由 MCP 侧负责外部连接与实际执行
2. 在 App 主进程中为 MCP Client 增加发现、注册和生命周期管理
3. 如需临时本地工具，再用 `tool()` + `zod` 定义并导出（参考 4.2 规范）
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

### 6.4 混合工具源架构：工具分组与优先级（阶段二后期设计）

**背景**：当同时接入多个外部 MCP Server 与应用内置工具时，工具集合可能超过 20+ 个，容易导致 LLM context 压力。需要在保持灵活性的同时，智能地向 LLM 暴露合适的工具集。

**核心设计**

1. **工具分组**：按功能域将工具组织为逻辑分组（如 Wwise、Assets、Project）
2. **优先级**：每个分组有优先级，发生 context 压力时按优先级裁剪
3. **Context 预算**：每个分组预估 token 占用量，动态调整可用工具集
4. **动态加载**：根据对话上下文，选择性启用/禁用工具分组

**配置示例**（扩展 `mcp.config.json`）

```json
{
  "version": 1,
  "toolGroups": [
    {
      "id": "wwise",
      "name": "Wwise 工作流",
      "priority": 10,
      "description": "Wwise DAW 操作：查询对象、修改属性、导出事件和SoundBank",
      "contextBudget": 3000,
      "enabled": true
    },
    {
      "id": "assets",
      "name": "音频资产管理",
      "priority": 20,
      "description": "导入导出、格式转换、批量操作",
      "contextBudget": 2000,
      "enabled": true
    },
    {
      "id": "project",
      "name": "项目工具（应用内置）",
      "priority": 30,
      "description": "项目信息查询、配置管理、最近项目",
      "contextBudget": 1500,
      "enabled": true
    }
  ],
  "servers": [
    {
      "id": "wwise",
      "toolGroup": "wwise",
      "enabled": true,
      "transport": "stdio",
      "command": "node",
      "args": ["./mcp-wwise/dist/index.js"],
      "toolPrefix": "wwise",
      "timeoutMs": 30000
    },
    {
      "id": "assets",
      "toolGroup": "assets",
      "enabled": true,
      "transport": "stdio",
      "command": "node",
      "args": ["./mcp-assets/dist/index.js"],
      "toolPrefix": "assets",
      "timeoutMs": 25000
    }
  ]
}
```

**实现要点**

| 文件 | 职责 | 变更说明 |
|---|---|---|
| `src/main/tools/built-in.ts` | 应用内置工具 | 新增，定义 `project__*` 等内置工具 |
| `src/main/tools/index.ts` | 工具注册表 | 新增 `loadInternalTools()` + `getToolsByPriority()` |
| `src/main/services/mcp-host.ts` | MCP Host | 新增 `ToolGroupConfig`、`toolGroupRegistry` 管理 |
| `src/main/services/llm.ts` | LLM 调用 | 可选：根据 context 使用 `getToolsByPriority()` 动态选择工具集 |
| `mcp.config.json` | 配置文件 | 新增 `toolGroups` 字段 |

**工具命名规范**

所有来自 MCP 的工具使用 `prefix__toolName` 格式（自动）；应用内置工具使用 `project__toolName` 格式（手动）。

示例：
```
wwise__getProjectInfo
wwise__findObjects
wwise__setProperty
assets__importAudio
assets__listAssets
project__getProjectInfo
project__listRecentProjects
```

**LLM System Prompt 动态适配**

当启用工具分组后，System Prompt 可动态生成，告知 LLM 当前可用的工具分组及其用途：

```typescript
const systemPrompt = (availableGroups: ToolGroupConfig[]): string => {
  const groupList = availableGroups
    .map(g => `- **${g.name}**（${g.id}）: ${g.description}`)
    .join('\n')

  return `你是 UniAudioAgent，一个专业的游戏音频助手。

可用工具分组（按优先级）：
${groupList}

工具调用原则：
1. 该分组内的工具名均为 \`分组id__工具名\` 的格式
2. 优先使用优先级高的分组（Wwise > 资产管理 > 项目）
3. 不要调用不存在的工具
4. 工具返回错误时，向用户解释原因而不是重复尝试

...（其他 prompt 内容）`
}
```

**后续实现路线**

1. **Phase 2A（当前）**：多 MCP Server 负载均衡（已完成）
2. **Phase 2B（后续）**：工具分组架构框架（需实现）
   - 扩展配置文件支持 `toolGroups` 字段
   - 增强 MCP Host 支持分组管理与优先级
   - 实现 `getToolsByPriority()` 动态工具集选择
3. **Phase 2C（可选）**：Context 自适应降级
   - 估算当前 LLM 剩余 context tokens
   - 根据剩余空间自动选择最高优先级的工具组
   - UI 显示当前启用的工具组信息
4. **Phase 3**：RAG 与工具建议
   - 根据知识库内容，智能推荐相关工具分组
   - "啊，你要做 Wwise Event 命名检查，我建议启用 Wwise 工具组"

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
