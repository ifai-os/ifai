import config from '@payload-config'
import { getPayload } from 'payload'
import { cache } from 'react'

import type { Locale } from '@/i18n/config'
import { cached } from '@/lib/data-cache'
import { inAnyLanguage, inReaderLanguage, type InLanguage, type Localized } from '@/lib/i18n/localized'
import { namesFirst } from '@/modules/search/rank'
import type { AgentHost, Skill, SkillVersion } from '@/payload-types'

import { skillCategories, type SkillCategory } from '../categories'
import { compareVersions } from '../normalize'
import { CHECK_KEYS, type CheckKey } from '../scan/scan'
import { skillsCacheTag } from './cache'
import {
  effectiveCurrent,
  filterSkills,
  hotTags,
  isNewThisWeek,
  mostInstalled,
  orderSkills,
  pickFeatured,
  risePercent,
  searchable,
  weeklyRisers,
  type SkillCandidate,
} from './order'
import type { SkillListParams } from './list-params'

/**
 * Public reads for the Skills pages (docs/specs/resources.md「页面与路由」). Published Skills and
 * their public versions are read in every language at once and cached under `skillsCacheTag`
 * until a Skill, version, host or tag changes (./cache.ts). The list is small (dozens to
 * hundreds), so filters, search and sorts run in memory on the cached candidates.
 */

export const skillsPerPage = 30
const hotTagsShown = 8
const risersShown = 3
const rankShown = 5
const relatedPool = 6
export const homeSkillsShown = 4

export type ScanBadge = 'passed' | 'reviewed'

export type TagRef = { slug: string; name: InLanguage<string> }

export type SkillAuthor = { name: string; url: string | null; official: boolean }

export type SkillListItem = {
  id: number
  slug: string
  name: InLanguage<string>
  tagline: InLanguage<string> | null
  category: SkillCategory
  needsApiKey: boolean
  certified: boolean
  author: SkillAuthor
  installs: number
  /** The current version: its number, when it was published and what the scan said. */
  version: string | null
  updatedAt: string | null
  scan: ScanBadge | null
}

export type SkillListPage = {
  skills: SkillListItem[]
  total: number
  page: number
  pages: number
}

export type SkillsOverview = {
  total: number
  newThisWeek: number
  categories: { slug: SkillCategory; count: number }[]
  featured: SkillListItem | null
  hotTags: TagRef[]
  /** 本周飙升, with the rise over the week before in percent (null: no installs that week). */
  risers: { skill: SkillListItem; rise: number | null }[]
  /** 安装榜. */
  mostInstalled: SkillListItem[]
}

export type CompatStatus = NonNullable<SkillVersion['compatibility']>[number]['status']

export type HostOption = {
  slug: string
  name: string
  logo: string | null
  compat: CompatStatus
  compatNote: string | null
}

export type VersionSummary = {
  version: string
  status: 'published' | 'deprecated' | 'withdrawn'
  publishedAt: string | null
  changelog: InLanguage<string> | null
  withdrawReason: string | null
}

export type VersionDetail = VersionSummary & {
  id: number
  sha256: string | null
  size: number | null
  sourceCommit: string | null
  files: { path: string; size: number }[]
  skillMd: string | null
  scanStatus: SkillVersion['scanStatus']
  scannedAt: string | null
  /** Only the checks this site knows how to name; the back office keeps the rest. */
  checks: { key: CheckKey; result: 'pass' | 'warn' | 'block' }[]
  domains: string[]
  fileScope: string | null
  tools: string[]
  apiKeys: string[]
  hosts: HostOption[]
}

export type SkillDetail = SkillListItem & {
  status: 'published' | 'delisted'
  delistReason: string | null
  repository: string | null
  license: string | null
  runtime: string[]
  tags: TagRef[]
  capabilities: InLanguage<{ title: string; detail?: string | null }[]> | null
  example: InLanguage<string> | null
  workflow: InLanguage<{ title: string; detail?: string | null }[]> | null
  notes: InLanguage<string> | null
  ownerNotes: InLanguage<string> | null
  /** Newest first. */
  versions: VersionSummary[]
  currentVersion: string | null
  /** The version this page shows: the current one, or the one in a fixed link. */
  shown: VersionDetail | null
  /** A newer version that is still being checked or did not pass; the shown one stays installable. */
  pending: { version: string; state: 'scanning' | 'blocked' } | null
  related: SkillListItem[]
}

type Ref = number | { id: number } | null | undefined

function idOf(ref: Ref): number | null {
  if (typeof ref === 'number') return ref
  return ref && typeof ref === 'object' ? ref.id : null
}

/** A Skill as Payload returns it with `locale: 'all'`. */
type RawSkill = Omit<Skill, 'name' | 'tagline' | 'capabilities' | 'example' | 'workflow' | 'notes' | 'ownerNotes'> & {
  name: Localized<string>
  tagline?: Localized<string>
  capabilities?: Localized<NonNullable<Skill['capabilities']>>
  example?: Localized<string>
  workflow?: Localized<NonNullable<Skill['workflow']>>
  notes?: Localized<string>
  ownerNotes?: Localized<string>
}

type RawVersion = Omit<SkillVersion, 'changelog'> & { changelog?: Localized<string> }

type RawTag = { id: number; slug: string; name: Localized<string> }

const cacheOptions = { tags: [skillsCacheTag], revalidate: 3600 }

async function payload() {
  return getPayload({ config })
}

const publicVersionStatuses = ['published', 'deprecated', 'withdrawn'] as const

const listSelect = {
  name: true,
  slug: true,
  tagline: true,
  category: true,
  tags: true,
  author: true,
  needsApiKey: true,
  certified: true,
  featured: true,
  stats: true,
  currentVersion: true,
} as const

const versionListSelect = { skill: true, version: true, status: true, publishedAt: true, scanStatus: true } as const

/** Every published Skill, its public versions' dates and the tags, as read for the list. */
const loadCatalog = cached(
  async () => {
    const client = await payload()
    const [skills, versions, tags] = await Promise.all([
      client.find({
        collection: 'skills',
        where: { status: { equals: 'published' } },
        pagination: false,
        locale: 'all',
        depth: 0,
        select: listSelect,
        overrideAccess: false,
      }),
      client.find({
        collection: 'skill-versions',
        where: { status: { in: ['published', 'deprecated'] } },
        pagination: false,
        depth: 0,
        select: versionListSelect,
        overrideAccess: false,
      }),
      client.find({ collection: 'skill-tags', pagination: false, locale: 'all', depth: 0, select: { slug: true, name: true }, overrideAccess: false }),
    ])
    return {
      skills: skills.docs as unknown as RawSkill[],
      versions: versions.docs as unknown as Pick<SkillVersion, 'id' | 'skill' | 'version' | 'status' | 'publishedAt' | 'scanStatus'>[],
      tags: tags.docs as unknown as RawTag[],
    }
  },
  ['skills-catalog'],
  cacheOptions,
)

type Catalog = Awaited<ReturnType<typeof loadCatalog>>

type Entry = SkillCandidate & {
  featured: boolean
  /** Its slug and its name in every language, for the site search's ordering. */
  names: string[]
  item: (locale: Locale) => SkillListItem
}

const isCheckKey = (key: string): key is CheckKey => (CHECK_KEYS as string[]).includes(key)

function scanBadge(status: SkillVersion['scanStatus'] | undefined): ScanBadge | null {
  return status === 'passed' ? 'passed' : status === 'warnings' ? 'reviewed' : null
}

function authorOf(skill: Pick<Skill, 'author'>): SkillAuthor {
  return { name: skill.author?.name?.trim() ?? '', url: skill.author?.url || null, official: Boolean(skill.author?.official) }
}

function tagRefs(ids: Ref[] | null | undefined, tags: Map<number, RawTag>, locale: Locale): TagRef[] {
  return (ids ?? [])
    .map((ref) => tags.get(idOf(ref) ?? -1))
    .filter((tag) => tag !== undefined)
    .map((tag) => ({ slug: tag.slug, name: inAnyLanguage(tag.name, locale) ?? { value: tag.slug, lang: 'en' } }))
}

function nameOf(skill: Pick<RawSkill, 'name' | 'slug'>, locale: Locale): InLanguage<string> {
  // The name is required in English; the slug only keeps a broken record from crashing the page.
  return inAnyLanguage(skill.name, locale) ?? { value: skill.slug, lang: 'en' }
}

function toItem(skill: RawSkill, current: Catalog['versions'][number] | undefined, locale: Locale): SkillListItem {
  return {
    id: skill.id,
    slug: skill.slug,
    name: nameOf(skill, locale),
    tagline: inReaderLanguage(skill.tagline, locale),
    category: skill.category,
    needsApiKey: Boolean(skill.needsApiKey),
    certified: Boolean(skill.certified),
    author: authorOf(skill),
    installs: skill.stats?.installs ?? 0,
    version: current?.version ?? null,
    updatedAt: current?.publishedAt ?? null,
    scan: scanBadge(current?.scanStatus),
  }
}

/** The catalog as list candidates; only Skills with a current published version are listed. */
function entries(catalog: Catalog): Entry[] {
  const tags = new Map(catalog.tags.map((tag) => [tag.id, tag]))
  const bySkill = new Map<number, Catalog['versions']>()
  for (const version of catalog.versions) {
    const skillId = idOf(version.skill)
    if (skillId === null) continue
    bySkill.set(skillId, [...(bySkill.get(skillId) ?? []), version])
  }

  return catalog.skills.flatMap((skill) => {
    const versions = bySkill.get(skill.id) ?? []
    const current = effectiveCurrent(idOf(skill.currentVersion), versions)
    if (!current) return []
    const listedAt = versions.map((version) => version.publishedAt).filter((date) => typeof date === 'string').sort()[0] ?? null
    const skillTags = (skill.tags ?? []).map((ref) => tags.get(idOf(ref) ?? -1)).filter((tag) => tag !== undefined)
    const words = [
      skill.slug,
      ...Object.values(skill.name ?? {}),
      ...Object.values(skill.tagline ?? {}),
      ...skillTags.flatMap((tag) => Object.values(tag.name ?? {})),
    ]
    return [
      {
        id: skill.id,
        category: skill.category,
        // Joined with a character no search contains, so a search never matches across two fields.
        searchText: searchable(words.filter(Boolean).join('\u0001')),
        tagSlugs: skillTags.map((tag) => tag.slug),
        author: authorOf(skill).name,
        needsApiKey: Boolean(skill.needsApiKey),
        certified: Boolean(skill.certified),
        featured: Boolean(skill.featured),
        names: [skill.slug, ...Object.values(skill.name ?? {}).filter((name) => typeof name === 'string')],
        installs: skill.stats?.installs ?? 0,
        installs7d: skill.stats?.installs7d ?? 0,
        installsPrev7d: skill.stats?.installsPrev7d ?? 0,
        listedAt,
        updatedAt: current.publishedAt ?? null,
        item: (locale: Locale) => toItem(skill, current, locale),
      },
    ]
  })
}

const getEntries = cache(async () => {
  const catalog = await loadCatalog()
  return { catalog, entries: entries(catalog) }
})

/** One page of the list for the filters in the address. */
export async function listSkills(params: Omit<SkillListParams, 'page'> & { page: number; locale: Locale }): Promise<SkillListPage> {
  const { entries: all } = await getEntries()
  const ordered = orderSkills(filterSkills(all, params), params.sort)
  const start = (params.page - 1) * skillsPerPage
  return {
    skills: ordered.slice(start, start + skillsPerPage).map((entry) => entry.item(params.locale)),
    total: ordered.length,
    page: params.page,
    pages: Math.ceil(ordered.length / skillsPerPage),
  }
}

/**
 * The site search's Skills (docs/specs/search.md): the list's own search, the ones named exactly
 * so first, then in the list's default order; `offset` and `limit` pick the page shown.
 */
export async function searchSkills({
  locale,
  q,
  offset,
  limit,
}: {
  locale: Locale
  q: string
  offset: number
  limit: number
}): Promise<{ skills: SkillListItem[]; total: number }> {
  const { entries: all } = await getEntries()
  const filter = { category: null, q, tag: '', author: '', noKey: false, certified: false }
  const ordered = namesFirst(orderSkills(filterSkills(all, filter), 'default'), q, (entry) => entry.names)
  return { skills: ordered.slice(offset, offset + limit).map((entry) => entry.item(locale)), total: ordered.length }
}

/** The list's header and side column: counts, 本周精选, 本周飙升, 安装榜 and 热门标签. */
export async function getSkillsOverview(locale: Locale): Promise<SkillsOverview> {
  const { catalog, entries: all } = await getEntries()
  const now = new Date()
  const tags = new Map(catalog.tags.map((tag) => [tag.slug, tag]))
  return {
    total: all.length,
    newThisWeek: all.filter((entry) => isNewThisWeek(entry, now)).length,
    categories: skillCategories.map((slug) => ({ slug, count: all.filter((entry) => entry.category === slug).length })),
    featured: pickFeatured(all)?.item(locale) ?? null,
    hotTags: hotTags(all, hotTagsShown)
      .map((slug) => tags.get(slug))
      .filter((tag) => tag !== undefined)
      .map((tag) => ({ slug: tag.slug, name: inAnyLanguage(tag.name, locale) ?? { value: tag.slug, lang: 'en' } })),
    risers: weeklyRisers(all, risersShown).map((entry) => ({ skill: entry.item(locale), rise: risePercent(entry) })),
    mostInstalled: mostInstalled(all, rankShown).map((entry) => entry.item(locale)),
  }
}

/** A tag's name in the reader's language, for「标签：…」above a filtered list; null for an unknown tag. */
export async function getTag(slug: string, locale: Locale): Promise<TagRef | null> {
  const { catalog } = await getEntries()
  const tag = catalog.tags.find((item) => item.slug === slug)
  return tag ? { slug: tag.slug, name: inAnyLanguage(tag.name, locale) ?? { value: tag.slug, lang: 'en' } } : null
}

/** The home page: 本周精选 for「新上架 Skill」and the newest few for「新上架 Skills」. */
export async function getHomeSkills(locale: Locale): Promise<{ featured: SkillListItem | null; newest: SkillListItem[] }> {
  const { entries: all } = await getEntries()
  return {
    featured: pickFeatured(all)?.item(locale) ?? null,
    newest: orderSkills(all, 'newest')
      .slice(0, homeSkillsShown)
      .map((entry) => entry.item(locale)),
  }
}

/** The member's saved Skills for「我的收藏」, in the order given (newest save first); unpublished ones are left out. */
export async function getSavedSkills(ids: number[], locale: Locale): Promise<SkillListItem[]> {
  const { entries: all } = await getEntries()
  const byId = new Map(all.map((entry) => [entry.id, entry]))
  return ids.flatMap((id) => {
    const entry = byId.get(id)
    return entry ? [entry.item(locale)] : []
  })
}

const detailSelect = { ...listSelect, status: true, delistReason: true, repository: true, license: true, runtime: true, capabilities: true, example: true, workflow: true, notes: true, ownerNotes: true } as const

/**
 * A published or delisted Skill by slug. Delisted Skills keep their page (it says why), so this
 * reads past the visitor's access rules and selects only what the page shows.
 */
const findSkill = cached(
  async (slug: string) => {
    const { docs } = await (await payload()).find({
      collection: 'skills',
      where: { and: [{ slug: { equals: slug } }, { status: { in: ['published', 'delisted'] } }] },
      limit: 1,
      locale: 'all',
      depth: 0,
      select: detailSelect,
      overrideAccess: true,
    })
    return (docs[0] as unknown as RawSkill | undefined) ?? null
  },
  ['skills-detail'],
  cacheOptions,
)

/** A Skill's public versions with everything a version page shows (not the back-office findings). */
const findVersions = cached(
  async (skillId: number) => {
    const { docs } = await (await payload()).find({
      collection: 'skill-versions',
      where: { and: [{ skill: { equals: skillId } }, { status: { in: [...publicVersionStatuses] } }] },
      pagination: false,
      locale: 'all',
      depth: 0,
      select: {
        version: true,
        status: true,
        publishedAt: true,
        withdrawReason: true,
        changelog: true,
        sha256: true,
        filesize: true,
        sourceCommit: true,
        files: true,
        skillMd: true,
        scanStatus: true,
        scannedAt: true,
        checks: true,
        declarations: true,
        compatibility: true,
      },
      overrideAccess: false,
    })
    return (docs as unknown as RawVersion[]).sort((a, b) => compareVersions(b.version, a.version))
  },
  ['skills-versions'],
  cacheOptions,
)

/** The newest version of any status, only its number and state: is a newer one being checked? */
const findNewest = cached(
  async (skillId: number) => {
    const { docs } = await (await payload()).find({
      collection: 'skill-versions',
      where: { skill: { equals: skillId } },
      pagination: false,
      depth: 0,
      select: { version: true, status: true, scanStatus: true },
      overrideAccess: true,
    })
    return docs.map((doc) => ({ version: doc.version, status: doc.status, scanStatus: doc.scanStatus })).sort((a, b) => compareVersions(b.version, a.version))[0] ?? null
  },
  ['skills-newest-version'],
  cacheOptions,
)

const findHosts = cached(
  async () => {
    const { docs } = await (await payload()).find({
      collection: 'agent-hosts',
      where: { enabled: { equals: true } },
      sort: 'order',
      pagination: false,
      locale: 'en',
      depth: 1,
      populate: { media: { url: true } },
      overrideAccess: false,
    })
    return docs as AgentHost[]
  },
  ['skills-hosts'],
  cacheOptions,
)

/** The hosts shown in the install panel, with install notes, for install.md. */
export async function getInstallHosts(): Promise<AgentHost[]> {
  return findHosts()
}

/** A host in the install guide: where its Skills go, and the owner's notes in the reader's language. */
export type GuideHost = {
  slug: string
  name: string
  logo: string | null
  website: string | null
  globalDir: string | null
  projectDir: string | null
  instructions: InLanguage<string> | null
}

const findGuideHosts = cached(
  async () => {
    const { docs } = await (await payload()).find({
      collection: 'agent-hosts',
      where: { enabled: { equals: true } },
      sort: 'order',
      pagination: false,
      locale: 'all',
      depth: 1,
      populate: { media: { url: true } },
      overrideAccess: false,
    })
    return docs as unknown as (Omit<AgentHost, 'instructions'> & { instructions?: Localized<string> })[]
  },
  ['skills-guide-hosts'],
  cacheOptions,
)

/** The hosts of the install panel for the install guide, in the panel's order. */
export async function getGuideHosts(locale: Locale): Promise<GuideHost[]> {
  return (await findGuideHosts()).map((host) => ({
    slug: host.slug,
    name: host.name,
    logo: host.logo && typeof host.logo === 'object' ? host.logo.url || null : null,
    website: host.website?.trim() || null,
    globalDir: host.globalDir?.trim() || null,
    projectDir: host.projectDir?.trim() || null,
    instructions: inReaderLanguage(host.instructions, locale),
  }))
}

function summary(version: RawVersion, locale: Locale): VersionSummary {
  return {
    version: version.version,
    status: version.status as VersionSummary['status'],
    publishedAt: version.publishedAt ?? null,
    changelog: inReaderLanguage(version.changelog, locale),
    withdrawReason: version.status === 'withdrawn' ? version.withdrawReason?.trim() || null : null,
  }
}

function hostOptions(version: RawVersion, hosts: AgentHost[]): HostOption[] {
  const records = new Map((version.compatibility ?? []).map((row) => [idOf(row.host), row]))
  return hosts.map((host) => {
    const record = records.get(host.id)
    const logo = host.logo && typeof host.logo === 'object' ? host.logo.url || null : null
    return { slug: host.slug, name: host.name, logo, compat: record?.status ?? 'untested', compatNote: record?.note?.trim() || null }
  })
}

function detail(version: RawVersion, hosts: AgentHost[], locale: Locale): VersionDetail {
  return {
    ...summary(version, locale),
    id: version.id,
    sha256: version.sha256 ?? null,
    size: version.filesize ?? null,
    sourceCommit: version.sourceCommit ?? null,
    files: (version.files ?? []).map((file) => ({ path: file.path, size: file.size ?? 0 })),
    skillMd: version.skillMd ?? null,
    scanStatus: version.scanStatus,
    scannedAt: version.scannedAt ?? null,
    checks: (version.checks ?? []).flatMap((check) => (isCheckKey(check.key) ? [{ key: check.key, result: check.result }] : [])),
    domains: version.declarations?.domains ?? [],
    fileScope: version.declarations?.fileScope?.trim() || null,
    tools: version.declarations?.tools ?? [],
    apiKeys: version.declarations?.apiKeys ?? [],
    hosts: hostOptions(version, hosts),
  }
}

/** Same category, most installed first, for「相关 Skill」. */
async function findRelated(skillId: number, category: SkillCategory, locale: Locale): Promise<SkillListItem[]> {
  const { entries: all } = await getEntries()
  return orderSkills(
    all.filter((entry) => entry.category === category && entry.id !== skillId),
    'installs',
  )
    .slice(0, relatedPool)
    .map((entry) => entry.item(locale))
}

/**
 * A Skill's page, showing its current version or, with `version`, that one (a fixed link).
 * Null when there is no such Skill, or no such public version of it.
 */
export const getSkill = cache(async (slug: string, locale: Locale, version?: string): Promise<SkillDetail | null> => {
  const skill = await findSkill(slug)
  if (!skill) return null
  const [versions, hosts, newest, related, catalog] = await Promise.all([
    findVersions(skill.id),
    findHosts(),
    findNewest(skill.id),
    findRelated(skill.id, skill.category, locale),
    loadCatalog(),
  ])
  const current = effectiveCurrent(idOf(skill.currentVersion), versions)
  const shown = version ? versions.find((item) => item.version === version) : current
  if (version && !shown) return null
  const tags = new Map(catalog.tags.map((tag) => [tag.id, tag]))
  const pendingState =
    newest && current && compareVersions(newest.version, current.version) > 0
      ? newest.scanStatus === 'blocked'
        ? 'blocked'
        : newest.status === 'scanning' || newest.status === 'in_review'
          ? 'scanning'
          : null
      : null

  const item = toItem(skill, current ? { ...current, skill: skill.id } : undefined, locale)
  return {
    ...item,
    installs: skill.stats?.installs ?? 0,
    status: skill.status === 'delisted' ? 'delisted' : 'published',
    delistReason: skill.status === 'delisted' ? skill.delistReason?.trim() || null : null,
    repository: skill.repository || null,
    license: skill.license?.trim() || null,
    runtime: skill.runtime ?? [],
    tags: tagRefs(skill.tags, tags, locale),
    capabilities: inReaderLanguage(skill.capabilities, locale),
    example: inReaderLanguage(skill.example, locale),
    workflow: inReaderLanguage(skill.workflow, locale),
    notes: inReaderLanguage(skill.notes, locale),
    ownerNotes: inReaderLanguage(skill.ownerNotes, locale),
    versions: versions.map((item) => summary(item, locale)),
    currentVersion: current?.version ?? null,
    shown: shown ? detail(shown, hosts, locale) : null,
    pending: pendingState && newest ? { version: newest.version, state: pendingState } : null,
    related,
  }
})

export type InstallTarget = {
  skillId: number
  versionId: number
  slug: string
  version: string
  current: string | null
  filename: string
  name: string
  sha256: string
  size: number | null
  license: string | null
  needsApiKey: boolean
  apiKeys: string[]
  tools: string[]
  domains: string[]
  runtime: string[]
}

/**
 * What install.md and the Zip route need, for a published Skill's current version or a named
 * one. Only published and deprecated versions install; withdrawn ones, delisted Skills and
 * versions without a Zip answer null.
 */
export async function getInstallTarget(slug: string, version?: string): Promise<InstallTarget | null> {
  const skill = await findSkill(slug)
  if (!skill || skill.status !== 'published') return null
  const versions = await findVersions(skill.id)
  const current = effectiveCurrent(idOf(skill.currentVersion), versions)
  const target = version ? versions.find((item) => item.version === version) : current
  if (!target || (target.status !== 'published' && target.status !== 'deprecated') || !target.sha256) return null
  const filename = await getVersionFilename(target.id)
  if (!filename) return null
  return {
    skillId: skill.id,
    versionId: target.id,
    slug: skill.slug,
    version: target.version,
    current: current && current.version !== target.version ? current.version : null,
    filename,
    name: inAnyLanguage(skill.name, 'en')?.value ?? skill.slug,
    sha256: target.sha256,
    size: target.filesize ?? null,
    license: skill.license?.trim() || null,
    needsApiKey: Boolean(skill.needsApiKey),
    apiKeys: target.declarations?.apiKeys ?? [],
    tools: target.declarations?.tools ?? [],
    domains: target.declarations?.domains ?? [],
    runtime: skill.runtime ?? [],
  }
}

/** The stored Zip's file name, which Payload's file route serves it under. */
export const getVersionFilename = cached(
  async (versionId: number) => {
    const doc = await (await payload()).findByID({
      collection: 'skill-versions',
      id: versionId,
      depth: 0,
      select: { filename: true },
      overrideAccess: false,
      disableErrors: true,
    })
    return doc?.filename ?? null
  },
  ['skills-zip-filename'],
  cacheOptions,
)

/** Whether a Skill can be installed through the copy button: published, with an installable version. */
export async function isInstallable(slug: string, version: string): Promise<{ skillId: number; versionId: number } | null> {
  const target = await getInstallTarget(slug, version)
  return target ? { skillId: target.skillId, versionId: target.versionId } : null
}

