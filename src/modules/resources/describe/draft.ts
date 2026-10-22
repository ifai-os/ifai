import config from '@payload-config'
import { RetryAfterError } from 'inngest'
import { getPayload, type Payload } from 'payload'

import { ai as defaultAi } from '@/lib/ai'
import type { Ai } from '@/lib/ai/client'
import {
  BudgetExceededError,
  MissingApiKeyError,
  ModelCallError,
  ModelCallsDisabledError,
  ReceiptExhaustedError,
} from '@/lib/ai/errors'
import type { Skill, SkillVersion } from '@/payload-types'
import { verifyWriting } from '@/modules/daily/write/verify'

import { FROZEN_STATUSES } from '../collections/guards'
import {
  describeFactsPrompt,
  describeLocales,
  describeWritePrompt,
  type Declarations,
  type DescribeLocaleKey,
  type WrittenDescription,
} from '../prompts/describe'
import { describeMaterial, materialText, ThinMaterialError, type Material } from './material'
import { infoOf, type DraftInfo, type DraftMode, type DraftReason, type DraftStatus, type DroppedDeclaration } from './state'

/**
 * 说明起草 (docs/specs/resources.md「后台」1,「定时任务与 AI」): a version's SKILL.md, README and
 * file list → declarations and the Skill page in four languages → checked draft for the owner
 * to review. Each stage is its own Inngest step (./jobs.ts). The draft's state is on the
 * version: `draftStatus` (pending → drafted | failed) and `draftInfo`. A model that cannot run
 * leaves the fields empty for the owner to write by hand; the import itself is never blocked.
 */

export type DescribeDeps = { ai?: Ai; now?: () => Date; payload?: Payload }

const payloadOf = async (deps: DescribeDeps) => deps.payload ?? getPayload({ config })
const nowOf = (deps: DescribeDeps) => deps.now?.() ?? new Date()

export const describeLocaleKeys = Object.keys(describeLocales) as DescribeLocaleKey[]

async function loadVersion(payload: Payload, versionId: number) {
  try {
    return await payload.findByID({ collection: 'skill-versions', id: versionId, depth: 0 })
  } catch {
    return null
  }
}

const skillIdOf = (version: SkillVersion) => (typeof version.skill === 'number' ? version.skill : version.skill.id)

/** Set the draft state. `draftInfo` is replaced with `info`, so callers pass what to keep. */
async function setDraft(payload: Payload, versionId: number, draftStatus: DraftStatus, info: DraftInfo) {
  await payload.update({ collection: 'skill-versions', id: versionId, data: { draftStatus, draftInfo: info }, depth: 0, context: { system: true } })
}

export async function markWaiting(versionId: number, reason: DraftReason, deps: DescribeDeps = {}) {
  const payload = await payloadOf(deps)
  const version = await loadVersion(payload, versionId)
  if (!version || version.draftStatus !== 'pending') return
  await setDraft(payload, versionId, 'pending', { ...infoOf(version), reason })
}

export async function markFailed(versionId: number, reason: DraftReason, deps: DescribeDeps = {}) {
  const payload = await payloadOf(deps)
  const version = await loadVersion(payload, versionId)
  if (!version || version.draftStatus !== 'pending') return
  await setDraft(payload, versionId, 'failed', { ...infoOf(version), reason })
}

function reasonFor(error: ModelCallError): DraftReason {
  if (error instanceof ModelCallsDisabledError) return { code: 'switch-off', detail: error.message }
  if (error instanceof BudgetExceededError) return { code: 'budget', detail: error.message }
  if (error instanceof MissingApiKeyError) return { code: 'no-key', detail: error.message }
  return { code: 'model', detail: error.message }
}

export type Started =
  | { status: 'ready'; requestedAt: string; mode: DraftMode }
  | { status: 'skipped'; reason: string }
  | { status: 'paused'; reason: DraftReason }

/** The version must still be waiting for this draft, and model calls must be possible today. */
export async function startDescribe(versionId: number, deps: DescribeDeps = {}): Promise<Started> {
  const payload = await payloadOf(deps)
  const version = await loadVersion(payload, versionId)
  if (!version) return { status: 'skipped', reason: 'no such version' }
  if (version.draftStatus !== 'pending') return { status: 'skipped', reason: `draft is ${version.draftStatus ?? 'not requested'}` }
  const info = infoOf(version)

  // Check before calling anything: a paused draft is retried by the sweep.
  const usage = await (deps.ai ?? defaultAi).usageToday()
  const reason: DraftReason | null = !usage.enabled
    ? reasonFor(new ModelCallsDisabledError())
    : usage.costUsd >= usage.budgetUsd
      ? reasonFor(new BudgetExceededError(usage.costUsd, usage.budgetUsd))
      : null
  if (reason) {
    await markWaiting(versionId, reason, deps)
    return { status: 'paused', reason }
  }

  const mode: DraftMode = info.mode ?? 'rewrite'
  if (!info.requestedAt) {
    const requestedAt = nowOf(deps).toISOString()
    await setDraft(payload, versionId, 'pending', { ...info, requestedAt, mode })
    return { status: 'ready', requestedAt, mode }
  }
  return { status: 'ready', requestedAt: info.requestedAt, mode }
}

export type Gathered = { status: 'ready'; material: Material } | { status: 'failed'; reason: DraftReason } | { status: 'skipped'; reason: string }

/** The version's SKILL.md, README and file list. A version without SKILL.md text fails the draft. */
export async function gatherMaterial(versionId: number, deps: DescribeDeps = {}): Promise<Gathered> {
  const payload = await payloadOf(deps)
  const version = await loadVersion(payload, versionId)
  if (!version || version.draftStatus !== 'pending') return { status: 'skipped', reason: 'draft is no longer waiting' }
  let skill: Skill
  try {
    skill = await payload.findByID({ collection: 'skills', id: skillIdOf(version), depth: 0 })
  } catch {
    return { status: 'skipped', reason: 'the version has no Skill' }
  }
  try {
    return { status: 'ready', material: describeMaterial(version, skill) }
  } catch (error) {
    if (!(error instanceof ThinMaterialError)) throw error
    const reason: DraftReason = { code: 'thin', detail: error.message }
    await markFailed(versionId, reason, deps)
    return { status: 'failed', reason }
  }
}

export type ModelStep<T> =
  | { status: 'done'; output: T; model: string }
  | { status: 'paused'; reason: DraftReason }
  | { status: 'blocked'; reason: DraftReason }

/**
 * One model call, its failures by kind (as in the daily and apps jobs): a call running elsewhere
 * is retried after a pause; a closed switch, spent budget or missing key leaves the draft
 * waiting; a call that failed three times fails the draft.
 */
async function modelStep<T>(run: () => Promise<{ output: T; model: string }>): Promise<ModelStep<T>> {
  try {
    const { output, model } = await run()
    return { status: 'done', output, model }
  } catch (error) {
    if (!(error instanceof ModelCallError)) throw error
    if (error.retryable) throw new RetryAfterError(error.message, '2m')
    return { status: error instanceof ReceiptExhaustedError ? 'blocked' : 'paused', reason: reasonFor(error) }
  }
}

/** The declarations call. `variant` is the request time, so each new request is a new call and retries are free. */
export function extractDeclarations(versionId: number, material: Material, variant: string, deps: DescribeDeps = {}) {
  return modelStep(() =>
    (deps.ai ?? defaultAi).object({
      purpose: 'describe',
      subject: `skill-versions:${versionId}`,
      variant,
      instructions: describeFactsPrompt.instructions,
      prompt: describeFactsPrompt.build(material),
      schema: describeFactsPrompt.schema,
      temperature: 0,
      maxOutputTokens: 800,
    }),
  )
}

export function writeDescription(versionId: number, material: Material, key: DescribeLocaleKey, variant: string, deps: DescribeDeps = {}) {
  return modelStep(() =>
    (deps.ai ?? defaultAi).object({
      purpose: 'describe',
      subject: `skill-versions:${versionId}`,
      variant,
      instructions: describeWritePrompt.instructions(key),
      prompt: describeWritePrompt.build(material),
      schema: describeWritePrompt.schema,
      temperature: 0.3,
      maxOutputTokens: 3000,
    }),
  )
}

/** Cut to `max` UTF-16 units (Payload's maxLength), ending with an ellipsis when cut. */
function clip(text: string, max: number): string {
  const value = text.trim()
  if (value.length <= max) return value
  let cut = ''
  for (const char of value) {
    if (cut.length + char.length > max - 1) break
    cut += char
  }
  return `${cut.trimEnd()}…`
}

const steps = (rows: { title: string; detail: string }[], max: number) =>
  rows
    .map((row) => ({ title: clip(row.title, 80), detail: row.detail.trim() }))
    .filter((row) => row.title)
    .slice(0, max)

/** The model's text within the collection's limits: 60-character name, 120-character tagline, 8 capabilities and steps. */
export function fitDescription(written: WrittenDescription) {
  return {
    name: clip(written.name, 60),
    tagline: clip(written.tagline, 120),
    capabilities: steps(written.capabilities, 8),
    example: written.example.trim(),
    workflow: steps(written.workflow, 8),
    notes: written.notes.trim(),
  }
}

export type FittedDescription = ReturnType<typeof fitDescription>

/** The text of one language's draft, for the name-and-number check. */
export function descriptionText(fitted: FittedDescription): string {
  return [
    fitted.name,
    fitted.tagline,
    ...fitted.capabilities.flatMap((row) => [row.title, row.detail]),
    fitted.example,
    ...fitted.workflow.flatMap((row) => [row.title, row.detail]),
    fitted.notes,
  ].join('\n')
}

const HOST = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]*[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]*[a-z0-9])?)+$/

/** "https://api.example.com/v1" or "API.example.com" → "api.example.com"; null when it is not a host name. */
export function hostOf(value: string): string | null {
  let text = value.trim().toLowerCase()
  if (text.includes('://')) {
    try {
      text = new URL(text).hostname
    } catch {
      return null
    }
  }
  text = text.split(/[/?#:\s]/)[0].replace(/^\*\./, '').replace(/\.$/, '')
  return HOST.test(text) ? text : null
}

/** True when some word of the value (3+ letters or digits) appears in the files; "Node 22" matches "node". */
function namedInFiles(value: string, haystack: string): boolean {
  const words = value.toLowerCase().match(/[a-z0-9][a-z0-9_.+-]{2,}/g) ?? []
  return words.some((word) => haystack.includes(word))
}

export type CheckedDeclarations = {
  /** The hosts SKILL.md already declared, then the model's additions that the files contain. */
  domains: string[]
  fileScope: string | null
  tools: string[]
  apiKeys: string[]
  dropped: DroppedDeclaration[]
}

/**
 * Keep only declarations the files actually contain: a host, tool or key name the model made up
 * is dropped and shown to the owner. Domains are added to those found in SKILL.md at scan time.
 */
export function checkDeclarations(facts: Declarations, material: Material, declaredDomains: readonly string[]): CheckedDeclarations {
  const haystack = materialText(material).toLowerCase()
  const dropped: DroppedDeclaration[] = []
  const domains = [...declaredDomains]
  for (const raw of facts.domains) {
    const host = hostOf(raw)
    if (!host) continue
    if (!haystack.includes(host)) dropped.push({ field: 'domains', value: host })
    else if (!domains.includes(host)) domains.push(host)
  }
  const keep = (field: 'tools' | 'apiKeys', values: string[], max: number) => {
    const kept: string[] = []
    for (const raw of values) {
      const value = raw.trim().replace(/^[`'"]+|[`'"]+$/g, '')
      if (!value || kept.some((item) => item.toLowerCase() === value.toLowerCase())) continue
      if (namedInFiles(value, haystack)) kept.push(clip(value, 60))
      else dropped.push({ field, value })
    }
    return kept.slice(0, max)
  }
  const fileScope = clip(facts.fileScope, 200)
  return { domains, fileScope: fileScope || null, tools: keep('tools', facts.tools, 12), apiKeys: keep('apiKeys', facts.apiKeys, 8), dropped }
}

export type Written = Record<DescribeLocaleKey, WrittenDescription>

export type SaveOutcome =
  | { status: 'drafted'; ok: boolean; missing: number; dropped: number; wrote: string[]; declarations: boolean }
  | { status: 'skipped'; reason: string }

const empty = (value: unknown) => (Array.isArray(value) ? value.length === 0 : !String(value ?? '').trim())

/** The text fields one language's draft writes on the Skill, by mode: all of them, or only the empty ones. */
function textData(fitted: FittedDescription, current: Skill, mode: DraftMode): Partial<Skill> {
  const data: Partial<Skill> = {}
  const text = { tagline: fitted.tagline, capabilities: fitted.capabilities, example: fitted.example, workflow: fitted.workflow, notes: fitted.notes }
  for (const [key, value] of Object.entries(text) as [keyof typeof text, (typeof text)[keyof typeof text]][]) {
    if (empty(value)) continue
    if (mode === 'rewrite' || empty(current[key])) Object.assign(data, { [key]: value })
  }
  // The display name is only ever filled in, never replaced: the owner chose it, or English carries it.
  if (fitted.name && empty(current.name)) data.name = fitted.name
  return data
}

/**
 * Write the draft: the Skill's text in four languages (zh-Hant follows zh-Hans through the
 * collection's hook), its API-key flag and runtime where empty, and the version's declarations
 * unless the version is already published (rule 2). In fill mode, text the owner has written
 * stays; in rewrite mode it is replaced, except the display name and the owner's field notes.
 */
export async function saveDescription(
  versionId: number,
  {
    requestedAt,
    material,
    facts,
    written,
    models,
  }: { requestedAt: string; material: Material; facts: Declarations; written: Written; models: string[] },
  deps: DescribeDeps = {},
): Promise<SaveOutcome> {
  const payload = await payloadOf(deps)
  const version = await loadVersion(payload, versionId)
  const info = version ? infoOf(version) : {}
  // A newer request replaced this one while it ran; that run writes the draft.
  if (!version || version.draftStatus !== 'pending' || info.requestedAt !== requestedAt) return { status: 'skipped', reason: 'superseded' }
  const mode: DraftMode = info.mode ?? 'rewrite'
  const skillId = skillIdOf(version)

  const fitted = Object.fromEntries(describeLocaleKeys.map((key) => [key, fitDescription(written[key])])) as Record<DescribeLocaleKey, FittedDescription>
  const verification = verifyWriting(
    Object.fromEntries(describeLocaleKeys.map((key) => [describeLocales[key], descriptionText(fitted[key])])),
    materialText(material),
  )
  const checked = checkDeclarations(facts, material, version.declarations?.domains ?? [])

  // zh-Hans first so its hook writes zh-Hant. Each language is read without fallback, so an
  // English text never counts as a filled-in Japanese one.
  const wrote: string[] = []
  for (const key of describeLocaleKeys) {
    const locale = describeLocales[key]
    const current = await payload.findByID({ collection: 'skills', id: skillId, locale, fallbackLocale: false, depth: 0 })
    const data = textData(fitted[key], current, mode)
    if (locale === 'en') {
      if (checked.apiKeys.length && !current.needsApiKey) data.needsApiKey = true
      if (checked.tools.length && empty(current.runtime)) data.runtime = checked.tools.slice(0, 8)
    }
    if (Object.keys(data).length === 0) continue
    await payload.update({ collection: 'skills', id: skillId, locale, data, depth: 0, context: { system: true } })
    wrote.push(locale)
  }

  const frozen = FROZEN_STATUSES.has(version.status)
  const declarations = frozen
    ? {}
    : {
        declarations: {
          domains: checked.domains,
          fileScope: mode === 'rewrite' || empty(version.declarations?.fileScope) ? checked.fileScope : version.declarations?.fileScope,
          tools: mode === 'rewrite' || empty(version.declarations?.tools) ? checked.tools : version.declarations?.tools,
          apiKeys: mode === 'rewrite' || empty(version.declarations?.apiKeys) ? checked.apiKeys : version.declarations?.apiKeys,
        },
      }
  await payload.update({
    collection: 'skill-versions',
    id: versionId,
    depth: 0,
    context: { system: true },
    data: {
      ...declarations,
      draftStatus: 'drafted',
      draftInfo: {
        requestedAt,
        mode,
        generatedAt: nowOf(deps).toISOString(),
        models: [...new Set(models)],
        promptVersions: [describeFactsPrompt.version, describeWritePrompt.version],
        wrote,
        declarations: !frozen,
        check: { ...verification, dropped: checked.dropped },
      } satisfies DraftInfo,
    },
  })
  return { status: 'drafted', ok: verification.ok, missing: verification.missing.length, dropped: checked.dropped.length, wrote, declarations: !frozen }
}

/** Drafts that are still waiting and were not touched for a while: for the sweep to queue again. */
export async function findWaitingDescribes(now: Date, limit = 25, deps: DescribeDeps = {}): Promise<number[]> {
  const payload = await payloadOf(deps)
  const { docs } = await payload.find({
    collection: 'skill-versions',
    where: {
      and: [{ draftStatus: { equals: 'pending' } }, { updatedAt: { less_than: new Date(now.getTime() - 15 * 60_000).toISOString() } }],
    },
    sort: 'updatedAt',
    limit,
    depth: 0,
    select: { draftStatus: true },
  })
  return docs.map((doc) => doc.id)
}
