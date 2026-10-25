import { embedMany, generateText, Output, type EmbeddingModel, type LanguageModel, type ProviderMetadata } from 'ai'
import { z } from 'zod'

import { shanghaiDayStart } from '@/lib/shanghai-day'
import { modelCallsEnabled } from '@/lib/switches'

import {
  BudgetExceededError,
  ModelCallsDisabledError,
  ReceiptExhaustedError,
  ReceiptInFlightError,
} from './errors'
import { dailyBudgetUsd, MAX_ATTEMPTS, STALE_AFTER_MS } from './limits'
import { modelFor, type ContestPurpose, type EmbeddingPurpose, type Purpose, type TextPurpose } from './purposes'
import { hashInput, type Receipt, type ReceiptStore, type ReceiptUsage } from './receipts'
import { EXTERNAL_DATA_RULE } from './untrusted'

export { DEFAULT_DAILY_BUDGET_USD } from './limits'

export type AiDeps = {
  store: ReceiptStore
  languageModel: (modelId: string) => LanguageModel
  embeddingModel: (modelId: string) => EmbeddingModel
  env?: Record<string, string | undefined>
  now?: () => Date
}

type CallOptions = {
  /** Our own instructions (prompts live in src/modules/<module>/prompts/). */
  instructions: string
  /** The task. Wrap every piece of outside text in `untrusted()`. */
  prompt: string
  /** Tells deliberate repeats apart, e.g. "a" and "b" for the two independent scores. */
  variant?: string
  /** What the call is about, e.g. "raw_items:123"; shown with the receipt. */
  subject?: string
  temperature?: number
  maxOutputTokens?: number
}

export type TextCall = CallOptions & { purpose: TextPurpose }
export type ObjectCall<S extends z.ZodType> = CallOptions & { purpose: TextPurpose; schema: S }
export type EmbedCall = { purpose: EmbeddingPurpose; values: string[]; subject?: string }

/**
 * A contestant's answer in the model arena: the same instructions and prompt for every model,
 * the model chosen by the call (an OpenRouter ID from the arena's contestant list). The prompt is
 * the site owner's own question, so the outside-data rule is not added.
 */
export type ContestCall = {
  purpose: ContestPurpose
  model: string
  instructions: string
  prompt: string
  variant?: string
  subject?: string
  maxOutputTokens?: number
}

/** The answer, and whether the model stopped on its own or ran into `maxOutputTokens`. */
export type ContestOutput = { text: string; cutOff: boolean }

/** A picture as the model returned it, before it is stored. */
export type ContestImage = { data: Uint8Array; mediaType: string }

/**
 * A contestant's picture in an image arena: the same call as `ContestCall`, asking OpenRouter for
 * image output. `keep` stores the first picture and returns its ID before the receipt is marked
 * done, so the receipt only holds that ID and no later step pays for the picture again.
 */
export type ContestImageCall = Omit<ContestCall, 'maxOutputTokens'> & { keep: (image: ContestImage) => Promise<number> }

/** The stored picture's ID; null when the model answered without one. */
export type ContestImageOutput = { image: number | null }

export type AiResult<T> = {
  output: T
  model: string
  /** True when the output came from an earlier receipt and nothing was paid. */
  reused: boolean
  receiptId: number
}

export type UsageToday = {
  costUsd: number
  calls: number
  budgetUsd: number
  enabled: boolean
}

export type Ai = ReturnType<typeof createAi>

function costOf(metadata: ProviderMetadata | undefined): number {
  const usage = metadata?.openrouter?.usage as { cost?: unknown } | undefined
  return typeof usage?.cost === 'number' && Number.isFinite(usage.cost) ? usage.cost : 0
}

function message(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * The only way the app calls models (AGENTS.md rule 8). Every call:
 * picks its model by purpose, writes a receipt first so retries never pay twice,
 * stops when MODEL_CALLS_ENABLED is off or the daily budget is used up.
 */
export function createAi({ store, languageModel, embeddingModel, env = process.env, now = () => new Date() }: AiDeps) {
  const enabled = () => modelCallsEnabled(env)

  const budgetUsd = () => dailyBudgetUsd(env)

  async function usageToday(): Promise<UsageToday> {
    const spent = await store.spentSince(shanghaiDayStart(now()))
    return { ...spent, budgetUsd: budgetUsd(), enabled: enabled() }
  }

  /**
   * Shared receipt flow. `run` makes the paid call and returns what to store;
   * `revive` turns a stored output back into the result (and validates it).
   */
  async function withReceipt<T>(
    purpose: Purpose | ContestPurpose,
    input: unknown,
    subject: string | undefined,
    run: (model: string) => Promise<{ output: T; usage: ReceiptUsage }>,
    revive: (stored: unknown) => T,
    /** The contest purposes name their model per call; every other purpose has one in purposes.ts. */
    contestant?: string,
  ): Promise<AiResult<T>> {
    const model = contestant ?? modelFor(purpose as Purpose, env)
    const inputHash = hashInput({ purpose, model, input })
    const reuse = (receipt: Receipt): AiResult<T> => ({
      output: revive(receipt.output),
      model: receipt.model,
      reused: true,
      receiptId: receipt.id,
    })

    // A finished receipt costs nothing to reuse, even with the switch off or the budget spent.
    const existing = await store.find(purpose, inputHash)
    if (existing?.status === 'succeeded') return reuse(existing)

    if (!enabled()) throw new ModelCallsDisabledError()
    const spent = await store.spentSince(shanghaiDayStart(now()))
    if (spent.costUsd >= budgetUsd()) throw new BudgetExceededError(spent.costUsd, budgetUsd())

    const receipt = await store.claim(
      { purpose, inputHash, model, subject: subject ?? null },
      { staleBefore: new Date(now().getTime() - STALE_AFTER_MS), maxAttempts: MAX_ATTEMPTS },
    )
    if (!receipt) {
      const current = await store.find(purpose, inputHash)
      if (current?.status === 'succeeded') return reuse(current)
      if (current?.status === 'failed') throw new ReceiptExhaustedError(purpose, current.attempts, current.error)
      throw new ReceiptInFlightError(purpose)
    }

    try {
      const { output, usage } = await run(model)
      await store.succeed(receipt.id, output, usage)
      return { output, model, reused: false, receiptId: receipt.id }
    } catch (error) {
      await store.fail(receipt.id, message(error))
      throw error
    }
  }

  const promptInput = (call: CallOptions) => ({
    instructions: call.instructions,
    prompt: call.prompt,
    variant: call.variant,
    temperature: call.temperature,
    maxOutputTokens: call.maxOutputTokens,
  })

  const settings = (call: CallOptions) => ({
    instructions: `${call.instructions}\n\n${EXTERNAL_DATA_RULE}`,
    prompt: call.prompt,
    temperature: call.temperature,
    maxOutputTokens: call.maxOutputTokens,
  })

  /** Free text, e.g. a shortened summary. */
  function text(call: TextCall): Promise<AiResult<string>> {
    return withReceipt(
      call.purpose,
      { kind: 'text', ...promptInput(call) },
      call.subject,
      async (model) => {
        const result = await generateText({ model: languageModel(model), ...settings(call) })
        return {
          output: result.text,
          usage: {
            inputTokens: result.usage.inputTokens ?? 0,
            outputTokens: result.usage.outputTokens ?? 0,
            costUsd: costOf(result.providerMetadata),
          },
        }
      },
      (stored) => z.string().parse(stored),
    )
  }

  /** Structured output validated against a Zod schema. */
  function object<S extends z.ZodType>(call: ObjectCall<S>): Promise<AiResult<z.infer<S>>> {
    return withReceipt(
      call.purpose,
      { kind: 'object', schema: z.toJSONSchema(call.schema), ...promptInput(call) },
      call.subject,
      async (model) => {
        const result = await generateText({
          model: languageModel(model),
          output: Output.object({ schema: call.schema }),
          ...settings(call),
        })
        return {
          output: result.output as z.infer<S>,
          usage: {
            inputTokens: result.usage.inputTokens ?? 0,
            outputTokens: result.usage.outputTokens ?? 0,
            costUsd: costOf(result.providerMetadata),
          },
        }
      },
      (stored) => call.schema.parse(stored),
    )
  }

  /** Vectors for similarity search, one per value. */
  function embed(call: EmbedCall): Promise<AiResult<number[][]>> {
    return withReceipt(
      call.purpose,
      { kind: 'embed', values: call.values },
      call.subject,
      async (model) => {
        const result = await embedMany({ model: embeddingModel(model), values: call.values })
        return {
          output: result.embeddings,
          usage: { inputTokens: result.usage.tokens ?? 0, outputTokens: 0, costUsd: costOf(result.providerMetadata) },
        }
      },
      (stored) => z.array(z.array(z.number())).parse(stored),
    )
  }

  /** One contestant's answer to an arena question (src/modules/rankings/answers). */
  function contest(call: ContestCall): Promise<AiResult<ContestOutput>> {
    return withReceipt(
      call.purpose,
      { kind: 'contest', instructions: call.instructions, prompt: call.prompt, variant: call.variant, maxOutputTokens: call.maxOutputTokens },
      call.subject,
      async (model) => {
        const result = await generateText({
          model: languageModel(model),
          instructions: call.instructions,
          prompt: call.prompt,
          maxOutputTokens: call.maxOutputTokens,
        })
        return {
          output: { text: result.text, cutOff: result.finishReason === 'length' },
          usage: {
            inputTokens: result.usage.inputTokens ?? 0,
            outputTokens: result.usage.outputTokens ?? 0,
            costUsd: costOf(result.providerMetadata),
          },
        }
      },
      (stored) => z.object({ text: z.string(), cutOff: z.boolean() }).parse(stored),
      call.model,
    )
  }

  /** One contestant's picture for an image-arena question (src/modules/rankings/answers). */
  function contestImage(call: ContestImageCall): Promise<AiResult<ContestImageOutput>> {
    return withReceipt(
      call.purpose,
      { kind: 'contest-image', instructions: call.instructions, prompt: call.prompt, variant: call.variant },
      call.subject,
      async (model) => {
        const result = await generateText({
          model: languageModel(model),
          instructions: call.instructions,
          prompt: call.prompt,
          // OpenRouter's chat API returns pictures inline when asked for image output; the provider passes its options on.
          providerOptions: { openrouter: { modalities: ['image', 'text'] } },
        })
        const picture = result.files.find((file) => file.mediaType.startsWith('image/'))
        return {
          output: { image: picture ? await call.keep({ data: picture.uint8Array, mediaType: picture.mediaType }) : null },
          usage: {
            inputTokens: result.usage.inputTokens ?? 0,
            outputTokens: result.usage.outputTokens ?? 0,
            costUsd: costOf(result.providerMetadata),
          },
        }
      },
      (stored) => z.object({ image: z.number().int().nullable() }).parse(stored),
      call.model,
    )
  }

  return { text, object, embed, contest, contestImage, usageToday }
}
