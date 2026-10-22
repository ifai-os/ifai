import { createOpenRouter } from '@openrouter/ai-sdk-provider'

import { siteUrl } from '@/lib/site-url'

import { createAi, type Ai } from './client'
import { MissingApiKeyError } from './errors'
import { postgresReceiptStore } from './store'

export * from './errors'
export { DEFAULT_DAILY_BUDGET_USD, type AiResult, type UsageToday } from './client'
export { EMBEDDING_DIMENSIONS, purposes, type Purpose } from './purposes'
export { untrusted } from './untrusted'

let provider: ReturnType<typeof createOpenRouter> | undefined
let instance: Ai | undefined

function openRouter() {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new MissingApiKeyError()
  // appName / appUrl label the calls on openrouter.ai/activity.
  provider ??= createOpenRouter({ apiKey, appName: 'IFAI', appUrl: siteUrl() })
  return provider
}

/**
 * Model calls for background jobs: `ai.object({ purpose, instructions, prompt, schema })`,
 * `ai.text(...)`, `ai.embed(...)`, `ai.usageToday()`. Pages never call models.
 */
export const ai: Ai = {
  text: (call) => client().text(call),
  object: (call) => client().object(call),
  embed: (call) => client().embed(call),
  usageToday: () => client().usageToday(),
}

function client(): Ai {
  instance ??= createAi({
    store: postgresReceiptStore,
    // `usage.include` makes OpenRouter report the cost of each call, which feeds the budget.
    languageModel: (model) => openRouter().chat(model, { usage: { include: true } }),
    embeddingModel: (model) => openRouter().textEmbeddingModel(model),
  })
  return instance
}
