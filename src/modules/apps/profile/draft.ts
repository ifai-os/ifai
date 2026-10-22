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
import type { App } from '@/payload-types'
import { errorMessage } from '@/modules/daily/collect/fetch'

import { slugify } from '../normalize'
import {
  profileFactsPrompt,
  profileLocales,
  profileWritePrompt,
  type CategoryChoice,
  type ProfileFacts,
  type ProfileLocaleKey,
  type WrittenProfile,
} from '../prompts/profile'
import { checkFacts, checkProfiles } from './check'
import { collectMaterial, materialText, ThinMaterialError, type Material } from './collect'
import type { FetchDeps } from './fetch'
import { findIcon, findShareImage, saveImage } from './images'
import { infoOf, requestDraft, type DraftInfo, type DraftReason, type DraftStatus } from './state'

/**
 * 资料草稿 (docs/specs/apps.md「后台」): website → material → facts and four profiles → checked
 * draft for the owner to review. Each stage is its own Inngest step (./jobs.ts). The draft's
 * state is on the app: `draftStatus` (pending → drafted | failed) and `draftInfo`.
 */

export type DraftDeps = FetchDeps & { ai?: Ai; now?: () => Date; payload?: Payload }

const payloadOf = async (deps: DraftDeps) => deps.payload ?? getPayload({ config })
const nowOf = (deps: DraftDeps) => deps.now?.() ?? new Date()

export const profileLocaleKeys = Object.keys(profileLocales) as ProfileLocaleKey[]

async function loadApp(payload: Payload, appId: number) {
  try {
    return await payload.findByID({ collection: 'apps', id: appId, depth: 0 })
  } catch {
    return null
  }
}

/** Set the draft state. `draftInfo` is replaced with `info`, so callers pass what to keep. */
async function setDraft(payload: Payload, appId: number, draftStatus: DraftStatus, info: DraftInfo) {
  await payload.update({ collection: 'apps', id: appId, data: { draftStatus, draftInfo: info }, depth: 0 })
}

export async function markWaiting(appId: number, reason: DraftReason, deps: DraftDeps = {}) {
  const payload = await payloadOf(deps)
  const app = await loadApp(payload, appId)
  if (!app || app.draftStatus !== 'pending') return
  await setDraft(payload, appId, 'pending', { ...infoOf(app), reason })
}

export async function markFailed(appId: number, reason: DraftReason, deps: DraftDeps = {}) {
  const payload = await payloadOf(deps)
  const app = await loadApp(payload, appId)
  if (!app || app.draftStatus !== 'pending') return
  await setDraft(payload, appId, 'failed', { ...infoOf(app), reason })
}

function reasonFor(error: ModelCallError): DraftReason {
  if (error instanceof ModelCallsDisabledError) return { code: 'switch-off', detail: error.message }
  if (error instanceof BudgetExceededError) return { code: 'budget', detail: error.message }
  if (error instanceof MissingApiKeyError) return { code: 'no-key', detail: error.message }
  return { code: 'model', detail: error.message }
}

export type Started =
  | { status: 'ready'; requestedAt: string }
  | { status: 'skipped'; reason: string }
  | { status: 'paused'; reason: DraftReason }

/** The app must still be waiting for this draft, and model calls must be possible today. */
export async function startDraft(appId: number, deps: DraftDeps = {}): Promise<Started> {
  const payload = await payloadOf(deps)
  const app = await loadApp(payload, appId)
  if (!app) return { status: 'skipped', reason: 'no such app' }
  if (app.draftStatus !== 'pending') return { status: 'skipped', reason: `draft is ${app.draftStatus ?? 'not requested'}` }
  const info = infoOf(app)

  // Check before fetching anything: a paused draft is retried by the sweep.
  const usage = await (deps.ai ?? defaultAi).usageToday()
  const reason: DraftReason | null = !usage.enabled
    ? reasonFor(new ModelCallsDisabledError())
    : usage.costUsd >= usage.budgetUsd
      ? reasonFor(new BudgetExceededError(usage.costUsd, usage.budgetUsd))
      : null
  if (reason) {
    await markWaiting(appId, reason, deps)
    return { status: 'paused', reason }
  }

  if (!info.requestedAt) {
    const requested = await requestDraft(payload, appId, { now: nowOf(deps) })
    return { status: 'ready', requestedAt: requested?.requestedAt ?? nowOf(deps).toISOString() }
  }
  return { status: 'ready', requestedAt: info.requestedAt }
}

export type Gathered =
  | { status: 'ready'; material: Material; categories: CategoryChoice[] }
  | { status: 'failed'; reason: DraftReason }
  | { status: 'skipped'; reason: string }

/** Fetch the website. A site that cannot be read fails the draft; the owner can retry or write it by hand. */
export async function gatherMaterial(appId: number, deps: DraftDeps = {}): Promise<Gathered> {
  const payload = await payloadOf(deps)
  const app = await loadApp(payload, appId)
  if (!app || app.draftStatus !== 'pending') return { status: 'skipped', reason: 'draft is no longer waiting' }

  let material: Material
  try {
    material = await collectMaterial(app.website, deps)
  } catch (error) {
    const reason: DraftReason =
      error instanceof ThinMaterialError ? { code: 'thin', detail: error.message } : { code: 'fetch', detail: errorMessage(error) }
    await markFailed(appId, reason, deps)
    return { status: 'failed', reason }
  }

  const { docs } = await payload.find({ collection: 'app-categories', locale: 'en', sort: 'order', pagination: false, depth: 0 })
  return { status: 'ready', material, categories: docs.map(({ slug, name }) => ({ slug, name })) }
}

export type ModelStep<T> =
  | { status: 'done'; output: T; model: string }
  | { status: 'paused'; reason: DraftReason }
  | { status: 'blocked'; reason: DraftReason }

/**
 * One model call, its failures by kind (as in the daily jobs): a call running elsewhere is
 * retried after a pause; a closed switch, spent budget or missing key leaves the draft waiting;
 * a call that failed three times fails the draft.
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

/** The facts call. `variant` is the request time, so each new request is a new call and retries are free. */
export function suggestFacts(appId: number, material: Material, categories: CategoryChoice[], variant: string, deps: DraftDeps = {}) {
  return modelStep(() =>
    (deps.ai ?? defaultAi).object({
      purpose: 'profile',
      subject: `apps:${appId}`,
      variant,
      instructions: profileFactsPrompt.instructions,
      prompt: profileFactsPrompt.build(material, categories),
      schema: profileFactsPrompt.schema,
      temperature: 0,
      maxOutputTokens: 1200,
    }),
  )
}

export function writeProfile(appId: number, material: Material, key: ProfileLocaleKey, variant: string, deps: DraftDeps = {}) {
  return modelStep(() =>
    (deps.ai ?? defaultAi).object({
      purpose: 'profile',
      subject: `apps:${appId}`,
      variant,
      instructions: profileWritePrompt.instructions(key),
      prompt: profileWritePrompt.build(material),
      schema: profileWritePrompt.schema,
      temperature: 0.3,
      maxOutputTokens: 6000,
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

/** The model's profile within the collection's limits: 120-character summary, 8 features, 10 questions, 8 tags. */
export function fitProfile(profile: WrittenProfile) {
  const tags: string[] = []
  for (const raw of profile.tags) {
    const tag = raw.replace(/^#+/, '').trim()
    if (tag && !tags.includes(tag)) tags.push(tag)
  }
  return {
    tagline: clip(profile.tagline, 120),
    description: profile.description.trim(),
    features: profile.features
      .map((feature) => ({ title: feature.title.trim(), detail: feature.detail.trim() }))
      .filter((feature) => feature.title)
      .slice(0, 8),
    faqs: profile.faqs
      .map((faq) => ({ question: faq.question.trim(), answer: faq.answer.trim() }))
      .filter((faq) => faq.question && faq.answer)
      .slice(0, 10),
    tags: tags.slice(0, 8),
  }
}

async function uniqueSlug(payload: Payload, base: string, appId: number): Promise<string> {
  for (let n = 1; n < 50; n++) {
    const slug = n === 1 ? base : `${base.slice(0, 60)}-${n}`
    const { totalDocs } = await payload.count({
      collection: 'apps',
      where: { and: [{ slug: { equals: slug } }, { id: { not_equals: appId } }] },
    })
    if (totalDocs === 0) return slug
  }
  return `${base.slice(0, 50)}-${appId}`
}

export type Written = Record<ProfileLocaleKey, WrittenProfile>

export type SaveOutcome = { status: 'drafted'; ok: boolean; missing: number; dropped: number } | { status: 'skipped'; reason: string }

/**
 * Write the draft into the app: the profile in four languages (zh-Hant follows zh-Hans through
 * the collection's hook) and, only where the owner has not filled them, category, pricing,
 * platforms and developer. Regenerating rewrites the profile text and nothing else.
 */
export async function saveDraft(
  appId: number,
  {
    requestedAt,
    material,
    categories,
    facts,
    written,
    models,
  }: { requestedAt: string; material: Material; categories: CategoryChoice[]; facts: ProfileFacts; written: Written; models: string[] },
  deps: DraftDeps = {},
): Promise<SaveOutcome> {
  const payload = await payloadOf(deps)
  const app = await loadApp(payload, appId)
  const info = app ? infoOf(app) : {}
  // A newer request replaced this one while it ran; that run writes the draft.
  if (!app || app.draftStatus !== 'pending' || info.requestedAt !== requestedAt) return { status: 'skipped', reason: 'superseded' }

  const text = materialText(material)
  const checked = checkFacts(facts, text, categories.map((category) => category.slug))
  const profiles = Object.fromEntries(profileLocaleKeys.map((key) => [key, fitProfile(written[key])])) as Record<
    ProfileLocaleKey,
    ReturnType<typeof fitProfile>
  >
  const verification = checkProfiles(
    Object.fromEntries(profileLocaleKeys.map((key) => [profileLocales[key], profiles[key]])),
    text,
  )

  const { docs: categoryDocs } = await payload.find({ collection: 'app-categories', pagination: false, depth: 0 })
  const categoryIds = checked.categories
    .map((slug) => categoryDocs.find((category) => category.slug === slug)?.id)
    .filter((id) => id !== undefined)

  const filled: Partial<App> = {}
  if (!app.primaryCategory && categoryIds.length > 0) {
    filled.primaryCategory = categoryIds[0]
    if (!app.secondaryCategories?.length && categoryIds.length > 1) filled.secondaryCategories = categoryIds.slice(1, 3)
  }
  if (!app.pricing && checked.pricing) filled.pricing = checked.pricing
  if (!app.platforms?.length && checked.platforms.length > 0) filled.platforms = checked.platforms
  if (!app.developer && checked.developer) filled.developer = checked.developer
  if (info.nameFromDomain && checked.name) {
    filled.name = checked.name
    const slug = slugify(checked.name)
    if (slug && app.status !== 'published') filled.slug = await uniqueSlug(payload, slug, appId)
  }

  // zh-Hans first so its hook writes zh-Hant; the status goes with the last write.
  await payload.update({ collection: 'apps', id: appId, locale: 'zh-Hans', data: profiles.zhHans, depth: 0 })
  await payload.update({ collection: 'apps', id: appId, locale: 'en', data: { ...profiles.en, ...filled }, depth: 0 })
  await payload.update({ collection: 'apps', id: appId, locale: 'ja', data: profiles.ja, depth: 0 })
  await payload.update({
    collection: 'apps',
    id: appId,
    locale: 'ko',
    depth: 0,
    data: {
      ...profiles.ko,
      draftStatus: 'drafted',
      draftInfo: {
        requestedAt,
        // Still named after the domain when the website gave no name to use.
        ...(info.nameFromDomain && !checked.name ? { nameFromDomain: true } : {}),
        generatedAt: nowOf(deps).toISOString(),
        models: [...new Set(models)],
        promptVersions: [profileFactsPrompt.version, profileWritePrompt.version],
        material: {
          url: material.url,
          title: material.title,
          description: material.description,
          pricingUrl: material.pricing?.url ?? null,
          chars: text.length,
        },
        check: { ...verification, dropped: checked.dropped },
      } satisfies DraftInfo,
    },
  })
  return { status: 'drafted', ok: verification.ok, missing: verification.missing.length, dropped: checked.dropped.length }
}

/** Icon and share image, only where the app has none yet; what could not be found is noted for the owner. */
export async function addImages(appId: number, material: Material, deps: DraftDeps = {}) {
  const payload = await payloadOf(deps)
  const app = await loadApp(payload, appId)
  if (!app || app.draftStatus !== 'drafted') return { status: 'skipped' as const }

  const notes: NonNullable<DraftInfo['images']> = {}
  const data: Partial<App> = {}
  if (!app.logo) {
    const icon = await findIcon(material, deps)
    if ('image' in icon) {
      data.logo = await saveImage(payload, icon.image, { alt: `${app.name} logo`, name: `${app.slug}-icon` })
      notes.logo = icon.url
    } else {
      notes.logo = `not found: ${icon.reason}`
    }
  }
  if (!app.screenshot) {
    const share = await findShareImage(material, deps)
    if ('image' in share) {
      data.screenshot = await saveImage(payload, share.image, { alt: `${app.name} website image`, name: `${app.slug}-share` })
      notes.screenshot = share.url
    } else {
      notes.screenshot = `not found: ${share.reason}`
    }
  }
  if (Object.keys(notes).length === 0) return { status: 'kept' as const }
  await payload.update({
    collection: 'apps',
    id: appId,
    depth: 0,
    data: { ...data, draftInfo: { ...infoOf(app), images: notes } satisfies DraftInfo },
  })
  return { status: 'done' as const, logo: Boolean(data.logo), screenshot: Boolean(data.screenshot) }
}

/** Drafts that are still waiting and were not touched for a while: for the sweep to queue again. */
export async function findWaitingDrafts(now: Date, limit = 25, deps: DraftDeps = {}): Promise<number[]> {
  const payload = await payloadOf(deps)
  const { docs } = await payload.find({
    collection: 'apps',
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
