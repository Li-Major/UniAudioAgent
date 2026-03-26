import { tool } from 'ai'
import { z } from 'zod'
import { waapiService } from '../../services/waapi'

const WWISE_OBJECT_TYPES = [
  'Sound',
  'Event',
  'Bus',
  'AuxBus',
  'AudioFileSource',
  'WorkUnit',
  'Folder',
  'SoundBank',
  'Actor-Mixer',
  'BlendContainer',
  'RandomSequenceContainer',
  'SwitchContainer',
  'SequenceContainer',
  'Switch',
  'State',
  'GameParameter',
  'Trigger',
  'Effect',
  'Attenuation',
] as const

export const findObjects = tool({
  description:
    '在 Wwise 项目中搜索音频对象。可按对象类型和/或名称关键词过滤。' +
    '适用于"找出所有 Sound SFX"、"搜索名称包含 Footstep 的 Event"等场景。' +
    '默认返回最多 50 条结果；结果过多时请提示用户缩小搜索范围。',
  parameters: z.object({
    nameContains: z
      .string()
      .optional()
      .describe('名称中包含的关键词（不区分大小写）。省略则不按名称过滤。'),
    type: z
      .enum(WWISE_OBJECT_TYPES)
      .optional()
      .describe('限定搜索的对象类型。省略则搜索所有常见类型。'),
    maxResults: z
      .number()
      .int()
      .min(1)
      .max(100)
      .default(50)
      .describe('最大返回数量（1-100，默认 50）'),
  }),
  execute: async ({ nameContains, type, maxResults }) => {
    try {
      const searchTypes: string[] = type
        ? [type]
        : ['Sound', 'Event', 'Bus', 'AuxBus', 'AudioFileSource']

      const args: Record<string, unknown> = {
        from: { ofType: searchTypes },
        options: {
          return: ['id', 'name', 'type', 'path', 'parent.name'],
          count: maxResults,
        },
      }

      if (nameContains) {
        args.where = ['name', 'contains', nameContains]
      }

      const result = (await waapiService.call('ak.wwise.core.object.find', args)) as {
        return?: unknown[]
      }

      const items = result?.return ?? []
      return {
        count: Array.isArray(items) ? items.length : 0,
        items,
      }
    } catch (err) {
      return { error: `搜索对象失败: ${String(err)}` }
    }
  },
})
