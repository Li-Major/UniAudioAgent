import { tool } from 'ai'
import { z } from 'zod'
import { waapiService } from '../../services/waapi'

export const getObject = tool({
  description:
    '按对象路径或 ID 获取 Wwise 中单个对象的详细属性信息，包括名称、类型、父对象及常用属性值。' +
    '适用于"查看这个 Sound 的 Volume 值"、"获取 Bus:Master Audio Bus 的详细设置"等场景。' +
    '路径格式示例：\\Actor-Mixer Hierarchy\\Default Work Unit\\MySound',
  parameters: z.object({
    path: z.string().optional().describe('对象的 Wwise 路径，以 \\ 分隔。与 id 二选一。'),
    id: z
      .string()
      .uuid()
      .optional()
      .describe('对象的 GUID（格式：{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}）。与 path 二选一。'),
    properties: z
      .array(z.string())
      .optional()
      .describe(
        '额外返回的属性名称列表，如 ["Volume", "Pitch", "OutputBus"]。省略则返回基础信息。',
      ),
  }),
  execute: async ({ path, id, properties }) => {
    if (!path && !id) {
      return { error: '必须提供 path 或 id 参数之一' }
    }

    try {
      const baseReturn = ['id', 'name', 'type', 'path', 'parent.name', 'parent.path']
      const extraReturn = properties ?? []
      const returnFields = [...new Set([...baseReturn, ...extraReturn])]

      const from = id ? { id: [id] } : { path: [path as string] }

      const args: Record<string, unknown> = {
        from,
        options: { return: returnFields },
      }

      const result = (await waapiService.call('ak.wwise.core.object.get', args)) as {
        return?: unknown[]
      }

      const items = result?.return ?? []
      if (!Array.isArray(items) || items.length === 0) {
        return { error: `未找到对象: ${path ?? id}` }
      }
      return items[0]
    } catch (err) {
      return { error: `获取对象失败: ${String(err)}` }
    }
  },
})
