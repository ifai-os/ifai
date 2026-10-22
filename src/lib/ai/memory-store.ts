import type { ClaimInput, ClaimOptions, Receipt, ReceiptStore, ReceiptUsage } from './receipts'

type Row = Receipt & ReceiptUsage & { subject: string | null; updatedAt: Date; completedAt: Date | null }

/** In-memory receipts for tests and scripts. Same rules as the Postgres store. */
export function createMemoryReceiptStore(now: () => Date = () => new Date()) {
  const rows: Row[] = []
  const key = (purpose: string, inputHash: string) =>
    rows.find((row) => row.purpose === purpose && row.inputHash === inputHash)
  const byId = (id: number) => {
    const row = rows.find((r) => r.id === id)
    if (!row) throw new Error(`No receipt ${id}`)
    return row
  }

  const store: ReceiptStore & { rows: Row[] } = {
    rows,
    async find(purpose, inputHash) {
      const row = key(purpose, inputHash)
      return row ? { ...row } : null
    },
    async claim(input: ClaimInput, { staleBefore, maxAttempts }: ClaimOptions) {
      const row = key(input.purpose, input.inputHash)
      if (!row) {
        const created: Row = {
          ...input,
          id: rows.length + 1,
          status: 'pending',
          attempts: 1,
          output: null,
          error: null,
          inputTokens: 0,
          outputTokens: 0,
          costUsd: 0,
          updatedAt: now(),
          completedAt: null,
        }
        rows.push(created)
        return { ...created }
      }
      const retryable =
        row.status === 'failed' || (row.status === 'pending' && row.updatedAt < staleBefore)
      if (!retryable || row.attempts >= maxAttempts) return null
      Object.assign(row, { status: 'pending', attempts: row.attempts + 1, error: null, updatedAt: now() })
      return { ...row }
    },
    async succeed(id, output, usage) {
      Object.assign(byId(id), { status: 'succeeded', output, ...usage, updatedAt: now(), completedAt: now() })
    },
    async fail(id, error) {
      Object.assign(byId(id), { status: 'failed', error, updatedAt: now(), completedAt: now() })
    },
    async spentSince(since) {
      const done = rows.filter((row) => row.completedAt && row.completedAt >= since)
      return {
        costUsd: done.reduce((sum, row) => sum + row.costUsd, 0),
        calls: done.filter((row) => row.status === 'succeeded').length,
      }
    },
  }
  return store
}
