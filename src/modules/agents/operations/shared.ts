import { z } from 'zod'

import { locales, localizePath, type Locale } from '@/i18n/config'
import type { InLanguage } from '@/lib/i18n/localized'
import { agentWritesEnabled } from '@/lib/switches'
import type { Actor } from '@/modules/circles/data'

import type { AgentCaller } from '../data'
import { settingsUrl } from '../http'
import { OperationError } from './types'

/** Parameters and address helpers the operations share, and who a write acts as. */

export const langParam = z
  .enum(locales)
  .default('en')
  .describe('Language to read in: en, zh-Hans, zh-Hant, ja or ko. Text missing in it comes in English, and `lang` says which.')

export const pageParam = z.number().int().min(1).max(10_000).default(1).describe('Page number, from 1.')

/** A page's full address in a language: `/news/x` → `https://ifai.io/zh-hans/news/x`. */
export function pageUrl(origin: string, locale: Locale, href: `/${string}`): string {
  return `${origin}${localizePath(locale, href)}`
}

/** A file's full address: media can be on this site (`/api/media/file/…`) or on R2 already. */
export function fileUrl(origin: string, url: string | null | undefined): string | null {
  if (!url) return null
  try {
    return new URL(url, origin).href
  } catch {
    return null
  }
}

/** The text of a field read in the reader's language, and that language. */
export function textOf<T>(value: InLanguage<T> | null | undefined): T | null {
  return value ? value.value : null
}

/** Whole pages for `total` items, `size` a page. */
export function pagesFor(total: number, size: number): number {
  return Math.max(1, Math.ceil(total / size))
}

/**
 * Why this caller cannot write now, or null when it can (docs/specs/agents.md「写操作」): a write
 * needs a read-and-write key, while IFAI lets agents write (AGENT_WRITES_ENABLED).
 */
export function writeProblem(caller: AgentCaller | null, origin: string): OperationError | null {
  if (!caller) return new OperationError(401, 'unauthorized', `This needs an IFAI key that can write: a member makes one for their agent at ${settingsUrl(origin)}.`)
  if (caller.scope !== 'write') {
    return new OperationError(403, 'forbidden', `This IFAI key can only read. Your owner can make a read-and-write key at ${settingsUrl(origin)}.`)
  }
  if (!agentWritesEnabled()) return new OperationError(503, 'unavailable', 'IFAI has paused writing for agents for now; reading still works. Try again later.')
  return null
}

/** Who a write acts as: the agent behind the key, for the member who runs it. Throws what `writeProblem` finds. */
export function actorOf(caller: AgentCaller | null, origin: string): Actor & { agentId: number } {
  const problem = writeProblem(caller, origin)
  if (problem) throw problem
  const { owner, agent } = caller as AgentCaller
  return { userId: owner.id, agentId: agent.id }
}
