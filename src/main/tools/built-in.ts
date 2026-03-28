import { execFile } from 'node:child_process'
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { tool } from 'ai'
import { z } from 'zod'
import { logLlmDebug } from '../services/debug-log'

const execFileAsync = promisify(execFile)

async function runBuiltinTool<TInput, TResult>(
  toolName: string,
  input: TInput,
  runner: () => Promise<TResult>,
): Promise<TResult | { error: string }> {
  const startedAt = Date.now()
  logLlmDebug('tool-exec-start', {
    source: 'builtin',
    toolName,
    input,
  })

  try {
    const result = await runner()
    logLlmDebug('tool-exec-result', {
      source: 'builtin',
      toolName,
      durationMs: Date.now() - startedAt,
      result,
    })
    return result
  } catch (err) {
    const error = String(err)
    logLlmDebug('tool-exec-error', {
      source: 'builtin',
      toolName,
      durationMs: Date.now() - startedAt,
      error,
    })
    return { error }
  }
}

// ── read_file ──────────────────────────────────────────────────────────────

const readFileTool = tool({
  description: '读取指定路径文件的文本内容。适用于查看配置文件、源代码、日志等文本文件。',
  parameters: z.object({
    path: z.string().describe('文件的绝对路径'),
    encoding: z
      .enum(['utf-8', 'ascii', 'latin1'])
      .optional()
      .default('utf-8')
      .describe('文件编码，默认 utf-8'),
  }),
  execute: async ({ path, encoding }) => {
    return runBuiltinTool('read_file', { path, encoding }, async () => {
      const content = await readFile(resolve(path), encoding ?? 'utf-8')
      return { path, content }
    })
  },
})

// ── write_file ─────────────────────────────────────────────────────────────

const writeFileTool = tool({
  description: '将文本内容写入指定路径的文件。如果目标目录不存在，会自动创建。会覆盖已有文件。',
  parameters: z.object({
    path: z.string().describe('文件的绝对路径'),
    content: z.string().describe('要写入的文本内容'),
    encoding: z
      .enum(['utf-8', 'ascii', 'latin1'])
      .optional()
      .default('utf-8')
      .describe('文件编码，默认 utf-8'),
  }),
  execute: async ({ path, content, encoding }) => {
    return runBuiltinTool('write_file', { path, content, encoding }, async () => {
      const absPath = resolve(path)
      await mkdir(dirname(absPath), { recursive: true })
      await writeFile(absPath, content, encoding ?? 'utf-8')
      return { path: absPath, bytesWritten: Buffer.byteLength(content, encoding ?? 'utf-8') }
    })
  },
})

// ── list_directory ─────────────────────────────────────────────────────────

const listDirectoryTool = tool({
  description: '列出指定目录下的文件和子目录名称。返回列表包含每个条目的名称和类型（file/directory）。',
  parameters: z.object({
    path: z.string().describe('目录的绝对路径'),
  }),
  execute: async ({ path }) => {
    return runBuiltinTool('list_directory', { path }, async () => {
      const absPath = resolve(path)
      const entries = await readdir(absPath, { withFileTypes: true })
      const items = entries.map((e) => ({
        name: e.name,
        type: e.isDirectory() ? 'directory' : 'file',
      }))
      return { path: absPath, items }
    })
  },
})

// ── get_directory_tree ─────────────────────────────────────────────────────

interface TreeNode {
  name: string
  type: 'file' | 'directory'
  children?: TreeNode[]
}

async function buildTree(absPath: string, maxDepth: number, currentDepth: number): Promise<TreeNode[]> {
  if (currentDepth > maxDepth) return []

  const entries = await readdir(absPath, { withFileTypes: true })
  const nodes: TreeNode[] = []

  for (const entry of entries) {
    if (entry.isDirectory()) {
      const children = await buildTree(join(absPath, entry.name), maxDepth, currentDepth + 1)
      nodes.push({ name: entry.name, type: 'directory', children })
    } else {
      nodes.push({ name: entry.name, type: 'file' })
    }
  }

  return nodes
}

const getDirectoryTreeTool = tool({
  description: '递归获取指定目录的树形结构，返回嵌套 JSON。可通过 maxDepth 控制递归深度（默认 3 层）。',
  parameters: z.object({
    path: z.string().describe('目录的绝对路径'),
    maxDepth: z.number().int().min(1).max(10).optional().default(3).describe('最大递归深度，默认 3'),
  }),
  execute: async ({ path, maxDepth }) => {
    return runBuiltinTool('get_directory_tree', { path, maxDepth }, async () => {
      const absPath = resolve(path)
      const tree = await buildTree(absPath, maxDepth ?? 3, 1)
      return { path: absPath, tree }
    })
  },
})

// ── search_files ───────────────────────────────────────────────────────────

async function walkFiles(dir: string, results: string[], pattern: RegExp | null, maxResults: number): Promise<void> {
  if (results.length >= maxResults) return

  let entries
  try {
    entries = await readdir(dir, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (results.length >= maxResults) break

    const fullPath = join(dir, entry.name)

    if (entry.isDirectory()) {
      await walkFiles(fullPath, results, pattern, maxResults)
    } else if (pattern === null || pattern.test(entry.name)) {
      results.push(fullPath)
    }
  }
}

async function searchByContent(dir: string, query: string, maxResults: number): Promise<string[]> {
  const allFiles: string[] = []
  await walkFiles(dir, allFiles, null, 5000)

  const matches: string[] = []
  for (const filePath of allFiles) {
    if (matches.length >= maxResults) break
    try {
      const content = await readFile(filePath, 'utf-8')
      if (content.includes(query)) {
        matches.push(filePath)
      }
    } catch {
      // Skip binary/unreadable files
    }
  }

  return matches
}

const searchFilesTool = tool({
  description:
    '在指定目录中搜索文件。支持两种模式：按文件名（glob 风格通配符）搜索，或按文件内容关键词搜索。',
  parameters: z.object({
    directory: z.string().describe('搜索的根目录（绝对路径）'),
    namePattern: z
      .string()
      .optional()
      .describe('文件名匹配模式，支持 * 通配符（如 "*.ts"、"*.json"）'),
    contentQuery: z
      .string()
      .optional()
      .describe('在文件内容中搜索的关键词（与 namePattern 至少填一项）'),
    maxResults: z.number().int().min(1).max(500).optional().default(50).describe('最多返回结果数，默认 50'),
  }),
  execute: async ({ directory, namePattern, contentQuery, maxResults }) => {
    return runBuiltinTool(
      'search_files',
      { directory, namePattern, contentQuery, maxResults },
      async () => {
        const absDir = resolve(directory)
        const limit = maxResults ?? 50

        if (contentQuery) {
          const matches = await searchByContent(absDir, contentQuery, limit)
          return { directory: absDir, matches, searchType: 'content', query: contentQuery }
        }

        if (namePattern) {
          // Convert simple glob (only * wildcard) to RegExp
          const regexStr = namePattern
            .replace(/[.+^${}()|[\]\\]/g, '\\$&') // escape special chars
            .replace(/\*/g, '.*') // * → .*
          const pattern = new RegExp(`^${regexStr}$`, 'i')
          const matches: string[] = []
          await walkFiles(absDir, matches, pattern, limit)
          return { directory: absDir, matches, searchType: 'name', pattern: namePattern }
        }

        return { directory: absDir, matches: [], error: '请提供 namePattern 或 contentQuery 参数' }
      },
    )
  },
})

// ── exec_command ───────────────────────────────────────────────────────────

const execCommandTool = tool({
  description:
    '执行 Shell 命令并返回 stdout 和 stderr。使用 execFile（非 shell 字符串拼接），需将命令和参数分开传入，以降低命令注入风险。超时默认 30 秒。',
  parameters: z.object({
    command: z.string().describe('可执行文件路径或命令名（如 "node"、"python"、"git"）'),
    args: z.array(z.string()).optional().default([]).describe('命令参数数组（如 ["--version"]）'),
    cwd: z.string().optional().describe('工作目录（绝对路径），不填则使用当前进程目录'),
    timeoutMs: z.number().int().min(1000).max(300000).optional().default(30000).describe('超时毫秒数，默认 30000'),
  }),
  execute: async ({ command, args, cwd, timeoutMs }) => {
    return runBuiltinTool('exec_command', { command, args, cwd, timeoutMs }, async () => {
      const options = {
        cwd: cwd ? resolve(cwd) : undefined,
        timeout: timeoutMs ?? 30000,
        maxBuffer: 1024 * 1024 * 10, // 10 MB
      }

      try {
        const { stdout, stderr } = await execFileAsync(command, args ?? [], options)
        return { exitCode: 0, stdout, stderr }
      } catch (err) {
        const e = err as NodeJS.ErrnoException & { code?: number; stdout?: string; stderr?: string }
        return {
          exitCode: typeof e.code === 'number' ? e.code : 1,
          stdout: e.stdout ?? '',
          stderr: e.stderr ?? String(err),
        }
      }
    })
  },
})

// ── Export ─────────────────────────────────────────────────────────────────

export const builtinTools = {
  read_file: readFileTool,
  write_file: writeFileTool,
  list_directory: listDirectoryTool,
  get_directory_tree: getDirectoryTreeTool,
  search_files: searchFilesTool,
  exec_command: execCommandTool,
}
