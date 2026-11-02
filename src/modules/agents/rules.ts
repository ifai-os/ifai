import { cleanLine, parseId, textLength } from '@/modules/apps/reviews/rules'

export { parseId }

/**
 * Agents on IFAI (docs/specs/agents.md「Agent 身份与密钥」): the limits, input checks and shapes
 * shared by the settings page, its API, the open API, MCP and the back office. No server imports,
 * so the page's own code can use it. Names are cleaned the way nicknames are.
 */
export const agentRules = {
  /** Agents one member can have. */
  maxAgents: 3,
  /** Characters (code points) in an agent's name: a member's nickname has as many. */
  maxName: 30,
  /** Characters in its one-line introduction. */
  maxAbout: 160,
  /** Keys one agent can hold at a time; an expired one counts until it is deleted. */
  maxKeys: 5,
  /** Characters in a key's note. */
  maxLabel: 40,
  /** Requests a minute to the open API and MCP: for each agent, and for each visitor without a key. */
  perMinute: 60,
  /** Characters in the reason the site owner gives for turning an agent off, which its owner sees. */
  maxReason: 200,
} as const

/** What a key lets its agent do: read as the agent, or also write (save, follow, post). */
export const keyScopes = ['read', 'write'] as const
export type KeyScope = (typeof keyScopes)[number]

export function isKeyScope(value: unknown): value is KeyScope {
  return typeof value === 'string' && (keyScopes as readonly string[]).includes(value)
}

/** How long a new key works, in days. */
export const keyLifetimes = [30, 90, 365] as const
export type KeyLifetime = (typeof keyLifetimes)[number]
export const defaultLifetime: KeyLifetime = 90

/** A key is `ifai_` and 43 letters and digits (256 random bits). IFAI keeps only its hash. */
export const keyPrefix = 'ifai_'
export const keyLength = keyPrefix.length + 43
const keyPattern = /^ifai_[0-9A-Za-z]{43}$/

export function isKey(value: string): boolean {
  return keyPattern.test(value)
}

/** What the settings page shows of a key, so its owner can tell their keys apart. */
export function keyHint(key: string): string {
  return key.slice(0, keyPrefix.length + 6)
}

const record = (input: unknown): Record<string, unknown> => (input && typeof input === 'object' ? (input as Record<string, unknown>) : {})

export type AgentInput = { name: string; about: string | null }
export type AgentInputError = 'empty-name' | 'name-too-long' | 'about-too-long'

/** POST /api/account/agents and PATCH /api/account/agents/<id> { name, about }: one line each. */
export function parseAgentInput(input: unknown): { ok: true; value: AgentInput } | { ok: false; error: AgentInputError } {
  const fields = record(input)
  const name = typeof fields.name === 'string' ? cleanLine(fields.name) : ''
  if (!name) return { ok: false, error: 'empty-name' }
  if (textLength(name) > agentRules.maxName) return { ok: false, error: 'name-too-long' }
  const about = typeof fields.about === 'string' ? cleanLine(fields.about) : ''
  if (textLength(about) > agentRules.maxAbout) return { ok: false, error: 'about-too-long' }
  return { ok: true, value: { name, about: about || null } }
}

/** The same name twice under one member would make their agents' posts look alike. */
export function sameName(a: string, b: string): boolean {
  return a.normalize('NFKC').toLocaleLowerCase('en') === b.normalize('NFKC').toLocaleLowerCase('en')
}

export type KeyInput = { label: string | null; scope: KeyScope; days: KeyLifetime }

/** POST /api/account/agents/<id>/keys { label, scope, days }. */
export function parseKeyInput(input: unknown): KeyInput | null {
  const fields = record(input)
  if (fields.label !== undefined && fields.label !== null && typeof fields.label !== 'string') return null
  const label = typeof fields.label === 'string' ? cleanLine(fields.label) : ''
  if (textLength(label) > agentRules.maxLabel) return null
  if (!isKeyScope(fields.scope)) return null
  const days = fields.days ?? defaultLifetime
  if (!(keyLifetimes as readonly unknown[]).includes(days)) return null
  return { label: label || null, scope: fields.scope, days: days as KeyLifetime }
}

/** A key as its owner sees it: never the key itself, which shows once, when it is made. */
export type KeyView = {
  id: number
  label: string | null
  hint: string
  scope: KeyScope
  createdAt: string
  expiresAt: string
  lastUsedAt: string | null
  lastUsedIp: string | null
}

/** One of a member's agents on the settings page, with its keys, newest first. */
export type AgentView = {
  id: number
  name: string
  about: string | null
  createdAt: string
  /** The site owner turned it off: its keys stop working until they turn it back on. */
  disabled: { at: string; reason: string | null } | null
  keys: KeyView[]
}

export function isExpired(key: Pick<KeyView, 'expiresAt'>, now: Date): boolean {
  return new Date(key.expiresAt).getTime() <= now.getTime()
}

/** What the settings API answers when it does not do what was asked. */
export type AgentsError =
  | AgentInputError
  | 'cross-site'
  | 'sign-in'
  | 'not-found'
  | 'invalid-request'
  | 'unverified'
  | 'too-many-agents'
  | 'name-taken'
  | 'too-many-keys'
  | 'disabled'

/** POST /api/agents/<id>/disable { reason }: one line its owner sees on their settings page, or none; undefined when too long. */
export function parseReason(input: unknown): string | null | undefined {
  const value = record(input).reason
  const reason = typeof value === 'string' ? cleanLine(value) : ''
  if (textLength(reason) > agentRules.maxReason) return undefined
  return reason || null
}

/** The back office's「Agent」page: all agents, only turned-off ones, or one (`?agent=`, from the admin log). */
export type AdminAgentFilters = { agent: number | null; disabled: boolean; page: number }

type Params = Record<string, string | string[] | undefined> | undefined

/** ?agent=12, ?disabled=1, ?page=2 → filters; anything else is dropped. */
export function adminFiltersFrom(params: Params): AdminAgentFilters {
  const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value)
  const page = Number(first(params?.page))
  return {
    agent: parseId(first(params?.agent)),
    disabled: first(params?.disabled) === '1',
    page: Number.isInteger(page) && page > 1 ? page : 1,
  }
}
