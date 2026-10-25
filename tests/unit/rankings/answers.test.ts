import type { Payload } from 'payload'
import { describe, expect, it, vi } from 'vitest'

import type { Ai } from '@/lib/ai/client'
import { BudgetExceededError, ReceiptExhaustedError, ReceiptInFlightError } from '@/lib/ai/errors'
import { generateAnswer } from '@/modules/rankings/answers/generate'

type Docs = {
  answer?: Record<string, unknown> | null
  prompt?: Record<string, unknown> | null
  model?: Record<string, unknown> | null
  arena?: Record<string, unknown> | null
  picture?: Record<string, unknown> | null
}

/**
 * Payload with one waiting answer, its question and its model, and the receipts table: today's
 * arena spend and the finished call's cost. Records what gets saved.
 */
function setup(
  docs: Docs = {},
  { spentUsd = 0, text = 'Here is my answer.', cutOff = false, fail, drawn = true }: { spentUsd?: number; text?: string; cutOff?: boolean; fail?: Error; drawn?: boolean } = {},
) {
  const byCollection: Record<string, Record<string, unknown> | null> = {
    'arena-answers': docs.answer === undefined ? { id: 5, status: 'pending', prompt: 3, model: 9, arena: 2, attempts: 0 } : docs.answer,
    'arena-prompts': docs.prompt === undefined ? { id: 3, status: 'active', text: 'Explain compound interest.' } : docs.prompt,
    'arena-models': docs.model === undefined ? { id: 9, status: 'active', name: 'Kimi K2', org: { en: 'Moonshot AI', 'zh-Hans': '月之暗面' }, openrouterId: 'moonshotai/kimi-k2' } : docs.model,
    arenas: docs.arena === undefined ? { id: 2, kind: 'text' } : docs.arena,
    'arena-images': docs.picture === undefined ? { id: 41 } : docs.picture,
  }
  const update = vi.fn(async ({ data }: { data: Record<string, unknown> }) => data)
  const rowsFor = (fields: Record<string, unknown>) => ('inputTokens' in fields ? [{ costUsd: 0.0021, inputTokens: 120, outputTokens: 480 }] : [{ costUsd: String(spentUsd) }])
  const select = (fields: Record<string, unknown>) => {
    const rows = rowsFor(fields)
    const chain = { from: () => chain, where: () => Object.assign(Promise.resolve(rows), { limit: async () => rows }) }
    return chain
  }
  const create = vi.fn(async () => ({ id: 41 }))
  const payload = {
    findByID: async ({ collection }: { collection: string }) => {
      const doc = byCollection[collection]
      if (!doc) throw new Error('Not Found')
      return doc
    },
    create,
    update,
    db: { drizzle: { select } },
  } as unknown as Payload
  const contest = vi.fn(async () => {
    if (fail) throw fail
    return { output: { text, cutOff }, receiptId: 77, reused: false }
  })
  // Like the real client: the picture is kept before the call counts as done.
  const contestImage = vi.fn(async ({ keep }: { keep: (image: { data: Uint8Array; mediaType: string }) => Promise<number> }) => {
    if (fail) throw fail
    const image = drawn ? await keep({ data: new Uint8Array([137, 80, 78, 71]), mediaType: 'image/png' }) : null
    return { output: { image }, receiptId: 77, reused: false }
  })
  const ai = { contest, contestImage } as unknown as Ai
  const now = () => new Date('2026-10-24T03:00:00Z')
  return { deps: { payload, ai, now, env: { ARENA_DAILY_BUDGET_USD: '2' } }, update, create, contest, contestImage }
}

const imageArena = { arena: { id: 2, kind: 'image' }, prompt: { id: 3, status: 'active', text: 'A red bicycle in the rain.' } }

describe('generateAnswer', () => {
  it('asks the contestant once and stores the answer with its cost', async () => {
    const { deps, update, contest } = setup({}, { text: '  Compound interest is interest on interest.  ' })
    expect(await generateAnswer(5, deps)).toEqual({ status: 'done', cutOff: false, namesItself: false, costUsd: 0.0021, reused: false })
    expect(contest).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'arena', model: 'moonshotai/kimi-k2', prompt: 'Explain compound interest.', variant: undefined, subject: 'arena-answers:5', maxOutputTokens: 4000 }),
    )
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'arena-answers',
        id: 5,
        data: expect.objectContaining({
          status: 'done',
          text: 'Compound interest is interest on interest.',
          cutOff: false,
          namesItself: false,
          costUsd: 0.0021,
          inputTokens: 120,
          outputTokens: 480,
          generatedAt: '2026-10-24T03:00:00.000Z',
          error: null,
        }),
      }),
    )
  })

  it('marks answers that run out of room or give the model away, in any of its maker’s names', async () => {
    expect(await generateAnswer(5, setup({}, { cutOff: true }).deps)).toMatchObject({ status: 'done', cutOff: true, namesItself: false })
    expect(await generateAnswer(5, setup({}, { text: 'As Kimi, I would say…' }).deps)).toMatchObject({ status: 'done', namesItself: true })
    expect(await generateAnswer(5, setup({}, { text: '我是月之暗面训练的模型。' }).deps)).toMatchObject({ status: 'done', namesItself: true })
  })

  it('makes a retry a new call', async () => {
    const { deps, contest } = setup({ answer: { id: 5, status: 'pending', prompt: 3, model: 9, attempts: 2 } })
    await generateAnswer(5, deps)
    expect(contest).toHaveBeenCalledWith(expect.objectContaining({ variant: 'retry-2' }))
  })

  it('leaves answers that are no longer wanted', async () => {
    for (const docs of [
      { answer: null },
      { answer: { id: 5, status: 'done', prompt: 3, model: 9 } },
      { prompt: { id: 3, status: 'retired', text: 'Old question' } },
      { model: { id: 9, status: 'retired', name: 'Kimi K2', org: 'Moonshot AI', openrouterId: 'moonshotai/kimi-k2' } },
    ]) {
      const { deps, contest } = setup(docs)
      expect((await generateAnswer(5, deps)).status).toBe('skipped')
      expect(contest).not.toHaveBeenCalled()
    }
  })

  it('stops for the day when the arena budget is spent', async () => {
    const { deps, contest } = setup({}, { spentUsd: 2.01 })
    expect(await generateAnswer(5, deps)).toEqual({ status: 'paused', reason: 'ARENA_DAILY_BUDGET_USD used up: $2.0100 of $2.00' })
    expect(contest).not.toHaveBeenCalled()
  })

  it('tells failures that need waiting from failures that need a person', async () => {
    expect((await generateAnswer(5, setup({}, { fail: new ReceiptInFlightError('arena') }).deps)).status).toBe('skipped')
    expect((await generateAnswer(5, setup({}, { fail: new BudgetExceededError(5, 5) }).deps)).status).toBe('paused')

    const exhausted = setup({}, { fail: new ReceiptExhaustedError('arena', 3, 'timeout') })
    expect((await generateAnswer(5, exhausted.deps)).status).toBe('failed')
    expect(exhausted.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }))

    const empty = setup({}, { text: '   ' })
    expect(await generateAnswer(5, empty.deps)).toEqual({ status: 'failed', reason: 'The model returned an empty answer.' })

    const broke = setup({}, { fail: new Error('Provider returned 502') })
    expect(await generateAnswer(5, broke.deps)).toEqual({ status: 'error', reason: 'Provider returned 502' })
    expect(broke.update).toHaveBeenCalledWith(expect.objectContaining({ data: { error: 'Provider returned 502' } }))
  })

  it('draws a picture in an image arena and stores it under a name that says nothing', async () => {
    const { deps, update, create, contest, contestImage } = setup(imageArena)
    expect(await generateAnswer(5, deps)).toEqual({ status: 'done', cutOff: false, namesItself: false, costUsd: 0.0021, reused: false })
    expect(contest).not.toHaveBeenCalled()
    expect(contestImage).toHaveBeenCalledWith(
      expect.objectContaining({ purpose: 'arena', model: 'moonshotai/kimi-k2', prompt: 'A red bicycle in the rain.', subject: 'arena-answers:5', instructions: expect.stringContaining('Draw one image') }),
    )
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({ collection: 'arena-images', file: expect.objectContaining({ mimetype: 'image/png', name: expect.stringMatching(/^[0-9a-f]{24}\.png$/), size: 4 }) }),
    )
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        collection: 'arena-answers',
        data: expect.objectContaining({ status: 'done', image: 41, text: null, cutOff: false, namesItself: false, costUsd: 0.0021, error: null }),
      }),
    )
  })

  it('fails a picture that never came or was deleted since', async () => {
    expect(await generateAnswer(5, setup(imageArena, { drawn: false }).deps)).toEqual({ status: 'failed', reason: 'The model returned no picture.' })
    const deleted = setup({ ...imageArena, picture: null })
    expect(await generateAnswer(5, deleted.deps)).toMatchObject({ status: 'failed', reason: expect.stringContaining('deleted') })
    expect(deleted.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'failed' }) }))
  })
})
