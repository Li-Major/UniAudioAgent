# UniAudioAgent

UniAudioAgent 是一款面向游戏音频设计师的桌面 AI 助手。
内置了 Wwise WAAPI 支持，计划在未来逐步接入其他音频相关软件的支持，并提供灵活的扩展能力。

## 项目愿景

- 让游戏音频工作流可以通过自然语言直接执行。
- 以 MCP 作为长期扩展标准，连接 Wwise、DAW 和其他团队私有系统。
- 同时支持本地模型（Ollama）与云端模型（OpenRouter）的接入能力。

## 当前能力

- 多会话聊天界面，聊天记录持久化保存。
- OpenRouter 与 Ollama 流式对话。
- 文件与命令类内置工具。
- MCP Host 动态加载外部 MCP 服务（mcp.config.json）。
- 已接入 wwise-waapi-mcp 作为内置 MCP 服务。
- 使用 electron-store + safeStorage 进行加密配置存储。

## 架构概览

- 主进程
  - LLM 调用
  - 工具执行
  - MCP Host 与子进程管理
  - 加密存储
- 渲染进程
  - React UI（聊天、会话、设置）
  - IPC 事件驱动更新
- 预加载桥接
  - 在 context isolation 下暴露受控 API

## 快速开始

### 环境要求

- Node.js 18+
- npm
- Windows/macOS/Linux（当前以 Windows 为主验证）
- 可选：本地 Ollama 服务

### 安装依赖

    npm install

### 开发模式

    npm run dev

### 类型检查

    npm run typecheck

### 构建

    npm run build

### 打包安装包

    npm run distribute

## 模型提供方

### OpenRouter

- 在设置面板填写 API Key。
- 选择可用模型。

### Ollama

- 先启动本地 Ollama 服务。
- 设置 Ollama Base URL（默认 http://127.0.0.1:11434/api）。
- 在设置中选择本地模型。

## 内置工具

以下工具默认常驻可用：

- read_file：读取本地文本文件。
- write_file：写入或创建文本文件。
- list_directory：列出目录内容。
- get_directory_tree：递归目录树。
- search_files：按文件名或内容搜索。
- exec_command：以参数数组方式安全执行命令。

## MCP 集成

### 外部 MCP 服务

可通过 mcp.config.json 配置外部服务：

    {
      "version": 1,
      "servers": [
        {
          "id": "my-server",
          "enabled": true,
          "transport": "stdio",
          "command": "node",
          "args": ["./path/to/server.js"],
          "toolPrefix": "my",
          "timeoutMs": 30000
        }
      ]
    }

### 内置 Wwise MCP 服务

安装 wwise-waapi-mcp 后，应用会自动注入内置 MCP 服务：

- 服务 id：wwise-waapi
- 传输方式：stdio
- 默认工具前缀：wwise
- 默认超时：45000 ms

可在 mcp.config.json 中使用同 id 覆盖或禁用：

    {
      "version": 1,
      "servers": [
        {
          "id": "wwise-waapi",
          "enabled": false,
          "transport": "stdio",
          "command": "node",
          "args": ["./node_modules/wwise-waapi-mcp/dist/src/index.js"]
        }
      ]
    }

也可以通过环境变量全局禁用：

    UNIAUDIO_DISABLE_BUILTIN_WWISE_MCP=1

## 调试

开启 LLM 调试日志：

PowerShell：

    $env:UNIAUDIO_DEBUG='llm'; npm run dev

cmd：

    set UNIAUDIO_DEBUG=llm && npm run dev

日志会同步写入 UTF-8 文件：

- Electron 日志目录下的 llm-debug.log

## 安全说明

- API Key 使用系统能力加密存储。
- 渲染进程隔离，敏感操作在主进程执行。
- 工具参数经过 schema 校验后再执行。

## 打包说明

- 使用 electron-builder 打包。
- MCP 服务通过 stdio 子进程方式运行。
- 发布到目标机器时请确保外部依赖可用（例如 Wwise 运行环境）。

## 相关文档

- 开发文档（中文）：[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
- 路线图：[docs/ROADMAP.md](docs/ROADMAP.md)
- MVP 定义：[docs/MVP.md](docs/MVP.md)
- 聊天持久化说明：[docs/CHAT_PERSISTENCE.md](docs/CHAT_PERSISTENCE.md)

## 许可证

MIT
