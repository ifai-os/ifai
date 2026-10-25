import { APIError, type CollectionBeforeChangeHook, type CollectionBeforeDeleteHook, type CollectionConfig } from 'payload'

import { rejectField } from '@/lib/field-error'
import { syncHantFromHans } from '@/lib/i18n/hant-sync'

import { refreshRankingsAfterChange, refreshRankingsAfterDelete } from '../cache'
import { snapshotEndpoints } from '../endpoints'
import { arenaKinds, arenaStatuses, reservedArenaSlugs } from '../rules'
import { adminMessage, isAdmin, rankingsAdminGroup, slugField } from './shared'

/** Its questions were answered in the arena's kind (text or pictures): once it has any, the kind stays. */
const keepKindOfUsedArenas: CollectionBeforeChangeHook = async ({ data, originalDoc, operation, req }) => {
  if (operation !== 'update' || !originalDoc || data.kind === undefined || data.kind === originalDoc.kind) return data
  const { totalDocs } = await req.payload.count({ collection: 'arena-prompts', where: { arena: { equals: originalDoc.id } }, req })
  if (totalDocs > 0) {
    rejectField(
      'arenas',
      'kind',
      adminMessage(req, {
        en: 'This arena already has questions, so its kind cannot change. Add a new arena for the other kind.',
        zh: '这个赛道已经有题目了，种类不能再改。要另一种，就新建一个赛道。',
      }),
    )
  }
  return data
}

/** An arena with questions has answers and votes behind it: take it off the site instead. */
const keepUsedArenas: CollectionBeforeDeleteHook = async ({ id, req }) => {
  const { totalDocs } = await req.payload.count({ collection: 'arena-prompts', where: { arena: { equals: id } }, req })
  if (totalDocs > 0) {
    throw new APIError(
      adminMessage(req, {
        en: 'This arena has questions, answers and votes. Set it to “Draft” to take it off the site instead.',
        zh: '这个赛道已经有题目、回答和投票了，不能删。要从网站上拿掉，把状态改成「准备中」。',
      }),
      400,
      null,
      true,
    )
  }
}

/**
 * The arenas of the model rankings (docs/specs/rankings.md): 文本 and 编程 come with the first
 * migration, 图像生成 (answers are pictures) with the second. Only published arenas appear on the
 * site and get weekly snapshots; answers are generated for draft ones too, so an arena can be
 * ready before it opens.
 */
export const Arenas: CollectionConfig = {
  slug: 'arenas',
  labels: {
    singular: { en: 'Arena', zh: '赛道' },
    plural: { en: 'Arenas', zh: '赛道' },
  },
  admin: {
    useAsTitle: 'name',
    group: rankingsAdminGroup,
    defaultColumns: ['name', 'slug', 'status', 'order'],
    components: {
      beforeListTable: ['/modules/rankings/admin/snapshot-status#SnapshotStatus'],
    },
    description: {
      en: 'Traditional Chinese is converted from Simplified automatically (OpenCC). Write English, Japanese and Korean separately. The rankings are recomputed every Monday at 06:00 Shanghai time.',
      zh: '繁体中文由简体自动转换（OpenCC），不用手改；英语、日语、韩语分别填写。排行每周一上海时间 06:00 重算。',
    },
  },
  defaultSort: 'order',
  access: {
    read: isAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [keepKindOfUsedArenas],
    afterChange: [syncHantFromHans(['name', 'intro']), refreshRankingsAfterChange],
    beforeDelete: [keepUsedArenas],
    afterDelete: [refreshRankingsAfterDelete],
  },
  endpoints: snapshotEndpoints,
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      localized: true,
      label: { en: 'Name', zh: '名称' },
      admin: { description: { en: 'The tab on the rankings page, e.g. “Coding”.', zh: '排行页上的标签，例如「编程」。' } },
    },
    {
      name: 'intro',
      type: 'text',
      localized: true,
      maxLength: 80,
      label: { en: 'One-line description', zh: '一句话介绍' },
      admin: {
        description: {
          en: 'What the questions in this arena ask for, under the tabs.',
          zh: '这个赛道的题考什么，显示在标签下面。',
        },
      },
    },
    slugField({ from: 'name', reserved: reservedArenaSlugs }),
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      options: [
        { value: arenaStatuses[0], label: { en: 'Draft', zh: '准备中' } },
        { value: arenaStatuses[1], label: { en: 'Published', zh: '已上线' } },
      ],
      label: { en: 'Status', zh: '状态' },
      admin: {
        position: 'sidebar',
        description: {
          en: 'Draft arenas get answers but no votes and no rankings.',
          zh: '准备中的赛道会生成回答，但不出题投票、不算排行。',
        },
      },
    },
    {
      name: 'kind',
      type: 'select',
      required: true,
      defaultValue: 'text',
      options: [
        { value: arenaKinds[0], label: { en: 'Text', zh: '文字' } },
        { value: arenaKinds[1], label: { en: 'Image', zh: '图像' } },
      ],
      label: { en: 'Kind', zh: '种类' },
      admin: {
        position: 'sidebar',
        description: {
          en: 'Text answers, or one picture per answer. Fixed once the arena has questions.',
          zh: '回答是文字，还是每份一张图。有了题目以后不能改。',
        },
      },
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
      label: { en: 'Order', zh: '排序' },
      admin: {
        position: 'sidebar',
        description: { en: 'Smaller comes first; the first one is the rankings page itself.', zh: '数字越小越靠前；排第一的就是排行页本身。' },
      },
    },
  ],
}
