# UniAudioAgent

UniAudioAgent is a desktop AI assistant for game audio designers.
Wwise WAAPI support is built-in, with plans to gradually add support for other audio-related software and provide flexible extensibility in the future.

## Vision

- Make game audio workflows conversational and executable.
- Use MCP as the long-term extension layer for Wwise, DAW, and studio-specific integrations.
- Support both fast local workflows (Ollama) and cloud models (OpenRouter).

## What It Does Today

- Multi-session chat UI with persistent conversation history.
- Streaming chat with OpenRouter and Ollama.
- Built-in local tools for file and command workflows.
- MCP host that can load external MCP servers from mcp.config.json.
- Built-in Wwise MCP integration via wwise-waapi-mcp dependency.
- Encrypted settings storage with electron-store + OS safeStorage.

## Architecture

- Main process
  - LLM calls
  - Tool execution
  - MCP host and server process management
  - Encrypted persistence
- Renderer process
  - React UI (chat, sessions, settings)
  - IPC-driven updates
- Preload bridge
  - Safe IPC API exposure under context isolation

## Quick Start

### Requirements

- Node.js 18+
- npm
- Windows/macOS/Linux (Windows is primary tested environment)
- Optional: Ollama running locally for local model usage

### Install

    npm install

### Development

    npm run dev

### Type Check

    npm run typecheck

### Build

    npm run build

### Package (Installer)

    npm run distribute

## LLM Providers

### OpenRouter

- Set API key in Settings panel.
- Choose any OpenRouter-compatible model.

### Ollama

- Start local Ollama service.
- Configure Ollama Base URL (default: http://127.0.0.1:11434/api).
- Choose a local model in Settings.

## Built-in Tools

These tools are always available to the assistant:

- read_file: Read local text files.
- write_file: Write/create local text files.
- list_directory: List files/folders in a directory.
- get_directory_tree: Recursive directory tree.
- search_files: Search by filename pattern or content.
- exec_command: Execute command-line programs safely with argument arrays.

## MCP Integration

## External MCP servers

Configure additional servers in mcp.config.json:

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

## Built-in Wwise MCP server

When wwise-waapi-mcp is installed, UniAudioAgent auto-injects a built-in MCP server:

- Server id: wwise-waapi
- Transport: stdio
- Default toolPrefix: wwise
- Default timeout: 45000 ms

Override or disable in mcp.config.json using the same id:

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

Or disable globally by environment variable:

    UNIAUDIO_DISABLE_BUILTIN_WWISE_MCP=1

## Debugging

Enable LLM debug logs:

PowerShell:

    $env:UNIAUDIO_DEBUG='llm'; npm run dev

cmd:

    set UNIAUDIO_DEBUG=llm && npm run dev

Log output is mirrored in UTF-8 file:

- App logs path: llm-debug.log under Electron logs directory

## Security Notes

- API keys are stored encrypted using OS facilities.
- Renderer is isolated; privileged operations stay in main process.
- Tool execution uses validated schemas and explicit argument handling.

## Packaging Notes

- Packaging uses electron-builder.
- Runtime MCP subprocesses use stdio transport.
- Ensure external dependencies (such as Wwise environment) are available on the target machine.

## Documentation

- Chinese development guide: [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)
- Product roadmap: [docs/ROADMAP.md](docs/ROADMAP.md)
- MVP scope: [docs/MVP.md](docs/MVP.md)
- Chat persistence details: [docs/CHAT_PERSISTENCE.md](docs/CHAT_PERSISTENCE.md)

## License

MIT
