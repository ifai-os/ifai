import { createOpenRouter } from '@openrouter/ai-sdk-provider'

import { siteUrl } from '@/lib/site-url'

import { createAi, type Ai } from './client'
import { MissingApiKeyError } from './errors'
import type { ReceiptStore } from './receipts'
import { postgresReceiptStore } from './store'

export * from './errors'
export { DEFAULT_DAILY_BUDGET_USD, type AiResult, type ContestImage, type ContestImageOutput, type ContestOutput, type UsageToday } from './client'
export { contestPurposes, EMBEDDING_DIMENSIONS, modelFor, purposes, type ContestPurpose, type Purpose } from './purposes'
export { untrusted } from './untrusted'

let provider: ReturnType<typeof createOpenRouter> | undefined
let instance: Ai | undefined

function openRouter() {
  const apiKey = process.env.OPENROUTER_API_KEY
  if (!apiKey) throw new MissingApiKeyError()
  // appName / appUrl label the calls on openrouter.ai/activity. OPENROUTER_BASE_URL points the
  // same client at any OpenAI-compatible server instead (local testing only; it reports no cost).
  const baseURL = process.env.OPENROUTER_BASE_URL?.trim().replace(/\/+$/, '') || undefined
  provider ??= createOpenRouter({ apiKey, appName: 'IFAI', appUrl: siteUrl(), baseURL })
  return provider
}

/**
 * Model calls for background jobs: `ai.object({ purpose, instructions, prompt, schema })`,
 * `ai.text(...)`, `ai.embed(...)`, `ai.contest(...)` and `ai.contestImage(...)` (the model arena),
 * `ai.usageToday()`.
 * Pages never call models.
 */
export const ai: Ai = {
  text: (call) => client().text(call),
  object: (call) => client().object(call),
  embed: (call) => client().embed(call),
  contest: (call) => client().contest(call),
  contestImage: (call) => client().contestImage(call),
  usageToday: () => client().usageToday(),
}

/**
 * A client on the real OpenRouter provider. The app uses the Postgres receipt store;
 * scripts/ai-smoke.ts passes an in-memory one so it needs no database.
 */
export function createOpenRouterAi(store: ReceiptStore = postgresReceiptStore): Ai {
  return createAi({
    store,
    // `usage.include` makes OpenRouter report the cost of each call, which feeds the budget.
    languageModel: (model) => openRouter().chat(model, { usage: { include: true } }),
    embeddingModel: (model) => openRouter().textEmbeddingModel(model),
  })
}

function client(): Ai {
  instance ??= createOpenRouterAi()
  return instance
}
