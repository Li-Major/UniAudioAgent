# UniAudioAgent MVP 规划

## 产品概述

UniAudioAgent 是面向游戏音频设计师的桌面 AI 工具。通过自然语言与 Wwise 音频中间件交互，减少手动操作，提升音频工程效率。未来规划扩展至 Reaper 等 DAW。

## MVP 目标

验证核心假设：**音频设计师能否先接受一个稳定的桌面 AI 宿主，再通过后续 MCP 工具扩展接入 Wwise 工作流。**

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
- 支持本地 Ollama Provider
- 支持从下拉列表切换模型
- API Key 本地 `safeStorage` 加密存储
- 流式响应，支持 tool-calling 多轮（最多 10 轮）

**3. MCP 预留接入**
- 当前应用不再直接连接 WAAPI，也不内置 Wwise Tools
- 后续通过 MCP Host 接入外部 Wwise MCP Server
- 当前阶段保留聊天与模型配置能力，为 MCP 集成做宿主准备

**4. 设置面板**
- OpenRouter API Key 配置（输入框，显示为掩码）
- Ollama Base URL 配置
- 默认模型选择
- Provider 切换（OpenRouter / Ollama）

### ❌ 不包含（Out of Scope for MVP）

- RAG / 本地知识库
- MCP 对外暴露（工具全部内置，阶段二升级）
- Reaper / 其他 DAW 集成
- 多 session 管理 / 历史持久化
- 批量宏录制
- 云同步

---

## 成功指标（MVP 验收标准）

1. **对话**：流式对话稳定可用，支持多轮上下文
2. **模型切换**：可在 OpenRouter 与 Ollama 之间切换并成功返回响应
3. **配置持久化**：API Key、Provider、模型和 Ollama 地址重启后保持
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
| 配置持久化 | electron-store + safeStorage 加密 |
| Schema 验证 | Zod（Tool 参数定义） |
