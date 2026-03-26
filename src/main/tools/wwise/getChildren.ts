import { tool } from 'ai'
import { z } from 'zod'
import { waapiService } from '../../services/waapi'

export const getChildren = tool({
  description:
    '获取 Wwise 中指定对象的直接子对象列表。' +
    '适用于"列出 Actor-Mixer Hierarchy 的顶层对象"、"查看这个容器下有哪些 Sound"等场景。' +
    '只返回直接子级，不递归深层结构。',
  parameters: z.object({
    path: z.string().optional().describe('父对象的 Wwise 路径。与 id 二选一。'),
    id: z
      .string()
      .uuid()
      .optional()
      .describe('父对象的 GUID（格式：{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}）。与 path 二选一。'),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(200)
      .default(50)
      .describe('最大返回子对象数（默认 50，上限 200）'),
  }),
  execute: async ({ path, id, maxResults }) => {
    if (!path && !id) {
      return { error: '必须提供 path 或 id 参数之一' }
    }

    try {
      const from = id ? { id: [id] } : { path: [path as string] }

      const args: Record<string, unknown> = {
        from,
        transform: [['select', ['children']]],
        options: {
          return: ['id', 'name', 'type', 'path'],
          count: maxResults,
        },
      }

      const result = (await waapiService.call('ak.wwise.core.object.get', args)) as {
        return?: unknown[]
      }

      const items = result?.return ?? []
      return {
        parentPath: path ?? id,
        count: Array.isArray(items) ? items.length : 0,
        children: items,
      }
    } catch (err) {
      return { error: `获取子对象失败: ${String(err)}` }
    }
  },
})
