import { tool } from 'ai'
import { z } from 'zod'
import { waapiService } from '../../services/waapi'

export const getProjectInfo = tool({
  description:
    '获取当前在 Wwise 中打开的项目的基本信息，包括项目名称、Wwise 版本和项目文件路径。' +
    '适用于用户询问"当前项目是什么"或"连接的 Wwise 版本是多少"等问题。',
  parameters: z.object({}),
  execute: async () => {
    try {
      const result = await waapiService.call('ak.wwise.core.getInfo', {})
      return result
    } catch (err) {
      return { error: `获取项目信息失败: ${String(err)}` }
    }
  },
})
