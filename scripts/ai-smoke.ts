/**
 * Three tiny real model calls through src/lib/ai, to confirm the OpenRouter setup:
 * text, structured output and an embedding, then the first call again to show the receipt
 * is reused. Uses an in-memory receipt store, so no database is needed.
 *
 *   pnpm ai:smoke        (reads .env when present; needs OPENROUTER_API_KEY and MODEL_CALLS_ENABLED=true)
 */
import { z } from 'zod'

import { createOpenRouterAi, EMBEDDING_DIMENSIONS, ModelCallError, modelFor, purposes, untrusted } from '@/lib/ai'
import { createMemoryReceiptStore } from '@/lib/ai/memory-store'

const store = createMemoryReceiptStore()
const ai = createOpenRouterAi(store)

function fail(message: string): never {
  console.error(`✗ ${message}`)
  process.exit(1)
}

console.log('Models by purpose:')
for (const purpose of purposes) console.log(`  ${purpose.padEnd(10)} ${modelFor(purpose)}`)
console.log(`Daily budget: $${process.env.AI_DAILY_BUDGET_USD || '10 (default)'}\n`)

if (process.env.HTTPS_PROXY && !process.env.NODE_USE_ENV_PROXY) {
  console.log('Hint: HTTPS_PROXY is set but Node fetch ignores it; run with NODE_USE_ENV_PROXY=1 behind a proxy.\n')
}
if (!process.env.OPENROUTER_API_KEY) fail('OPENROUTER_API_KEY is not set.')
if (process.env.MODEL_CALLS_ENABLED?.trim().toLowerCase() !== 'true') fail('Set MODEL_CALLS_ENABLED=true to allow paid calls.')

try {
  const text = await ai.text({
    purpose: 'assist',
    instructions: 'Reply with exactly the single word OK and nothing else.',
    prompt: 'ping',
    maxOutputTokens: 8,
    subject: 'smoke:text',
  })
  console.log(`✓ text     ${text.model} → ${JSON.stringify(text.output)}`)

  const scored = await ai.object({
    purpose: 'score',
    schema: z.object({ score: z.number().int().min(0).max(100), reason: z.string() }),
    instructions:
      'You score AI news for newsworthiness from 0 to 100 and give a one-sentence reason. Answer with JSON only.',
    prompt: untrusted(
      'smoke-test',
      'Example Labs releases Model 9, which it says runs on a laptop GPU and ships with open weights.',
    ),
    subject: 'smoke:object',
  })
  console.log(`✓ object   ${scored.model} → ${JSON.stringify(scored.output)}`)

  const embedded = await ai.embed({ purpose: 'embed', values: ['hello world'], subject: 'smoke:embed' })
  const dimensions = embedded.output[0]?.length ?? 0
  console.log(`✓ embed    ${embedded.model} → ${dimensions} dimensions`)
  if (dimensions !== EMBEDDING_DIMENSIONS) {
    fail(`Embedding has ${dimensions} dimensions; the vector columns expect ${EMBEDDING_DIMENSIONS}.`)
  }

  const again = await ai.text({
    purpose: 'assist',
    instructions: 'Reply with exactly the single word OK and nothing else.',
    prompt: 'ping',
    maxOutputTokens: 8,
    subject: 'smoke:text',
  })
  if (!again.reused) fail('The repeated call was paid again; receipt reuse is broken.')
  console.log('✓ repeat   reused the receipt, nothing paid')

  console.log('\nReceipts:')
  for (const row of store.rows) {
    console.log(
      `  #${row.id} ${row.purpose.padEnd(7)} ${row.status.padEnd(9)} in ${row.inputTokens} out ${row.outputTokens} $${row.costUsd.toFixed(6)}`,
    )
  }
  const spent = await store.spentSince(new Date(0))
  console.log(`Total: ${spent.calls} paid calls, $${spent.costUsd.toFixed(6)}`)
  if (spent.costUsd === 0) console.log('(OpenRouter reported no cost; check that usage accounting is on for this key.)')
} catch (error) {
  if (error instanceof ModelCallError) fail(`${error.name}: ${error.message} (retryable: ${error.retryable})`)
  fail(error instanceof Error ? `${error.name}: ${error.message}` : String(error))
}
