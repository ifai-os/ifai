import type { CollectionConfig, Where } from 'payload'

import { syncHantFromHans } from '@/lib/i18n/hant-sync'
import { isAdmin, slugField } from '@/modules/apps/collections/shared'
import { urlValidation } from '@/modules/resources/collections/shared'

import { refreshWikiAfterChange, refreshWikiAfterDelete } from '../cache'
import { reservedEntrySlugs } from '../rules'
import { dropComparisons, guardEntry } from './guard'
import { wikiAdminGroup } from './shared'

/** Localized fields whose zh-Hant value is converted from zh-Hans. */
const hantFields = [
  'title',
  'aliases',
  'definition',
  'explanation',
  'examples',
  'steps',
  'uses',
  'limitations',
  'contexts',
  'fact',
  'comparisons',
] as const

/** Other entries only: an entry is never related to itself (the guard says so on save as well). */
const otherEntries = ({ id }: { id?: number | string }): Where | true => (id ? { id: { not_equals: id } } : true)

const publishedOnly: Where = { status: { equals: 'published' } }

/**
 * The Wiki's entries (docs/specs/wiki.md「数据」): concepts and methods, written per language
 * and published only once complete and checked (rules 3–5). Relations are confirmed here by the
 * editor (rule 6); every save is kept as a revision (rule 10). The public sees published entries only.
 */
export const WikiEntries: CollectionConfig = {
  slug: 'wiki-entries',
  labels: {
    singular: { en: 'Wiki entry', zh: 'Wiki 条目' },
    plural: { en: 'Wiki entries', zh: 'Wiki 条目' },
  },
  admin: {
    useAsTitle: 'title',
    group: wikiAdminGroup,
    defaultColumns: ['title', 'type', 'status', 'reviewedAt', 'updatedAt'],
    listSearchableFields: ['title', 'slug'],
    description: {
      en: 'Traditional Chinese is converted from Simplified automatically (OpenCC). Write English, Japanese and Korean separately; missing languages show the English. Publishing checks the English version is complete.',
      zh: '繁体中文由简体自动转换（OpenCC），不用手改；英语、日语、韩语分别填写，没写的语言显示英文。发布时检查英文版是否齐全。',
    },
  },
  access: {
    read: ({ req: { user } }) => (user ? true : { status: { equals: 'published' } }),
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [guardEntry],
    afterChange: [syncHantFromHans(hantFields), refreshWikiAfterChange],
    beforeDelete: [dropComparisons],
    afterDelete: [refreshWikiAfterDelete],
  },
  versions: { maxPerDoc: 100 },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      localized: true,
      label: { en: 'Name', zh: '名称' },
      admin: { description: { en: 'As readers in this language call it.', zh: '这种语言的读者怎么叫它。' } },
    },
    slugField({ from: 'title', reserved: reservedEntrySlugs }),
    {
      name: 'type',
      type: 'select',
      required: true,
      defaultValue: 'concept',
      label: { en: 'Type', zh: '类型' },
      options: [
        { value: 'concept', label: { en: 'Concept', zh: '概念' } },
        { value: 'method', label: { en: 'Method', zh: '方法' } },
      ],
      admin: {
        position: 'sidebar',
        description: { en: 'A method also has steps.', zh: '方法类条目还要写步骤。' },
      },
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      index: true,
      label: { en: 'Status', zh: '状态' },
      options: [
        { value: 'draft', label: { en: 'Draft', zh: '草稿' } },
        { value: 'published', label: { en: 'Published', zh: '已发布' } },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'reviewedAt',
      type: 'date',
      label: { en: 'Facts checked on', zh: '复核日期' },
      admin: {
        position: 'sidebar',
        date: { pickerAppearance: 'dayOnly', displayFormat: 'yyyy-MM-dd' },
        description: {
          en: 'The day you last checked the facts against the sources. Leave it when you only fix wording or typos.',
          zh: '你最后一次对照来源核对事实的日期。只改措辞、错别字时不要改。',
        },
      },
    },
    {
      name: 'featured',
      type: 'checkbox',
      defaultValue: false,
      label: { en: 'Can be Today’s entry', zh: '可上「今日条目」' },
      admin: {
        position: 'sidebar',
        description: {
          en: 'The Wiki home shows one of these a day. With none ticked, every entry takes a turn.',
          zh: 'Wiki 首页每天轮换一个勾了的条目；一个都没勾时所有条目轮流上。',
        },
      },
    },
    {
      name: 'publishedAt',
      type: 'date',
      label: { en: 'First published', zh: '首次发布时间' },
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: { en: 'Set on the first publish. Orders「Newest entries」.', zh: '第一次发布时自动填，「最新条目」按它排。' },
      },
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: { en: 'Content', zh: '内容' },
          fields: [
            {
              name: 'aliases',
              type: 'text',
              hasMany: true,
              localized: true,
              label: { en: 'Also called', zh: '别名' },
              admin: {
                description: {
                  en: 'Other names readers of this language search for. All languages’ names and aliases find this entry.',
                  zh: '这种语言的读者还会怎么搜它，例如「智能体」「AI 智能体」。所有语言的名称和别名都搜得到这个条目。',
                },
              },
            },
            {
              name: 'definition',
              type: 'textarea',
              localized: true,
              label: { en: 'One-sentence definition', zh: '一句话定义' },
              admin: {
                description: {
                  en: 'One sentence a beginner understands. Also the page description in search engines.',
                  zh: '新手一读就懂的一句话。也是搜索引擎里的页面描述。',
                },
              },
            },
            {
              name: 'explanation',
              type: 'textarea',
              localized: true,
              label: { en: 'In plain words', zh: '白话说明' },
              admin: {
                rows: 8,
                description: { en: 'A blank line starts a new paragraph.', zh: '空一行就是新的一段。' },
              },
            },
            {
              name: 'examples',
              type: 'array',
              localized: true,
              label: { en: 'Examples', zh: '例子' },
              labels: { singular: { en: 'Example', zh: '例子' }, plural: { en: 'Examples', zh: '例子' } },
              fields: [
                { name: 'title', type: 'text', label: { en: 'Heading (optional)', zh: '小标题（选填）' } },
                { name: 'text', type: 'textarea', required: true, label: { en: 'Example', zh: '内容' } },
              ],
            },
            {
              name: 'steps',
              type: 'array',
              localized: true,
              label: { en: 'Steps', zh: '步骤' },
              labels: { singular: { en: 'Step', zh: '步骤' }, plural: { en: 'Steps', zh: '步骤' } },
              admin: { condition: (data) => data?.type === 'method' },
              fields: [
                { name: 'title', type: 'text', required: true, label: { en: 'Step', zh: '这一步做什么' } },
                { name: 'detail', type: 'textarea', label: { en: 'Detail (optional)', zh: '说明（选填）' } },
              ],
            },
            {
              name: 'uses',
              type: 'textarea',
              localized: true,
              label: { en: 'What it is used for', zh: '用途' },
            },
            {
              name: 'limitations',
              type: 'textarea',
              localized: true,
              label: { en: 'Limitations', zh: '局限' },
              admin: { description: { en: 'Where it stops working, what it does not mean.', zh: '哪里不管用、它不代表什么。' } },
            },
            {
              name: 'contexts',
              type: 'array',
              localized: true,
              label: { en: 'In different contexts', zh: '不同语境下' },
              labels: { singular: { en: 'Context', zh: '语境' }, plural: { en: 'Contexts', zh: '语境' } },
              admin: {
                description: {
                  en: 'For words that mean different things in different places, one row each.',
                  zh: '同一个词在不同场合意思不一样时，每种场合写一行。',
                },
              },
              fields: [
                { name: 'label', type: 'text', required: true, label: { en: 'Where', zh: '场合' } },
                { name: 'meaning', type: 'textarea', required: true, label: { en: 'What it means there', zh: '在这里的意思' } },
              ],
            },
            {
              name: 'fact',
              type: 'textarea',
              localized: true,
              label: { en: 'Did you know', zh: '你知道吗' },
              admin: {
                description: {
                  en: 'Optional: one surprising, sourced fact for the「Did you know」box on the Wiki home.',
                  zh: '选填：一条有出处的小知识，给 Wiki 首页的「你知道吗」。',
                },
              },
            },
          ],
        },
        {
          label: { en: 'Relations', zh: '关系' },
          description: {
            en: 'Confirmed by you, not taken from links in the text. Two-way relations need filling on one side only. Links to drafts show once they are published.',
            zh: '由你确认，不从正文的链接推导。双向的关系只要在一边填。指向草稿的关系等那个条目发布后才显示。',
          },
          fields: [
            {
              name: 'topics',
              type: 'relationship',
              relationTo: 'wiki-topics',
              hasMany: true,
              label: { en: 'Topics', zh: '主题' },
              admin: { description: { en: 'The first one is used in the breadcrumb.', zh: '第一个用在面包屑里。' } },
            },
            {
              name: 'prerequisites',
              type: 'relationship',
              relationTo: 'wiki-entries',
              hasMany: true,
              filterOptions: otherEntries,
              label: { en: 'Read first (prerequisites)', zh: '先修（先读这些）' },
              admin: {
                description: {
                  en: 'One way: those pages list this entry under「Read next」. Loops are refused.',
                  zh: '有方向：那些条目页会在「接着读」里列出这个条目。不能绕成圈。',
                },
              },
            },
            {
              name: 'related',
              type: 'relationship',
              relationTo: 'wiki-entries',
              hasMany: true,
              filterOptions: otherEntries,
              label: { en: 'Related', zh: '相关' },
              admin: { description: { en: 'Two-way.', zh: '双向。' } },
            },
            {
              name: 'comparisons',
              type: 'array',
              localized: true,
              label: { en: 'Easily confused with', zh: '易混' },
              labels: { singular: { en: 'Comparison', zh: '易混条目' }, plural: { en: 'Comparisons', zh: '易混条目' } },
              admin: {
                description: {
                  en: 'Two-way: the other entry’s page shows the same difference.',
                  zh: '双向：对方条目页也显示这段区别。',
                },
              },
              fields: [
                {
                  // Not `required`: a NOT NULL column would stop the other entry from being deleted (its foreign
                  // key empties this). The guard asks for it on save, and dropComparisons removes the rows.
                  name: 'entry',
                  type: 'relationship',
                  relationTo: 'wiki-entries',
                  filterOptions: otherEntries,
                  label: { en: 'Entry', zh: '条目' },
                },
                { name: 'difference', type: 'textarea', required: true, label: { en: 'The difference', zh: '区别在哪' } },
              ],
            },
          ],
        },
        {
          label: { en: 'Sources and further reading', zh: '来源与推荐' },
          fields: [
            {
              name: 'sources',
              type: 'array',
              label: { en: 'Sources', zh: '参考来源' },
              labels: { singular: { en: 'Source', zh: '来源' }, plural: { en: 'Sources', zh: '来源' } },
              admin: {
                description: {
                  en: 'Where the facts come from: papers, official docs, reputable articles. Shared by every language.',
                  zh: '事实的出处：论文、官方文档、可靠的文章。五种语言共用。',
                },
              },
              fields: [
                { name: 'title', type: 'text', required: true, label: { en: 'Title', zh: '标题' } },
                { name: 'url', type: 'text', required: true, label: { en: 'Address', zh: '网址' }, validate: urlValidation(true) },
                { name: 'publisher', type: 'text', label: { en: 'Publisher (optional)', zh: '发布者（选填）' } },
              ],
            },
            {
              name: 'apps',
              type: 'relationship',
              relationTo: 'apps',
              hasMany: true,
              filterOptions: publishedOnly,
              label: { en: 'Apps to try', zh: '用得上的应用' },
            },
            {
              name: 'skills',
              type: 'relationship',
              relationTo: 'skills',
              hasMany: true,
              filterOptions: publishedOnly,
              label: { en: 'Skills to try', zh: '用得上的 Skill' },
            },
            {
              name: 'stories',
              type: 'relationship',
              relationTo: 'stories',
              hasMany: true,
              filterOptions: publishedOnly,
              label: { en: 'Related Daily stories', zh: '相关日报' },
            },
          ],
        },
      ],
    },
  ],
}
