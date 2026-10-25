import type { CollectionConfig } from 'payload'

import { syncHantFromHans } from '@/lib/i18n/hant-sync'
import { isAdmin, slugField } from '@/modules/apps/collections/shared'

import { refreshWikiAfterChange, refreshWikiAfterDelete } from '../cache'
import { wikiAdminGroup } from './shared'

/**
 * The Wiki's topics (docs/specs/wiki.md, rule 2): the way readers browse, separate from an
 * entry's type. Public once created; a topic without published entries stays off the home page
 * and the sitemap.
 */
export const WikiTopics: CollectionConfig = {
  slug: 'wiki-topics',
  labels: {
    singular: { en: 'Wiki topic', zh: 'Wiki 主题' },
    plural: { en: 'Wiki topics', zh: 'Wiki 主题' },
  },
  admin: {
    useAsTitle: 'name',
    group: wikiAdminGroup,
    defaultColumns: ['name', 'slug', 'order', 'updatedAt'],
    description: {
      en: 'Traditional Chinese is converted from Simplified automatically (OpenCC). Write English, Japanese and Korean separately.',
      zh: '繁体中文由简体自动转换（OpenCC），不用手改；英语、日语、韩语分别填写。',
    },
  },
  defaultSort: 'order',
  access: {
    read: () => true,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    afterChange: [syncHantFromHans(['name', 'intro']), refreshWikiAfterChange],
    afterDelete: [refreshWikiAfterDelete],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      localized: true,
      label: { en: 'Name', zh: '名称' },
    },
    slugField({ from: 'name' }),
    {
      name: 'intro',
      type: 'textarea',
      localized: true,
      label: { en: 'Introduction', zh: '导读' },
      admin: {
        description: {
          en: 'Two or three sentences: what this topic covers and where a beginner should start.',
          zh: '两三句话：这个主题讲什么，新手从哪里读起。',
        },
      },
    },
    {
      name: 'mustRead',
      type: 'relationship',
      relationTo: 'wiki-entries',
      hasMany: true,
      label: { en: 'Read first', zh: '必读条目' },
      admin: {
        description: {
          en: 'In reading order; drag to reorder. Drafts are left out until published.',
          zh: '按阅读顺序排，可以拖动。草稿条目发布后才显示。',
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
        description: { en: 'Smaller comes first.', zh: '数字越小越靠前。' },
      },
    },
  ],
}
