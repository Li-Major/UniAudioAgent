import { tool } from 'ai'
import { z } from 'zod'
import { waapiService } from '../../services/waapi'

export const getSelectedObjects = tool({
  description:
    '获取用户当前在 Wwise GUI 应用程序中选中的对象列表。' +
    '适用于"分析我选中的这些 Sound"、"修改当前选中对象的音量"等场景。' +
    '需要 Wwise 处于打开状态；如果 Wwise 最小化或未获得焦点，仍可获取选中状态。',
  parameters: z.object({}),
  execute: async () => {
    try {
      const result = (await waapiService.call('ak.wwise.ui.getSelectedObjects', {
        options: {
          return: ['id', 'name', 'type', 'path', 'parent.name'],
        },
      })) as { objects?: unknown[] }

      const objects = result?.objects ?? []
      return {
        count: Array.isArray(objects) ? objects.length : 0,
        objects,
      }
    } catch (err) {
      return { error: `获取选中对象失败: ${String(err)}` }
    }
  },
})
