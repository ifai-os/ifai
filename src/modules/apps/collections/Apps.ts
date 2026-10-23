import type { CollectionConfig, FieldAccess, RelationshipFieldSingleValidation, TextFieldSingleValidation } from 'payload'
import { relationship, text } from 'payload/shared'

import { syncHantFromHans } from '@/lib/i18n/hant-sync'

import { refreshAppsAfterChange, refreshAppsAfterDelete } from '../cache'
import { heatEndpoints } from '../metrics/endpoints'
import { domainFromUrl, isHttpUrl, reservedAppSlugs } from '../normalize'
import { draftEndpoints } from '../profile/endpoints'
import { reviewEndpoints } from '../reviews/endpoints'
import { adminMessage, appsAdminGroup, isAdmin, slugField } from './shared'

/** Localized fields whose zh-Hant value is converted from zh-Hans. */
const hantFields = ['tagline', 'description', 'features', 'faqs', 'tags'] as const

const validateWebsite: TextFieldSingleValidation = (value, args) => {
  const required = text(value, args)
  if (required !== true) return required
  return typeof value === 'string' && isHttpUrl(value)
    ? true
    : adminMessage(args.req, {
        en: 'Enter a full address starting with https://',
        zh: '填完整的网址，以 https:// 开头。',
      })
}

/** Drafts may wait for their category (the profile draft suggests one); published apps need it. */
const validateCategory: RelationshipFieldSingleValidation = async (value, args) => {
  const valid = await relationship(value, args)
  if (valid !== true) return valid
  return value || (args.data as { status?: string } | undefined)?.status !== 'published'
    ? true
    : adminMessage(args.req, { en: 'Pick a category before publishing.', zh: '发布前要选主分类。' })
}

const signedIn: FieldAccess = ({ req: { user } }) => Boolean(user)
/** Written by the profile-draft job and the back-office endpoints only (the Local API skips access). */
const jobsOnly: FieldAccess = () => false

/**
 * The apps directory (docs/specs/apps.md). Profiles are written per language from the
 * app's own website; the public only ever sees published apps.
 */
export const Apps: CollectionConfig = {
  slug: 'apps',
  labels: {
    singular: { en: 'App', zh: '应用' },
    plural: { en: 'Apps', zh: '应用' },
  },
  admin: {
    useAsTitle: 'name',
    group: appsAdminGroup,
    defaultColumns: ['name', 'primaryCategory', 'pricing', 'status', 'draftStatus', 'updatedAt'],
    listSearchableFields: ['name', 'slug', 'domain'],
    components: {
      beforeListTable: [
        '/modules/apps/admin/heat-status#HeatStatus',
        '/modules/apps/admin/review-reports#ReviewReports',
        '/modules/apps/admin/import-box#ImportBox',
      ],
    },
    description: {
      en: 'Traditional Chinese is converted from Simplified automatically (OpenCC). Write English, Japanese and Korean separately.',
      zh: '繁体中文由简体自动转换（OpenCC），不用手改；英语、日语、韩语分别填写。',
    },
  },
  access: {
    read: ({ req: { user } }) => (user ? true : { status: { equals: 'published' } }),
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    afterChange: [syncHantFromHans(hantFields), refreshAppsAfterChange],
    afterDelete: [refreshAppsAfterDelete],
  },
  endpoints: [...draftEndpoints, ...heatEndpoints, ...reviewEndpoints],
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: { en: 'Name', zh: '名称' },
      admin: { description: { en: 'As the app writes it.', zh: '按应用自己的写法。' } },
    },
    slugField({ from: 'name', reserved: reservedAppSlugs }),
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
        { value: 'delisted', label: { en: 'Delisted', zh: '已下架' } },
      ],
      admin: { position: 'sidebar' },
    },
    {
      name: 'listedAt',
      type: 'date',
      label: { en: 'Listed on', zh: '收录时间' },
      defaultValue: () => new Date().toISOString(),
      admin: { position: 'sidebar' },
    },
    {
      name: 'checkedAt',
      type: 'date',
      label: { en: 'Profile checked on', zh: '资料核对时间' },
      admin: {
        position: 'sidebar',
        description: { en: 'Re-check pricing and platforms every 90 days.', zh: '每 90 天重新核对一次定价和平台。' },
      },
    },
    {
      name: 'draftStatus',
      type: 'select',
      index: true,
      label: { en: 'Profile draft', zh: '资料草稿' },
      options: [
        { value: 'pending', label: { en: 'Waiting', zh: '待生成' } },
        { value: 'drafted', label: { en: 'Drafted', zh: '已生成' } },
        { value: 'failed', label: { en: 'Not written', zh: '没生成' } },
      ],
      access: { read: signedIn, create: jobsOnly, update: jobsOnly },
      // Shown as the「资料草稿」panel (state, check results, generate button); a plain column in the list.
      admin: { position: 'sidebar', readOnly: true, components: { Field: '/modules/apps/admin/draft-panel#DraftPanel' } },
    },
    {
      name: 'draftInfo',
      type: 'json',
      label: { en: 'Profile draft details', zh: '资料草稿详情' },
      access: { read: signedIn, create: jobsOnly, update: jobsOnly },
      admin: { hidden: true },
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: { en: 'Basics', zh: '基本信息' },
          fields: [
            {
              name: 'website',
              type: 'text',
              required: true,
              label: { en: 'Website', zh: '官网网址' },
              validate: validateWebsite,
            },
            {
              name: 'domain',
              type: 'text',
              index: true,
              label: { en: 'Domain', zh: '官网域名' },
              admin: {
                description: {
                  en: 'For the Tranco rank (looked up by its registered domain: chat.deepseek.com → deepseek.com) and news-mention matching. Left empty, it is taken from the website (without www.).',
                  zh: '用于 Tranco 排名（按注册域名查，chat.deepseek.com 查 deepseek.com）和日报提及匹配。留空时取官网网址的主机名（去掉 www.）。',
                },
              },
              hooks: {
                beforeValidate: [
                  ({ value, siblingData }) =>
                    typeof value === 'string' && value.trim()
                      ? value.trim().toLowerCase()
                      : domainFromUrl(String(siblingData?.website ?? '')),
                ],
              },
            },
            {
              name: 'developer',
              type: 'text',
              label: { en: 'Developer', zh: '开发者' },
            },
            {
              name: 'aliases',
              type: 'text',
              hasMany: true,
              label: { en: 'Aliases', zh: '别名' },
              admin: {
                description: {
                  en: 'Other names people use. Matched against news mentions and search.',
                  zh: '其他叫法，用于匹配日报提及和搜索。',
                },
              },
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'primaryCategory',
                  type: 'relationship',
                  relationTo: 'app-categories',
                  index: true,
                  label: { en: 'Category', zh: '主分类' },
                  validate: validateCategory,
                  admin: {
                    description: {
                      en: 'Needed to publish. The profile draft suggests one.',
                      zh: '发布前必填；生成草稿时会按官网建议一个。',
                    },
                  },
                },
                {
                  name: 'secondaryCategories',
                  type: 'relationship',
                  relationTo: 'app-categories',
                  hasMany: true,
                  maxRows: 2,
                  label: { en: 'Also in', zh: '次分类' },
                },
              ],
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'pricing',
                  type: 'select',
                  label: { en: 'Pricing', zh: '定价' },
                  options: [
                    { value: 'free', label: { en: 'Free', zh: '免费' } },
                    { value: 'freemium', label: { en: 'Free + paid', zh: '免费 + 付费' } },
                    { value: 'paid', label: { en: 'Paid', zh: '付费' } },
                    { value: 'open-source', label: { en: 'Open source', zh: '开源' } },
                  ],
                  admin: {
                    description: { en: 'Leave empty if the website does not say.', zh: '官网没写就留空。' },
                  },
                },
                {
                  name: 'platforms',
                  type: 'select',
                  hasMany: true,
                  label: { en: 'Platforms', zh: '平台' },
                  options: [
                    { value: 'web', label: { en: 'Web', zh: '网页' } },
                    { value: 'desktop', label: { en: 'Desktop', zh: '桌面端' } },
                    { value: 'mobile', label: { en: 'Mobile', zh: '手机' } },
                    { value: 'browser-extension', label: { en: 'Browser extension', zh: '浏览器插件' } },
                    { value: 'api', label: { en: 'API', zh: 'API' } },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: { en: 'Profile', zh: '介绍' },
          description: {
            en: 'Written per language from the website. Only facts the website states.',
            zh: '每种语言按官网材料分别写，只写官网上有的事实。',
          },
          fields: [
            {
              name: 'tagline',
              type: 'text',
              localized: true,
              maxLength: 120,
              label: { en: 'One-line summary', zh: '一句话介绍' },
            },
            {
              name: 'description',
              type: 'textarea',
              localized: true,
              label: { en: 'What it is', zh: '它是什么' },
            },
            {
              name: 'features',
              type: 'array',
              localized: true,
              maxRows: 8,
              label: { en: 'Key features', zh: '核心功能' },
              labels: {
                singular: { en: 'Feature', zh: '功能' },
                plural: { en: 'Features', zh: '功能' },
              },
              fields: [
                { name: 'title', type: 'text', required: true, label: { en: 'Title', zh: '标题' } },
                { name: 'detail', type: 'textarea', label: { en: 'Detail', zh: '说明' } },
              ],
            },
            {
              name: 'faqs',
              type: 'array',
              localized: true,
              maxRows: 10,
              label: { en: 'FAQ', zh: '常见问题' },
              labels: {
                singular: { en: 'Question', zh: '问题' },
                plural: { en: 'Questions', zh: '问题' },
              },
              fields: [
                { name: 'question', type: 'text', required: true, label: { en: 'Question', zh: '问题' } },
                { name: 'answer', type: 'textarea', required: true, label: { en: 'Answer', zh: '回答' } },
              ],
            },
            {
              name: 'tags',
              type: 'text',
              hasMany: true,
              localized: true,
              maxRows: 8,
              label: { en: 'Tags', zh: '标签' },
            },
          ],
        },
        {
          label: { en: 'Images', zh: '图片' },
          fields: [
            {
              name: 'logo',
              type: 'upload',
              relationTo: 'media',
              label: { en: 'Logo', zh: 'Logo' },
              admin: {
                description: {
                  en: "The website's own icon. Empty → the initial-letter tile.",
                  zh: '用官网自己的图标；没有时显示首字母图标。',
                },
              },
            },
            {
              name: 'screenshot',
              type: 'upload',
              relationTo: 'media',
              label: { en: 'Screenshot', zh: '截图' },
              admin: {
                description: {
                  en: "The website's share image (og:image) for now; replace it by hand if needed.",
                  zh: '先用官网的分享图（og 图），需要时手动换。',
                },
              },
            },
          ],
        },
        {
          label: { en: 'Alternatives', zh: '替代品' },
          fields: [
            {
              name: 'alternatives',
              type: 'relationship',
              relationTo: 'apps',
              hasMany: true,
              maxRows: 8,
              label: { en: 'Alternatives', zh: '替代品' },
              filterOptions: ({ id }) => (id ? { id: { not_equals: id } } : true),
              admin: {
                description: {
                  en: 'Optional. Empty → the top apps of the same category by heat.',
                  zh: '可以不填；不填时取同分类热度最高的几个。',
                },
              },
            },
          ],
        },
        {
          label: { en: 'Heat', zh: '热度' },
          description: {
            en: 'Computed every day at 06:00 Shanghai time from the Tranco rank, clicks and saves on IFAI, and daily-story mentions.',
            zh: '每天上海时间 06:00 按 Tranco 排名、站内点击与收藏、日报提及计算。',
          },
          fields: [
            {
              name: 'heatPanel',
              type: 'ui',
              admin: { components: { Field: '/modules/apps/admin/heat-panel#HeatPanel' } },
            },
          ],
        },
        {
          label: { en: 'Reviews', zh: '评价' },
          description: {
            en: 'Readers’ reviews go live at once. Hide one that breaks the rules; reported ones are marked.',
            zh: '读者的评价直接发布。违规的可以隐藏；被举报的会标出来。',
          },
          fields: [
            {
              name: 'reviewsPanel',
              type: 'ui',
              admin: { components: { Field: '/modules/apps/admin/reviews-panel#ReviewsPanel' } },
            },
          ],
        },
      ],
    },
  ],
}
