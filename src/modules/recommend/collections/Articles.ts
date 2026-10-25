import {
  BlockquoteFeature,
  BlocksFeature,
  BoldFeature,
  CodeBlock,
  FixedToolbarFeature,
  HeadingFeature,
  HorizontalRuleFeature,
  InlineCodeFeature,
  InlineToolbarFeature,
  ItalicFeature,
  LinkFeature,
  OrderedListFeature,
  ParagraphFeature,
  StrikethroughFeature,
  UnorderedListFeature,
  UploadFeature,
  lexicalEditor,
} from '@payloadcms/richtext-lexical'
import type { CollectionBeforeChangeHook, CollectionConfig } from 'payload'

import { rejectField } from '@/lib/field-error'
import { adminMessage, isAdmin, localeOptions } from '@/modules/apps/collections/shared'

import { refreshArticlesAfterChange, refreshArticlesAfterDelete } from '../cache'
import {
  articleChannels,
  cleanTags,
  maxPickReasonLength,
  maxSummaryLength,
  maxTagLength,
  maxTags,
  maxTitleLength,
  plainText,
  readingMinutes,
  type RichText,
} from '../rules'

export const recommendAdminGroup = { en: 'Recommend', zh: '推荐' }

const channelLabels: Record<(typeof articleChannels)[number], { en: string; zh: string }> = {
  models: { en: 'Models', zh: '大模型' },
  agents: { en: 'Agents', zh: 'Agent' },
  coding: { en: 'AI coding', zh: 'AI 编程' },
  prompts: { en: 'Prompts', zh: '提示词' },
  images: { en: 'AI images', zh: 'AI 绘画' },
  design: { en: 'Product & design', zh: '产品与设计' },
  career: { en: 'Careers', zh: '职场' },
}

/**
 * 发布时间 is the first time an article went public and stays; 精选时间 is when it was picked.
 * A pick needs its reason (docs/specs/recommend.md 规则 2); tags are tidied (规则 4) and the
 * reading time is counted from the body (规则 9), so lists need not load bodies.
 */
const stampAndCheck: CollectionBeforeChangeHook = ({ data, originalDoc, req }) => {
  const next = { ...data }
  const status = next.status ?? originalDoc?.status
  if (status === 'published' && !(next.publishedAt ?? originalDoc?.publishedAt)) next.publishedAt = new Date().toISOString()

  const featured = next.featured ?? originalDoc?.featured
  if (featured) {
    const reason = String(next.featuredReason ?? originalDoc?.featuredReason ?? '').trim()
    if (!reason) {
      rejectField(
        'articles',
        'featuredReason',
        adminMessage(req, {
          en: 'A picked article needs a reason: one line on why it is worth reading.',
          zh: '精选要写理由：一句话说说为什么值得读。',
        }),
      )
    }
    // A new pick gets the time; an existing one keeps its own (scripts may set it).
    if (!next.featuredAt && !(originalDoc?.featured && originalDoc?.featuredAt)) next.featuredAt = new Date().toISOString()
  } else if (next.featured === false) {
    next.featuredAt = null
  }

  if (next.body !== undefined) next.readingMinutes = readingMinutes(plainText(next.body as RichText))
  if (Array.isArray(next.tags)) next.tags = cleanTags(next.tags.map((row: { tag?: unknown }) => row?.tag)).map((tag) => ({ tag }))
  return next
}

/** Code block languages (Monaco's ids): the common ones in AI articles, plain text first. */
const codeLanguages: Record<string, string> = {
  plaintext: 'Plain text',
  python: 'Python',
  typescript: 'TypeScript',
  javascript: 'JavaScript',
  shell: 'Shell',
  json: 'JSON',
  yaml: 'YAML',
  markdown: 'Markdown',
  sql: 'SQL',
  html: 'HTML',
  css: 'CSS',
  go: 'Go',
  rust: 'Rust',
  java: 'Java',
}

/** What an article's body can hold (规则 7): no internal links, tables, alignment or colors. */
const bodyEditor = lexicalEditor({
  features: [
    ParagraphFeature(),
    HeadingFeature({ enabledHeadingSizes: ['h2', 'h3'] }),
    BoldFeature(),
    ItalicFeature(),
    StrikethroughFeature(),
    InlineCodeFeature(),
    LinkFeature(),
    UnorderedListFeature(),
    OrderedListFeature(),
    BlockquoteFeature(),
    HorizontalRuleFeature(),
    UploadFeature({ collections: { media: { fields: [{ name: 'caption', type: 'text', label: { en: 'Caption', zh: '图注' } }] } } }),
    BlocksFeature({ blocks: [CodeBlock({ languages: codeLanguages, defaultLanguage: 'plaintext' })] }),
    FixedToolbarFeature(),
    InlineToolbarFeature(),
  ],
})

/**
 * Long articles (docs/specs/recommend.md). In step 1 the site owner writes them here, signed
 * 「IFAI 编辑部」; readers write theirs from step 2. Each is in one language, as written.
 */
export const Articles: CollectionConfig = {
  slug: 'articles',
  labels: {
    singular: { en: 'Article', zh: '文章' },
    plural: { en: 'Articles', zh: '文章' },
  },
  admin: {
    useAsTitle: 'title',
    group: recommendAdminGroup,
    defaultColumns: ['title', 'channel', 'status', 'featured', 'publishedAt'],
    listSearchableFields: ['title', 'summary'],
    description: {
      en: 'An article is in the one language it is written in: the content-language picker above does not apply. Published articles show under Latest; tick “Picked” and give a reason to put one under Recommended and at the top of the page.',
      zh: '文章用哪种语言写就是哪种语言，上面的「内容语言」对文章不起作用。已发布的文章出现在「最新」；勾上「精选」并写理由，才进「推荐」和页面顶部。',
    },
  },
  defaultSort: '-updatedAt',
  access: {
    read: ({ req: { user } }) => (user ? true : { status: { equals: 'published' } }),
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeChange: [stampAndCheck],
    afterChange: [refreshArticlesAfterChange],
    afterDelete: [refreshArticlesAfterDelete],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      maxLength: maxTitleLength,
      label: { en: 'Title', zh: '标题' },
    },
    {
      name: 'summary',
      type: 'textarea',
      maxLength: maxSummaryLength,
      label: { en: 'Summary', zh: '摘要' },
      admin: {
        description: {
          en: 'One or two sentences under the title in lists and for search engines.',
          zh: '一两句话，显示在列表的标题下面，也给搜索引擎。',
        },
      },
    },
    {
      name: 'cover',
      type: 'upload',
      relationTo: 'media',
      label: { en: 'Cover image', zh: '头图' },
      admin: {
        description: {
          en: 'About 2 : 1, at least 1360 px wide. Optional.',
          zh: '约 2 : 1，宽至少 1360 像素。可以不放。',
        },
      },
    },
    {
      name: 'body',
      type: 'richText',
      required: true,
      editor: bodyEditor,
      label: { en: 'Body', zh: '正文' },
      admin: {
        description: {
          en: 'Second-level headings make the table of contents (two or more). Links open in a new tab.',
          zh: '二级标题会变成目录（两个以上时显示）。链接在新窗口打开。',
        },
      },
    },
    {
      name: 'tags',
      type: 'array',
      maxRows: maxTags,
      label: { en: 'Tags', zh: '标签' },
      labels: { singular: { en: 'Tag', zh: '标签' }, plural: { en: 'Tags', zh: '标签' } },
      admin: {
        description: {
          en: `Up to ${maxTags}, each up to ${maxTagLength} characters, e.g. RAG. Readers click one to see the articles with it.`,
          zh: `最多 ${maxTags} 个，每个最多 ${maxTagLength} 字，例如 RAG。读者点标签能看到带它的文章。`,
        },
      },
      fields: [{ name: 'tag', type: 'text', required: true, maxLength: maxTagLength, label: { en: 'Tag', zh: '标签' } }],
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
        { value: 'hidden', label: { en: 'Hidden', zh: '已隐藏' } },
      ],
      admin: {
        position: 'sidebar',
        description: {
          en: 'Hidden articles are off the site; their address answers “not found”.',
          zh: '已隐藏的文章从网站上消失，地址打开是「找不到页面」。',
        },
      },
    },
    {
      name: 'lang',
      type: 'select',
      required: true,
      defaultValue: 'zh-Hans',
      label: { en: 'Written in', zh: '正文语言' },
      options: localeOptions,
      admin: {
        position: 'sidebar',
        description: {
          en: 'The article’s address in this language is the one search engines keep.',
          zh: '搜索引擎收录的是这种语言下的文章地址。',
        },
      },
    },
    {
      name: 'channel',
      type: 'select',
      required: true,
      index: true,
      label: { en: 'Channel', zh: '频道' },
      options: articleChannels.map((value) => ({ value, label: channelLabels[value] })),
      admin: { position: 'sidebar' },
    },
    {
      name: 'featured',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      label: { en: 'Picked', zh: '精选' },
      admin: {
        position: 'sidebar',
        description: {
          en: 'Picked articles show under Recommended, newest pick first; the last three at the top of the page.',
          zh: '精选的文章进「推荐」，最近精选的在前；最近 3 篇显示在页面顶部。',
        },
      },
    },
    {
      name: 'featuredReason',
      type: 'text',
      maxLength: maxPickReasonLength,
      label: { en: 'Why it is picked', zh: '精选理由' },
      admin: {
        position: 'sidebar',
        description: {
          en: 'One line in the article’s language, shown with it. Picking is not an endorsement.',
          zh: '一句话，和文章用同一种语言，会和文章一起显示。精选不代表官方背书。',
        },
      },
    },
    {
      name: 'publishedAt',
      type: 'date',
      index: true,
      label: { en: 'Published', zh: '发布时间' },
      admin: {
        position: 'sidebar',
        readOnly: true,
        date: { pickerAppearance: 'dayAndTime' },
        description: { en: 'Set the first time it is published.', zh: '第一次发布时自动填写。' },
      },
    },
    {
      name: 'readingMinutes',
      type: 'number',
      label: { en: 'Minutes to read', zh: '阅读时长（分钟）' },
      admin: { position: 'sidebar', readOnly: true, description: { en: 'Counted from the body when it is saved.', zh: '保存时按正文字数算。' } },
    },
    {
      name: 'featuredAt',
      type: 'date',
      index: true,
      label: { en: 'Picked at', zh: '精选时间' },
      admin: { position: 'sidebar', readOnly: true, date: { pickerAppearance: 'dayAndTime' } },
    },
  ],
}
