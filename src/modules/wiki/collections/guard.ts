import type { PostgresAdapter } from '@payloadcms/db-postgres'
import { sql } from '@payloadcms/db-postgres/drizzle'
import type { CollectionBeforeChangeHook, CollectionBeforeDeleteHook, PayloadRequest } from 'payload'

import { rejectField } from '@/lib/field-error'
import { keepingRequest } from '@/lib/i18n/hant-sync'
import { adminMessage } from '@/modules/apps/collections/shared'
import type { WikiEntry } from '@/payload-types'

import { missingForPublish, prerequisiteLoop, type EnglishTexts, type MissingField } from '../rules'

type Message = { en: string; zh: string }

function reject(req: PayloadRequest, path: string, message: Message): never {
  rejectField('wiki-entries', path, adminMessage(req, message))
}

/** A relationship value as stored (the id), whether Payload gave the id or the document. */
function idOf(value: unknown): number | null {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && /^\d+$/.test(value)) return Number(value)
  if (value && typeof value === 'object' && 'id' in value) return idOf((value as { id: unknown }).id)
  return null
}

function idsOf(value: unknown): number[] {
  return Array.isArray(value) ? value.map(idOf).filter((id) => id !== null) : []
}

/** What to tell the editor for each missing field (rule 4). */
const missingMessages: Record<MissingField, Message> = {
  title: { en: 'Write the English name before publishing.', zh: '发布前先写英文名称。' },
  definition: { en: 'Write the one-sentence definition (in English) before publishing.', zh: '发布前要有一句话定义（英文版）。' },
  explanation: { en: 'Write the plain-words explanation (in English) before publishing.', zh: '发布前要有白话说明（英文版）。' },
  examples: { en: 'Add at least one example (in English) before publishing.', zh: '发布前至少写一个例子（英文版）。' },
  steps: { en: 'A method needs at least one step (in English) before publishing.', zh: '方法类条目发布前至少写一个步骤（英文版）。' },
  limitations: { en: 'Write the limitations (in English) before publishing.', zh: '发布前要写局限（英文版）。' },
  topics: { en: 'Pick at least one topic before publishing.', zh: '发布前至少选一个主题。' },
  sources: { en: 'Add at least one source before publishing.', zh: '发布前至少加一个参考来源。' },
  reviewedAt: {
    en: 'Set the review date (the day you last checked the facts) before publishing.',
    zh: '发布前填复核日期（你最后一次核对事实的那天）。',
  },
}

/** Writes made by the app itself (the zh-Hant copy, scripts that say so) skip the editor-facing rules. */
function isSystemWrite(req: PayloadRequest): boolean {
  const context = req.context as Record<string, unknown> | undefined
  return Boolean(context?.system || context?.skipHantSync)
}

/** The English texts of a saved entry, read without falling back (every language falls back to them). */
async function englishOf(req: PayloadRequest, id: number | null): Promise<EnglishTexts> {
  if (id === null) return {}
  const doc = await keepingRequest(req, () =>
    req.payload
      .findByID({ collection: 'wiki-entries', id, locale: 'en', fallbackLocale: false, depth: 0, req })
      .catch(() => null),
  )
  return doc ?? {}
}

/** Every other entry's prerequisites, for the loop check. */
async function prerequisiteMap(req: PayloadRequest, id: number): Promise<Map<number, number[]>> {
  const { docs } = await keepingRequest(req, () =>
    req.payload.find({
      collection: 'wiki-entries',
      where: { id: { not_equals: id } },
      pagination: false,
      depth: 0,
      select: { prerequisites: true },
      req,
    }),
  )
  return new Map(docs.map((doc) => [doc.id, idsOf(doc.prerequisites)]))
}

async function titleOf(req: PayloadRequest, id: number): Promise<string> {
  const doc = await keepingRequest(req, () =>
    req.payload.findByID({ collection: 'wiki-entries', id, depth: 0, req, select: { title: true } }).catch(() => null),
  )
  return doc?.title ?? `#${id}`
}

/**
 * Saving an entry (docs/specs/wiki.md): no relation to itself, no prerequisite loop (rule 6), and
 * nothing goes public before it is complete in English (rule 4). Publishing the first time sets
 * 首次发布时间.
 */
export const guardEntry: CollectionBeforeChangeHook<WikiEntry> = async ({ data, originalDoc, req }) => {
  if (isSystemWrite(req)) return data
  const merged = { ...(originalDoc ?? {}), ...data } as Partial<WikiEntry>
  const id = idOf(originalDoc?.id)

  if (id !== null) {
    if (idsOf(merged.prerequisites).includes(id)) {
      reject(req, 'prerequisites', { en: 'An entry cannot be its own prerequisite.', zh: '条目不能是自己的先修。' })
    }
    if (idsOf(merged.related).includes(id)) {
      reject(req, 'related', { en: 'An entry cannot be related to itself.', zh: '条目不能和自己相关。' })
    }
    if ((merged.comparisons ?? []).some((row) => idOf(row?.entry) === id)) {
      reject(req, 'comparisons', { en: 'Compare the entry with another one, not with itself.', zh: '易混条目要选别的条目，不能选自己。' })
    }
    const prerequisites = idsOf(merged.prerequisites)
    if (prerequisites.length > 0) {
      const loop = prerequisiteLoop(id, prerequisites, await prerequisiteMap(req, id))
      if (loop !== null) {
        const title = await titleOf(req, loop)
        reject(req, 'prerequisites', {
          en: `“${title}” already needs this entry first (directly or through others), so it cannot be a prerequisite here.`,
          zh: `「${title}」已经（直接或间接）把这个条目当先修，不能再设为这个条目的先修。`,
        })
      }
    }
  }

  const unpicked = (merged.comparisons ?? []).findIndex((row) => idOf(row?.entry) === null)
  if (unpicked !== -1) {
    reject(req, `comparisons.${unpicked}.entry`, { en: 'Pick the entry to compare with, or remove this row.', zh: '选好要对比的条目，或者删掉这一行。' })
  }

  if (merged.status === 'published') {
    const english: EnglishTexts = (req.locale ?? 'en') === 'en' ? merged : await englishOf(req, id)
    const [missing] = missingForPublish(english, merged)
    if (missing) reject(req, missing, missingMessages[missing])
    if (!merged.publishedAt) data.publishedAt = new Date().toISOString()
  }
  return data
}

/**
 * Deleting an entry also deletes the comparison rows on other entries that point at it, in every
 * language: a comparison shows on both pages (rule 6), so it goes with either side. Done in SQL
 * inside the delete's transaction; left alone, the foreign key would only empty the rows' entry.
 */
export const dropComparisons: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const target = idOf(id)
  if (target === null) return
  const adapter = req.payload.db as unknown as PostgresAdapter
  const transactionID = await req.transactionID
  const db = (transactionID && adapter.sessions?.[transactionID]?.db) || adapter.drizzle
  await db.execute(sql`delete from wiki_entries_comparisons where entry_id = ${target}`)
}
