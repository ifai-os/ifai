import type { CollectionConfig } from 'payload'

import { answerStatuses } from '../rules'
import { isAdmin, promptLangOptions, rankingsAdminGroup } from './shared'

const readOnly = { readOnly: true } as const

/**
 * The contestants' answers (docs/specs/rankings.md rule 6), written only by the answer job
 * (../answers/generate.ts) through the Local API: text, or in an image arena a picture
 * (./ArenaImages.ts). The site owner can read them and hide one; a hidden, cut-off or self-naming
 * answer is never shown in a vote. Votes already cast on it stay.
 */
export const ArenaAnswers: CollectionConfig = {
  slug: 'arena-answers',
  labels: {
    singular: { en: 'Answer', zh: '回答' },
    plural: { en: 'Answers', zh: '回答' },
  },
  admin: {
    group: rankingsAdminGroup,
    defaultColumns: ['id', 'model', 'prompt', 'status', 'hidden', 'cutOff', 'namesItself', 'costUsd'],
    listSearchableFields: ['text'],
    description: {
      en: 'Generated ahead of the votes, one per question and model. Readers see an answer in a vote when it is done, not hidden, not cut off and does not name its model or maker. Hide an answer that should not be shown; votes already cast on it still count.',
      zh: '投票前生成好，每道题每个模型一份。完成、没被隐藏、没被截断、没提到自己的回答才会出现在盲测里。不该给读者看的回答在这里「隐藏」；已经投的票照算。',
    },
  },
  defaultSort: '-updatedAt',
  indexes: [{ fields: ['prompt', 'model'], unique: true }],
  access: {
    read: isAdmin,
    // Only the answer job writes answers.
    create: () => false,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'hidden',
      type: 'checkbox',
      defaultValue: false,
      label: { en: 'Hidden from votes', zh: '隐藏（不进盲测）' },
      admin: { position: 'sidebar' },
    },
    {
      type: 'row',
      fields: [
        { name: 'prompt', type: 'relationship', relationTo: 'arena-prompts', required: true, index: true, label: { en: 'Question', zh: '题目' }, admin: { ...readOnly, width: '50%' } },
        { name: 'model', type: 'relationship', relationTo: 'arena-models', required: true, index: true, label: { en: 'Model', zh: '模型' }, admin: { ...readOnly, width: '50%' } },
      ],
    },
    {
      type: 'row',
      fields: [
        { name: 'arena', type: 'relationship', relationTo: 'arenas', required: true, index: true, label: { en: 'Arena', zh: '赛道' }, admin: { ...readOnly, width: '50%' } },
        { name: 'lang', type: 'select', required: true, options: promptLangOptions, label: { en: 'Language', zh: '语言' }, admin: { ...readOnly, width: '50%' } },
      ],
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'pending',
      index: true,
      options: [
        { value: answerStatuses[0], label: { en: 'Waiting', zh: '等待' } },
        { value: answerStatuses[1], label: { en: 'Done', zh: '完成' } },
        { value: answerStatuses[2], label: { en: 'Failed', zh: '失败' } },
      ],
      label: { en: 'Status', zh: '状态' },
      admin: { ...readOnly, position: 'sidebar' },
    },
    {
      name: 'text',
      type: 'textarea',
      label: { en: 'Answer', zh: '回答' },
      admin: { ...readOnly, rows: 16, condition: (data) => !data?.image },
    },
    {
      name: 'image',
      type: 'upload',
      relationTo: 'arena-images',
      label: { en: 'Picture', zh: '图' },
      admin: {
        ...readOnly,
        condition: (data) => Boolean(data?.image),
        description: {
          en: 'Hide the answer if the picture has a signature, a watermark or a model or company name on it, or should not be shown.',
          zh: '图上有签名、水印、模型名或公司名，或者不该给读者看，就把这份回答隐藏。',
        },
      },
    },
    {
      type: 'row',
      // Pictures are neither cut off nor read for names (「图像生成赛道」).
      admin: { condition: (data) => !data?.image },
      fields: [
        {
          name: 'cutOff',
          type: 'checkbox',
          defaultValue: false,
          label: { en: 'Cut off at the length limit', zh: '写到上限被截断' },
          admin: { ...readOnly, width: '50%' },
        },
        {
          name: 'namesItself',
          type: 'checkbox',
          defaultValue: false,
          label: { en: 'Names its model or maker', zh: '提到了自己的模型或厂商' },
          admin: { ...readOnly, width: '50%' },
        },
      ],
    },
    {
      name: 'error',
      type: 'text',
      label: { en: 'Error', zh: '错误' },
      admin: { ...readOnly, condition: (data) => Boolean(data?.error) },
    },
    {
      type: 'row',
      fields: [
        { name: 'costUsd', type: 'number', label: { en: 'Cost (USD)', zh: '费用（美元）' }, admin: { ...readOnly, width: '33%' } },
        { name: 'inputTokens', type: 'number', label: { en: 'Input tokens', zh: '输入 token' }, admin: { ...readOnly, width: '33%' } },
        { name: 'outputTokens', type: 'number', label: { en: 'Output tokens', zh: '输出 token' }, admin: { ...readOnly, width: '33%' } },
      ],
    },
    {
      name: 'attempts',
      type: 'number',
      defaultValue: 0,
      label: { en: 'Retries', zh: '重试次数' },
      admin: {
        ...readOnly,
        position: 'sidebar',
        description: { en: 'How often “Retry failed” sent it back.', zh: '「重试失败的」重来过几次。' },
      },
    },
    {
      name: 'generatedAt',
      type: 'date',
      label: { en: 'Generated', zh: '生成时间' },
      admin: { ...readOnly, position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
    },
  ],
}
