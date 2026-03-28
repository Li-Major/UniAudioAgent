# UniAudioAgent 开发路线图

## 阶段一：MVP — 可用原型

**目标**：交付可供真实音频设计师试用的单人工作原型，验证核心价值。

**关键交付**
- [x] 项目骨架：electron-vite + React + TypeScript + Tailwind
- [x] 项目文档（MVP、路线图、开发指引）
- [x] electron-store 配置持久化 + safeStorage 加密
- [x] Vercel AI SDK + OpenRouter / Ollama 流式对话
- [x] 聊天 UI（消息流、工具状态、Markdown 渲染）
- [x] 设置面板（API Key、Ollama URL、模型选择）
- [x] 移除内置 WAAPI / Wwise Tool，转为 MCP 预留宿主

**退出标准**：通过 `docs/MVP.md` 中全部 5 项验收标准。

---

## 阶段二：MCP 架构升级

**目标**：将工具层升级为 MCP 协议标准，实现外部扩展与生态互通。

**核心变化**
- [x] App 主进程成为 MCP Host，通过配置文件（`mcp.config.json`）连接任意外部 MCP Server
- [x] 使用 `@modelcontextprotocol/sdk` 的 `Client` 动态发现并注册工具
- [x] 支持 stdio 传输、工具过滤、命名空间隔离（prefix__toolName）
- [x] MCP 工具调用支持超时保护与错误恢复
- [ ] **工具分组架构**：混合工具源（多MCP + 内置）的智能优先级与context预算管理
- [ ] 内置 Wwise Tools 迁移为独立内部 MCP Server（stdio 传输，App 启动时自动拉起）
- [ ] 将 Wwise MCP Server 作为独立 npm 包发布，可被 Claude Desktop、Cursor 等 MCP 宿主使用

**用户体验**
- 升级对最终用户无感知；高级用户可在配置中接入自定义 MCP Server
- 后续新增 MCP 服务管理面板（添加/删除/启用外部服务、查看注册工具列表）

**已完成交付**
- [x] MCP Host 核心框架（src/main/services/mcp-host.ts）
- [x] App 支持通过 `mcp.config.json` 加载外部 MCP Server
- [x] MCP 工具发现与动态注册机制
- [x] 配置文档与标准格式说明

**待完成交付（优先级从高到低）**
- [ ] **工具分组框架** — 扩展 MCP Host 支持工具分组、优先级与 context 预算
  - 支持 `toolGroups` 配置字段
  - 实现 `toolGroupRegistry` 与分组管理
  - 实现 `getToolsByPriority()` 动态工具集选择
  - System Prompt 动态生成
- [ ] **应用内置工具库** — 定义项目查询、配置等内置工具
  - `src/main/tools/built-in.ts`：project__getInfo, project__listRecent 等
  - 在工具分组中注册为 "project" 组
- [ ] **外部 Wwise MCP Server 包** — 独立仓库 `packages/mcp-server-wwise`
  - 支持 stdio 传输
  - 完整 WAAPI 工具覆盖
  - 可被 Claude Desktop 等宿主使用
- [ ] **MCP 服务管理 UI** — Settings 面板扩展
  - 显示已连接服务列表与状态
  - 显示注册工具分组信息（优先级、context预算、当前启用状态）

---

## 阶段三：RAG 本地知识库

**目标**：嵌入本地向量知识库，让 LLM 理解项目约定、公司规范和 Wwise 文档。

**核心能力**
- LanceDB 本地向量数据库（无服务进程，嵌入式运行）
- 支持导入文档：Markdown / TXT / PDF
- 知识库管理 UI（查看、分块预览、更新、删除）
- 对话中自动检索相关上下文，注入 system prompt 前缀
- 可选：预构建 Wwise 官方文档 embedding 包（随 App 分发）

**使用场景示例**
- 导入公司内部音频命名规范，LLM 依规范审查当前项目
- 导入项目历史决策文档，LLM 理解约定俯首听命
- 导入 Wwise 文档精选章节，提升专业术语准确性

**Embedding 方案（阶段三启动前决定）**
- 方案 A：OpenRouter API embedding — 简单、质量高，需联网
- 方案 B：本地模型（`@xenova/transformers`）— 纯离线，首次加载慢

---

## 阶段四：高级工作流

**目标**：专业级效率工具与 DAW 生态扩展。

**规划功能**
- **Reaper 集成**：通过 ReaScript HTTP API / OSC 接入 DAW 操作
- **批量宏系统**：将多步对话操作序列保存为可复用命名宏
- **多步任务规划**：提升 Agent 自主完成复杂 Wwise 操作序列（嵌套容器搭建、BatchRename 等）
- **资产合规扫描**：批量检查 Event 挂载完整性、命名规范、Attenuation 配置等

---

## 持续改进（贯穿各阶段）

- Wwise MCP Tool 覆盖率扩展（目标：WAAPI 常用端点 100% 覆盖）
- 单元测试：核心服务（LLM service、MCP host、tool registry）
- E2E 测试：关键工作流（查询对象、修改属性、导航层级）
- i18n：界面多语言（中文/英文）
- 离线降级：支持连接本地 Ollama 等本地模型服务
