import { tool } from 'ai'
import { z } from 'zod'
import { waapiService } from '../../services/waapi'

export const setProperty = tool({
  description:
    '修改 Wwise 对象的单个属性值（如 Volume、Pitch、OutputBusVolume 等数值属性）。' +
    '⚠️ 这是写操作，会直接修改 Wwise 项目。在调用此工具前，必须先向用户明确说明将要修改的对象、属性名和新值，并获得用户确认。' +
    '不适用于修改引用类属性（如 Output Bus 指向）。',
  parameters: z.object({
    path: z.string().optional().describe('目标对象的 Wwise 路径。与 id 二选一。'),
    id: z
      .string()
      .uuid()
      .optional()
      .describe('目标对象的 GUID（格式：{xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx}）。与 path 二选一。'),
    property: z
      .string()
      .describe('要修改的属性名称，如 "Volume"、"Pitch"、"OutputBusVolume"'),
    value: z.number().describe('属性的新数值'),
  }),
  execute: async ({ path, id, property, value }) => {
    if (!path && !id) {
      return { error: '必须提供 path 或 id 参数之一' }
    }

    try {
      const object = id ? { id } : { path: path as string }

      const args: Record<string, unknown> = {
        object,
        property,
        value,
      }

      await waapiService.call('ak.wwise.core.object.setProperty', args)

      return {
        success: true,
        message: `已将 "${path ?? id}" 的 ${property} 设置为 ${value}`,
      }
    } catch (err) {
      return { error: `修改属性失败: ${String(err)}` }
    }
  },
})
