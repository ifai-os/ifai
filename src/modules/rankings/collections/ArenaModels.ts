import type { CollectionAfterChangeHook, CollectionBeforeChangeHook, CollectionConfig, TextFieldSingleValidation } from 'payload'
import { text } from 'payload/shared'

import { inngest } from '@/lib/inngest/client'
import { syncHantFromHans } from '@/lib/i18n/hant-sync'
import { rejectField } from '@/lib/field-error'

import { refreshRankingsAfterChange, refreshRankingsAfterDelete } from '../cache'
import { answerEndpoints } from '../endpoints'
import { answersEvent } from '../events'
import { modelStatuses } from '../rules'
import { adminMessage, isAdmin, rankingsAdminGroup, regionOptions, weightsOptions } from './shared'

/** openrouter.ai/models IDs: maker/model, optionally with a :variant. */
const OPENROUTER_ID = /^[a-z0-9][a-z0-9._-]*\/[a-z0-9][a-z0-9._:-]*$/

const validateOpenRouterId: TextFieldSingleValidation = (value, args) => {
  const required = text(value, args)
  if (required !== true) return required
  return typeof value === 'string' && OPENROUTER_ID.test(value)
    ? true
    : adminMessage(args.req, {
        en: 'Use the ID from openrouter.ai/models, e.g. deepseek/deepseek-v3.2.',
        zh: '填 openrouter.ai/models 上的 ID，例如 deepseek/deepseek-v3.2。',
      })
}

/** Optional; when given, a full http(s) address. */
const validateLicenseUrl: TextFieldSingleValidation = (value, args) =>
  !value || (typeof value === 'string' && /^https?:\/\/\S+$/i.test(value))
    ? true
    : adminMessage(args.req, { en: 'Use a full address starting with https://', zh: '填完整的网址，以 https:// 开头。' })

/**
 * The model behind an answer must stay the model it names: once it has answers, a new model
 * (a new version, another provider) is a new contestant.
 */
const keepAnsweredModel: CollectionBeforeChangeHook = async ({ data, originalDoc, operation, req }) => {
  if (operation !== 'update' || !originalDoc || data.openrouterId === undefined || data.openrouterId === originalDoc.openrouterId) return data
  const { totalDocs } = await req.payload.count({ collection: 'arena-answers', where: { model: { equals: originalDoc.id } }, req })
  if (totalDocs > 0) {
    rejectField(
      'arena-models',
      'openrouterId',
      adminMessage(req, {
        en: 'This model already has answers. Add the other model as a new contestant instead, and retire this one if it should stop.',
        zh: '这个模型已经有回答了，不能换。另一个模型（新版本、换服务商）请另加一个参赛模型，这个不再参赛就改成「退役」。',
      }),
    )
  }
  return data
}

/** A model that answers (备赛 or 参赛) gets its missing answers queued at once rather than within half an hour. */
const queueAnswers: CollectionAfterChangeHook = async ({ doc, req, context }) => {
  if (context.skipAnswersEvent || (doc.status !== 'draft' && doc.status !== 'active')) return doc
  try {
    await inngest.send({ name: answersEvent, data: {} })
  } catch (error) {
    req.payload.logger.warn(`${answersEvent} not sent for arena model ${doc.id}: ${error instanceof Error ? error.message : String(error)}`)
  }
  return doc
}

/**
 * The contestants (docs/specs/rankings.md rule 4). 备赛 only collects answers; 参赛 puts the model
 * into the votes and the rankings; 退役 takes it out of both and keeps its votes.
 */
export const ArenaModels: CollectionConfig = {
  slug: 'arena-models',
  labels: {
    singular: { en: 'Contestant', zh: '参赛模型' },
    plural: { en: 'Contestants', zh: '参赛模型' },
  },
  admin: {
    useAsTitle: 'name',
    group: rankingsAdminGroup,
    defaultColumns: ['name', 'org', 'openrouterId', 'weights', 'region', 'status'],
    description: {
      en: 'New contestants start in “Preparing”: their answers to every question of their arenas are generated first (see the Answers box on the right). Set them to “Competing” to put them into the votes.',
      zh: '新模型先是「备赛」：先给它所在赛道的每道题生成回答（看右边的「回答」）。回答齐了改成「参赛」，才会出现在盲测和排行里。',
    },
  },
  defaultSort: 'name',
  access: {
    read: isAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [keepAnsweredModel],
    afterChange: [syncHantFromHans(['org']), refreshRankingsAfterChange, queueAnswers],
    afterDelete: [refreshRankingsAfterDelete],
  },
  endpoints: answerEndpoints,
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: { en: 'Name', zh: '显示名' },
      admin: { description: { en: 'As the maker writes it, e.g. Kimi K2. Not translated.', zh: '按厂商的写法，例如 Kimi K2。不翻译。' } },
    },
    {
      name: 'org',
      type: 'text',
      required: true,
      localized: true,
      label: { en: 'Maker', zh: '厂商' },
      admin: {
        description: {
          en: 'E.g. Anthropic, Moonshot AI. Write the Chinese name (月之暗面) in Simplified Chinese.',
          zh: '例如 Anthropic、月之暗面。中文名写在简体中文里，英文名写在英语里。',
        },
      },
    },
    {
      name: 'openrouterId',
      type: 'text',
      required: true,
      unique: true,
      index: true,
      label: { en: 'OpenRouter model ID', zh: 'OpenRouter 模型 ID' },
      admin: {
        description: {
          en: 'From openrouter.ai/models, e.g. moonshotai/kimi-k2. Fixed once the model has answers.',
          zh: 'openrouter.ai/models 上的 ID，例如 moonshotai/kimi-k2。有了回答以后不能再改。',
        },
      },
      hooks: { beforeValidate: [({ value }) => (typeof value === 'string' ? value.trim().toLowerCase() : value)] },
      validate: validateOpenRouterId,
    },
    {
      type: 'row',
      fields: [
        {
          name: 'weights',
          type: 'select',
          required: true,
          options: weightsOptions,
          label: { en: 'Weights', zh: '权重' },
          admin: {
            width: '50%',
            description: {
              en: 'Open weights: the weights can be downloaded. Not the same as an open-source license.',
              zh: '开放权重：权重可以下载。不等于开源许可。',
            },
          },
        },
        {
          name: 'region',
          type: 'select',
          required: true,
          options: regionOptions,
          label: { en: 'Region', zh: '地区' },
          admin: { width: '50%', description: { en: 'Where the maker is based.', zh: '厂商所在地。' } },
        },
      ],
    },
    {
      type: 'row',
      fields: [
        {
          name: 'license',
          type: 'text',
          label: { en: 'License', zh: '许可名称' },
          admin: { width: '50%', description: { en: 'E.g. MIT, Llama 3.3 Community. Leave empty when unsure.', zh: '例如 MIT、Llama 3.3 Community。拿不准就空着，不要猜。' } },
        },
        {
          name: 'licenseUrl',
          type: 'text',
          label: { en: 'License link', zh: '许可链接' },
          admin: { width: '50%' },
          validate: validateLicenseUrl,
        },
      ],
    },
    {
      name: 'arenas',
      type: 'relationship',
      relationTo: 'arenas',
      hasMany: true,
      required: true,
      label: { en: 'Arenas', zh: '参加的赛道' },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { value: modelStatuses[0], label: { en: 'Preparing', zh: '备赛' } },
        { value: modelStatuses[1], label: { en: 'Competing', zh: '参赛' } },
        { value: modelStatuses[2], label: { en: 'Retired', zh: '退役' } },
      ],
      label: { en: 'Status', zh: '状态' },
      admin: {
        position: 'sidebar',
        description: {
          en: 'Preparing: answers only. Competing: in the votes and rankings. Retired: out of both; its votes stay.',
          zh: '备赛：只生成回答。参赛：进盲测和排行。退役：都不进，票留着。',
        },
      },
    },
    {
      name: 'answersPanel',
      type: 'ui',
      label: { en: 'Answers', zh: '回答' },
      admin: { position: 'sidebar', components: { Field: '/modules/rankings/admin/answers-panel#AnswersPanel' } },
    },
  ],
}
