import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, CollectionBeforeDeleteHook, CollectionConfig } from 'payload'
import { APIError } from 'payload'

import { inngest } from '@/lib/inngest/client'
import { rejectField } from '@/lib/field-error'

import { answersEvent } from '../events'
import { PROMPT_MAX_LENGTH, promptStatuses } from '../rules'
import { adminMessage, isAdmin, promptLangOptions, rankingsAdminGroup } from './shared'

const relationId = (value: unknown) => (value && typeof value === 'object' ? (value as { id: unknown }).id : value)

/**
 * Answers belong to the question as it was asked (rule 5): once it has any, its text, language and
 * arena stay. A new question, and this one stopped, keeps the votes honest.
 */
const keepAnsweredPrompt: CollectionBeforeChangeHook = async ({ data, originalDoc, operation, req }) => {
  if (operation !== 'update' || !originalDoc) return data
  const changed = (['text', 'lang', 'arena'] as const).find(
    (field) => data[field] !== undefined && String(relationId(data[field])) !== String(relationId(originalDoc[field])),
  )
  if (!changed) return data
  const { totalDocs } = await req.payload.count({ collection: 'arena-answers', where: { prompt: { equals: originalDoc.id } }, req })
  if (totalDocs > 0) {
    rejectField(
      'arena-prompts',
      changed,
      adminMessage(req, {
        en: 'This question already has answers, so it cannot change. Add a new question and set this one to “Retired”.',
        zh: '这道题已经有回答了，不能再改。新建一道题，把这道改成「停用」。',
      }),
    )
  }
  return data
}

/** Votes point at the question: stop it instead of deleting it. */
const keepVotedPrompt: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const { totalDocs } = await req.payload.count({ collection: 'arena-answers', where: { prompt: { equals: id } }, req })
  if (totalDocs > 0) {
    throw new APIError(
      adminMessage(req, {
        en: 'This question has answers and may have votes. Set it to “Retired” instead.',
        zh: '这道题已经有回答，可能也有投票了，不能删。不想再用就改成「停用」。',
      }),
      400,
      null,
      true,
    )
  }
}

/** A question in use gets its answers queued at once rather than within half an hour. */
const queueAnswers: CollectionAfterChangeHook = async ({ doc, req, context }) => {
  if (context.skipAnswersEvent || doc.status !== 'active') return doc
  try {
    await inngest.send({ name: answersEvent, data: {} })
  } catch (error) {
    req.payload.logger.warn(`${answersEvent} not sent for arena question ${doc.id}: ${error instanceof Error ? error.message : String(error)}`)
  }
  return doc
}

/**
 * The question bank (docs/specs/rankings.md rules 2 and 5): one language per question; every
 * preparing or competing model of the arena answers it once, ahead of the votes.
 */
export const ArenaPrompts: CollectionConfig = {
  slug: 'arena-prompts',
  labels: {
    singular: { en: 'Question', zh: '题目' },
    plural: { en: 'Question bank', zh: '题库' },
  },
  admin: {
    useAsTitle: 'text',
    group: rankingsAdminGroup,
    defaultColumns: ['text', 'arena', 'lang', 'status'],
    listSearchableFields: ['text', 'note'],
    description: {
      en: 'Readers vote on the answers to these questions. Write each question in one language; Traditional Chinese pages show the Simplified ones converted. Questions are public, notes are not.',
      zh: '读者看着这些题的回答投票。每道题写一种语言；繁体页面出简体题，自动转繁体。题目会公开，备注不公开。',
    },
  },
  defaultSort: '-createdAt',
  access: {
    read: isAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [keepAnsweredPrompt],
    beforeDelete: [keepVotedPrompt],
    afterChange: [queueAnswers],
  },
  fields: [
    {
      name: 'text',
      type: 'textarea',
      required: true,
      maxLength: PROMPT_MAX_LENGTH,
      label: { en: 'Question', zh: '题目' },
      admin: {
        rows: 6,
        description: {
          en: 'Exactly what the models get. A real task readers would ask about; nothing about AI models themselves, nothing that needs the web or files. In an image arena, describe the picture to draw.',
          zh: '模型拿到的就是这段话。写读者真会问的任务；不要问模型自己的事，不要需要上网或附件的题。图像赛道的题写要画的画面。',
        },
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'arena',
          type: 'relationship',
          relationTo: 'arenas',
          required: true,
          label: { en: 'Arena', zh: '赛道' },
          admin: { width: '50%' },
        },
        {
          name: 'lang',
          type: 'select',
          required: true,
          options: promptLangOptions,
          label: { en: 'Language', zh: '语言' },
          admin: { width: '50%', description: { en: 'The language the question is written in.', zh: '题目是用哪种语言写的。' } },
        },
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'active',
      options: [
        { value: promptStatuses[0], label: { en: 'In use', zh: '使用中' } },
        { value: promptStatuses[1], label: { en: 'Retired', zh: '停用' } },
      ],
      label: { en: 'Status', zh: '状态' },
      admin: { position: 'sidebar' },
    },
    {
      name: 'note',
      type: 'textarea',
      label: { en: 'Note (not public)', zh: '备注（不公开）' },
      admin: { position: 'sidebar', description: { en: 'What the question tests, where it came from.', zh: '考什么、从哪来。' } },
    },
  ],
}
