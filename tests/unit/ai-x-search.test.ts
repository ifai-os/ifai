import { MockEmbeddingModelV4, MockLanguageModelV4 } from 'ai/test'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { createAi, type XSearchDates } from '@/lib/ai/client'
import { MissingXaiKeyError } from '@/lib/ai/errors'
import { createMemoryReceiptStore } from '@/lib/ai/memory-store'
import { modelFor } from '@/lib/ai/purposes'

const usage = {
  inputTokens: { total: 300, noCache: 300, cacheRead: undefined, cacheWrite: undefined },
  outputTokens: { total: 40, text: 40, reasoning: undefined },
}

const schema = z.object({ posts: z.array(z.object({ url: z.string(), likes: z.number() })) })

const call = {
  purpose: 'reach' as const,
  instructions: 'Search X.',
  prompt: 'A story.',
  schema,
  fromDate: '2026-10-26',
  toDate: '2026-10-27',
}

function setup(withKey = true) {
  const models: string[] = []
  const dates: XSearchDates[] = []
  const tools: string[][] = []
  const ai = createAi({
    store: createMemoryReceiptStore(),
    env: { MODEL_CALLS_ENABLED: 'true' },
    languageModel: () => {
      throw new Error('OpenRouter is not used for X search')
    },
    embeddingModel: () => new MockEmbeddingModelV4(),
    xSearchModel: withKey
      ? (model, range) => {
          models.push(model)
          dates.push(range)
          return {
            model: new MockLanguageModelV4({
              doGenerate: async (options) => {
                tools.push((options.tools ?? []).map((tool) => tool.name))
                return {
                  content: [
                    { type: 'text', text: JSON.stringify({ posts: [{ url: 'https://x.com/a/status/1', likes: 120 }] }) },
                    { type: 'source', sourceType: 'url', id: 's1', url: 'https://x.com/a/status/1' },
                    { type: 'source', sourceType: 'url', id: 's2', url: 'https://x.com/a/status/1' },
                  ],
                  finishReason: { unified: 'stop', raw: undefined },
                  usage,
                  providerMetadata: { xai: { costInUsdTicks: 250_000_000 } },
                  warnings: [],
                }
              },
            }),
            tools: { x_search: { type: 'provider', id: 'xai.x_search', args: range, inputSchema: z.object({}) } as never },
          }
        }
      : undefined,
  })
  return { ai, models, dates, tools }
}

describe('ai.xSearch', () => {
  it('searches X through the xAI model for the purpose, with the dates, and keeps the cited links', async () => {
    const { ai, models, dates, tools } = setup()
    const result = await ai.xSearch(call)
    expect(models).toEqual([modelFor('reach', {})])
    expect(dates).toEqual([{ fromDate: '2026-10-26', toDate: '2026-10-27' }])
    expect(tools).toEqual([['x_search']])
    expect(result.output).toEqual({ answer: { posts: [{ url: 'https://x.com/a/status/1', likes: 120 }] }, sources: ['https://x.com/a/status/1'] })
    // xAI's cost in ticks (10^10 to the dollar) counts toward the daily budget.
    expect((await ai.usageToday()).costUsd).toBeCloseTo(0.025)
  })

  it('reuses the receipt for the same search', async () => {
    const { ai, models } = setup()
    await ai.xSearch(call)
    const again = await ai.xSearch(call)
    expect(again.reused).toBe(true)
    expect(models).toHaveLength(1)
  })

  it('refuses without XAI_API_KEY', async () => {
    const { ai } = setup(false)
    await expect(ai.xSearch(call)).rejects.toBeInstanceOf(MissingXaiKeyError)
  })
})
