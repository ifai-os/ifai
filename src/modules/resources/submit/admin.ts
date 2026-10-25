import type { CollectionAfterChangeHook, Payload, PayloadRequest } from 'payload'

import { keepingRequest } from '@/lib/i18n/hant-sync'

import type { Skill, SkillSubmission } from '@/payload-types'

import { skillCategories, type SkillCategory } from '../categories'
import { parseRepositoryUrl } from '../import/github'
import { queueImport } from '../import/queue'
import { freeSlug, sameSource, skillSeed } from './convert'

/**
 * The back office's side of Skill submissions (docs/specs/resources.md, «后台» 1 and 5): the「处理」
 * panel's state and its action, and the hook that marks submissions listed when their Skill goes live.
 */

export type HandlingSkill = { id: number; name: string; slug: string; status: Skill['status'] }

export type HandlingState = {
  status: SkillSubmission['status']
  /** The address is a GitHub repository, so it can be imported. */
  github: boolean
  /** The Skill under「导入为」. */
  linked: HandlingSkill | null
  /** Other Skills from the same repository and folder, published first. */
  sameSource: HandlingSkill[]
}

const skillFields = { name: true, slug: true, status: true, repository: true } as const

function handlingSkill(skill: Pick<Skill, 'id' | 'name' | 'slug' | 'status'>): HandlingSkill {
  return { id: skill.id, name: skill.name, slug: skill.slug, status: skill.status }
}

function relationId(value: unknown): number | null {
  if (typeof value === 'number') return value
  return value && typeof value === 'object' && 'id' in value && typeof value.id === 'number' ? value.id : null
}

async function skillsFromSource(payload: Payload, repository: string, req?: PayloadRequest): Promise<HandlingSkill[]> {
  const ref = parseRepositoryUrl(repository)
  if (!ref) return []
  const { docs } = await payload.find({
    collection: 'skills',
    where: { repository: { contains: `github.com/${ref.owner}/${ref.repo}` } },
    select: skillFields,
    limit: 50,
    depth: 0,
    req,
  })
  return docs
    .filter((skill) => sameSource(skill.repository ?? '', repository))
    .map(handlingSkill)
    .sort((a, b) => Number(b.status === 'published') - Number(a.status === 'published'))
}

/** What the「处理」panel shows for one submission; null when there is no such submission. */
export async function handlingState(payload: Payload, id: number): Promise<HandlingState | null> {
  const submission = await payload.findByID({ collection: 'skill-submissions', id, depth: 0, disableErrors: true })
  if (!submission) return null
  const linkedId = relationId(submission.skill)
  const [linked, same] = await Promise.all([
    linkedId ? payload.findByID({ collection: 'skills', id: linkedId, select: skillFields, depth: 0, disableErrors: true }) : null,
    skillsFromSource(payload, submission.repository),
  ])
  return {
    status: submission.status,
    github: Boolean(parseRepositoryUrl(submission.repository)),
    linked: linked ? handlingSkill(linked) : null,
    sameSource: same.filter((skill) => skill.id !== linkedId),
  }
}

export type ConvertResult =
  | { ok: true; skillId: number; created: boolean; listed: boolean; queued?: { ok: true } | { ok: false; error: string } }
  | { ok: false; error: 'not-found' | 'decided' | 'not-github' | 'category' }

export function isSkillCategory(value: unknown): value is SkillCategory {
  return typeof value === 'string' && (skillCategories as readonly string[]).includes(value)
}

/**
 * 「转为 Skill」: a draft Skill from the submission's repository, in the category the owner picked,
 * with its first import queued, linked under「导入为」. A Skill already made from the same
 * repository and folder is linked instead: a published one lists the submission right away
 * (and emails the submitter); otherwise `acceptOnPublish` lists it when the Skill goes live.
 */
export async function skillFromSubmission(req: PayloadRequest, id: number, category: unknown): Promise<ConvertResult> {
  const submission = await req.payload.findByID({ collection: 'skill-submissions', id, depth: 0, disableErrors: true, req })
  if (!submission) return { ok: false, error: 'not-found' }
  if (submission.status !== 'pending') return { ok: false, error: 'decided' }
  const linkedId = relationId(submission.skill)
  if (linkedId) return { ok: true, skillId: linkedId, created: false, listed: false }

  const existing = (await skillsFromSource(req.payload, submission.repository, req))[0]
  if (existing) {
    const listed = existing.status === 'published'
    await req.payload.update({
      collection: 'skill-submissions',
      id,
      data: listed ? { skill: existing.id, status: 'accepted' } : { skill: existing.id },
      depth: 0,
      req,
    })
    return { ok: true, skillId: existing.id, created: false, listed }
  }

  const seed = skillSeed(submission.repository)
  if (!seed) return { ok: false, error: 'not-github' }
  if (!isSkillCategory(category)) return { ok: false, error: 'category' }
  const { docs: taken } = await req.payload.find({
    collection: 'skills',
    where: { slug: { like: seed.slug } },
    select: { slug: true },
    pagination: false,
    depth: 0,
    req,
  })
  const skill = await req.payload.create({
    collection: 'skills',
    locale: 'en',
    data: {
      name: seed.name,
      slug: freeSlug(seed.slug, taken.map((doc) => doc.slug)),
      status: 'draft',
      category,
      author: { ...seed.author, official: false },
      repository: submission.repository,
    },
    depth: 0,
    req,
  })
  await req.payload.update({ collection: 'skill-submissions', id, data: { skill: skill.id }, depth: 0, req })
  let queued: { ok: true } | { ok: false; error: string }
  try {
    await queueImport(req, skill.id)
    queued = { ok: true }
  } catch (error) {
    queued = { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
  return { ok: true, skillId: skill.id, created: true, listed: false, queued }
}

/**
 * On `skills`: a Skill made from submissions goes live, so the submissions waiting on it become
 * listed, and the hook on `skill-submissions` emails each submitter.
 */
export const acceptOnPublish: CollectionAfterChangeHook = async ({ doc, previousDoc, req }) => {
  if (doc.status !== 'published' || previousDoc?.status === 'published') return doc
  await keepingRequest(req, () =>
    req.payload.update({
      collection: 'skill-submissions',
      where: { skill: { equals: doc.id }, status: { equals: 'pending' } },
      data: { status: 'accepted' },
      depth: 0,
      req,
    }),
  )
  return doc
}
