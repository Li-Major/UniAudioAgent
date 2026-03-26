# UniAudioAgent MVP 规划

## 产品概述

UniAudioAgent 是面向游戏音频设计师的桌面 AI 工具。通过自然语言与 Wwise 音频中间件交互，减少手动操作，提升音频工程效率。未来规划扩展至 Reaper 等 DAW。

## MVP 目标

验证核心假设：**音频设计师能否通过自然语言对话，有效查询和操作 Wwise 项目，节省可观的手动重复工作时间。**

---

## 功能范围

### ✅ 包含（Must Have）

**1. 聊天界面**
- Electron 桌面客户端（Windows / macOS）
- 流式输出（streaming）对话，实时显示 token
- 多轮对话历史保留（单 session 内）
- Markdown 渲染（代码块、列表、表格）
- 工具调用状态内联显示（"Searching Wwise..."）

**2. LLM 接入**
- 通过 OpenRouter API 调用任意模型
- 支持从下拉列表切换模型
- API Key 本地 `safeStorage` 加密存储
- 流式响应，支持 tool-calling 多轮（最多 10 轮）

**3. Wwise 连接**
- 通过 WAAPI WebSocket 连接本地 Wwise（默认 `ws://127.0.0.1:8080/waapi`）
- 连接状态实时显示（底部状态栏）
- 断线自动重连（指数退避，上限 30s）

**4. 内置 Wwise Tools**

| Tool | WAAPI 端点 | 说明 |
|---|---|---|
| `getProjectInfo` | `ak.wwise.core.getInfo` | 获取项目名称、版本、路径 |
| `findObjects` | `ak.wwise.core.object.find` | 按类型和名称关键词搜索对象 |
| `getObject` | `ak.wwise.core.object.get` | 按路径或 ID 获取单个对象属性 |
| `getChildren` | `ak.wwise.core.object.get` | 获取指定对象的子对象列表 |
| `setProperty` | `ak.wwise.core.object.setProperty` | 修改对象的单个数值属性 |
| `getSelectedObjects` | `ak.wwise.ui.getSelectedObjects` | 获取 Wwise GUI 当前选中的对象 |

**5. 设置面板**
- OpenRouter API Key 配置（输入框，显示为掩码）
- Wwise 连接地址配置
- 默认模型选择

### ❌ 不包含（Out of Scope for MVP）

- RAG / 本地知识库
- MCP 对外暴露（工具全部内置，阶段二升级）
- Reaper / 其他 DAW 集成
- 多 session 管理 / 历史持久化
- 批量宏录制
- 云同步

---

## 成功指标（MVP 验收标准）

1. **查询**：通过自然语言查询项目中指定类型的全部对象（如"列出所有 Sound SFX"）
2. **修改**：通过对话修改单个对象属性（如 Volume、Pitch），操作反映在 Wwise 中
3. **导航**：通过自然语言获取任意对象的层级结构
4. **响应速度**：端到端首次 token 到达时间 < 3 秒（网络正常条件下）
5. **启动速度**：应用冷启动到可交互状态 < 5 秒

---

## 技术栈概览

| 层 | 选型 |
|---|---|
| 桌面框架 | Electron |
| 构建工具 | electron-vite + Vite |
| UI 框架 | React 18 + TypeScript |
| 样式 | Tailwind CSS |
| LLM 调用 | Vercel AI SDK（`ai` 包） |
| LLM 路由 | OpenRouter（`@openrouter/ai-sdk-provider`） |
| WAAPI 连接 | 原生 WAMP/WebSocket（`ws` 包，自行封装） |
| 配置持久化 | electron-store + safeStorage 加密 |
| Schema 验证 | Zod（Tool 参数定义） |
