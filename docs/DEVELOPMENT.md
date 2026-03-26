# UniAudioAgent 开发指引

> 供 AI Agent 和开发者快速上手的参考文档。执行开发任务时以本文档约定为准。

---

## 一、项目定位

面向游戏音频设计师的桌面 AI 工具，通过自然语言操作 Wwise 音频中间件（后续扩展至 Reaper 等 DAW）。

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
| `ws` | ^8.x | Node.js WebSocket（WAAPI WAMP 连接） |
| `electron-store` | ^8.x | 配置持久化 |
| `zod` | ^3.x | Tool 参数 Schema 定义 |
| `react-markdown` + `remark-gfm` | ^9.x/^4.x | 渲染 LLM Markdown 输出 |

**阶段二新增**
- `@modelcontextprotocol/sdk` ^1.x — MCP Host 客户端，动态发现外部工具

**阶段三新增**
- `@lancedb/lancedb` latest — 本地嵌入式向量数据库

> ⚠️ 官方 `waapi-client` npm 包已 8 年未更新（v2017.2.1），本项目使用 `ws` 自行封装轻量 WAMP 客户端，仅实现 `HELLO/WELCOME/CALL/RESULT/ERROR` 消息类型。

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
│   │   │   ├── waapi.ts          # WAAPI WebSocket / WAMP 连接服务
│   │   │   └── llm.ts            # Vercel AI SDK streamText 封装
│   │   ├── tools/
│   │   │   ├── index.ts          # 工具注册表，导出 allTools
│   │   │   └── wwise/            # 各 Wwise tool 实现
│   │   │       ├── getProjectInfo.ts
│   │   │       ├── findObjects.ts
│   │   │       ├── getObject.ts
│   │   │       ├── getChildren.ts
│   │   │       ├── setProperty.ts
│   │   │       └── getSelectedObjects.ts
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
│           │   ├── SettingsPanel.tsx
│           │   └── StatusBar.tsx
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

### 4.2 Tool 定义规范

```typescript
// src/main/tools/wwise/myTool.ts
import { tool } from 'ai'
import { z } from 'zod'
import { waapiService } from '../../services/waapi'

export const myTool = tool({
  // description 决定 LLM 何时调用本工具 — 必须准确描述"功能"与"适用场景"
  description: '...',
  parameters: z.object({
    // 每个参数必须有 .describe() — 帮助 LLM 准确填写参数
    name: z.string().describe('要查找的对象名称'),
  }),
  execute: async ({ name }) => {
    try {
      const result = await waapiService.call('ak.wwise.core...', { ... })
      return result
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

### 4.3 WAAPI 服务（`waapiService`）

单例，管理 WAMP over WebSocket 连接：
- `waapiService.connect()` — 启动连接（自动重连）
- `waapiService.disconnect()` — 关闭连接
- `waapiService.call(uri, args)` — 调用 WAAPI 端点，返回 `Promise<unknown>`
- `waapiService.setUrl(url)` — 切换连接地址
- `waapiService.setStatusCallback(cb)` — 注册状态变化回调

WAMP 消息类型（仅实现必要子集）：
```
HELLO    [1, realm, {roles:{caller:{}}}]
WELCOME  [2, sessionId, details]
ABORT    [3, details, reason]
CALL     [48, requestId, {}, uri, [args]]
RESULT   [50, requestId, details, [result]]
ERROR    [8, 48, requestId, details, uri, [args]]
```

### 4.4 LLM 流式调用

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
- **SSRF 防护**：WAAPI 连接地址在服务层强制限制为本地地址（`127.0.0.1` / `localhost`），拒绝外部 URL
- **Tool 错误处理**：`execute` 函数内必须 `try/catch`，捕获后返回 `{ error: string }`，不允许向外抛出
- **Tool 返回数据量**：查询类 Tool 默认限制返回 `count: 50`，避免超出 LLM context 窗口

---

## 六、新增 Wwise Tool 步骤

1. 在 `src/main/tools/wwise/` 下创建新文件
2. 用 `tool()` + `zod` 定义并导出（参考 4.2 规范）
3. 在 `src/main/tools/index.ts` 中导入并加入 `allTools`
4. 在 `docs/MVP.md` Tool 列表中补充条目

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

- [Wwise WAAPI 官方文档](https://www.audiokinetic.com/en/library/edge/?source=SDK&id=waapi.html)
- [WAMP 协议规范](https://wamp-proto.org/spec.html)
- [Vercel AI SDK 文档](https://sdk.vercel.ai/docs)
- [OpenRouter 模型列表](https://openrouter.ai/models)
- [MCP 协议规范](https://modelcontextprotocol.io)
- [electron-vite 文档](https://electron-vite.org)
