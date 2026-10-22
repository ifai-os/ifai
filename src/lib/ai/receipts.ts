import { createHash } from 'node:crypto'

export type ReceiptStatus = 'pending' | 'succeeded' | 'failed'

export type Receipt = {
  id: number
  purpose: string
  inputHash: string
  model: string
  status: ReceiptStatus
  attempts: number
  output: unknown
  error: string | null
}

export type ReceiptUsage = {
  inputTokens: number
  outputTokens: number
  costUsd: number
}

export type ClaimInput = {
  purpose: string
  inputHash: string
  model: string
  subject: string | null
}

export type ClaimOptions = {
  /** A pending receipt last touched before this is treated as abandoned (crashed run). */
  staleBefore: Date
  /** Failed or abandoned receipts are retried until they reach this many attempts. */
  maxAttempts: number
}

/** Where receipts live. Production uses Postgres (./store.ts); tests use ./memory-store.ts. */
export interface ReceiptStore {
  find(purpose: string, inputHash: string): Promise<Receipt | null>
  /**
   * Atomically create a pending receipt, or take over a failed or abandoned one.
   * Returns null when another run holds it, it already succeeded, or it has no attempts left.
   */
  claim(input: ClaimInput, options: ClaimOptions): Promise<Receipt | null>
  succeed(id: number, output: unknown, usage: ReceiptUsage): Promise<void>
  fail(id: number, error: string): Promise<void>
  /** Cost and number of completed calls since an instant. */
  spentSince(since: Date): Promise<{ costUsd: number; calls: number }>
}

/** JSON with object keys sorted, so equal inputs always hash the same. */
export function stableStringify(value: unknown): string {
  if (value === undefined) return 'null'
  if (value === null || typeof value !== 'object') return JSON.stringify(value)
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  const entries = Object.entries(value as Record<string, unknown>)
    .filter(([, v]) => v !== undefined)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`
}

export function hashInput(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex')
}
