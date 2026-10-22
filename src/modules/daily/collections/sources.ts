import type { CollectionConfig } from 'payload'

import { testFetch } from '../collect/fetch'
import { sourceTypes, validateSourceConfig, validateSourceUrl } from '../source-config'
import { sourceTiers, sourceUses } from '../types'

const signedIn = ({ req: { user } }: { req: { user: unknown } }) => Boolean(user)

const typeLabels = {
  rss: { en: 'Feed (RSS / Atom / JSON Feed)', zh: '订阅源（RSS / Atom / JSON Feed）' },
  html_list: { en: 'Web page list (CSS selectors)', zh: '网页列表（CSS 选择器）' },
  json: { en: 'JSON API', zh: 'JSON 接口' },
} as const

const tierLabels = {
  T1: { en: 'T1 · official', zh: 'T1 · 官方一手' },
  T1_5: { en: 'T1.5 · official accounts', zh: 'T1.5 · 官方账号与准官方' },
  T2: { en: 'T2 · media and individuals', zh: 'T2 · 媒体与个人' },
} as const

const useLabels = {
  editorial: { en: 'Editorial · can become a story', zh: '可以成为新闻' },
  roundup: { en: 'Roundup · links its mentions to events', zh: '汇总稿，只把提到的新闻挂到事件上' },
  hot_signal: { en: 'Hot signal · popularity evidence only', zh: '只当热度证据' },
} as const

const readOnlyDate = (name: string, label: { en: string; zh: string }) =>
  ({
    name,
    type: 'date',
    label,
    admin: { readOnly: true, position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
  }) as const

/**
 * Where the daily module collects from (docs/specs/daily.md「信源」). The owner edits these in
 * /admin; the collection jobs (./collect) fetch each enabled source on its own interval and
 * write what they find to `raw_items`. The status fields in the sidebar are set by the jobs.
 */
export const Sources: CollectionConfig = {
  slug: 'sources',
  labels: {
    singular: { en: 'Source', zh: '信源' },
    plural: { en: 'Sources', zh: '信源' },
  },
  admin: {
    useAsTitle: 'name',
    group: { en: 'Daily', zh: '日报' },
    defaultColumns: ['name', 'type', 'tier', 'use', 'enabled', 'lastSuccessAt', 'lastError'],
  },
  access: { read: signedIn, create: signedIn, update: signedIn, delete: signedIn },
  endpoints: [
    {
      // POST /api/sources/:id/test-fetch — fetch and read once, write nothing (the「试抓」button).
      path: '/:id/test-fetch',
      method: 'post',
      handler: async (req) => {
        if (!req.user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
        const id = Number(req.routeParams?.id)
        if (!Number.isInteger(id)) return Response.json({ error: 'Bad id' }, { status: 400 })
        const source = await req.payload.findByID({ collection: 'sources', id, req })
        return Response.json(await testFetch(source))
      },
    },
  ],
  fields: [
    { name: 'name', type: 'text', required: true, label: { en: 'Name', zh: '名称' } },
    {
      type: 'row',
      fields: [
        {
          name: 'type',
          type: 'select',
          required: true,
          defaultValue: 'rss',
          label: { en: 'Type', zh: '抓取方式' },
          options: sourceTypes.map((value) => ({ value, label: typeLabels[value] })),
        },
        {
          name: 'tier',
          type: 'select',
          required: true,
          defaultValue: 'T2',
          label: { en: 'Tier', zh: '分级' },
          options: sourceTiers.map((value) => ({ value, label: tierLabels[value] })),
        },
        {
          name: 'use',
          type: 'select',
          required: true,
          defaultValue: 'editorial',
          label: { en: 'Use', zh: '用途' },
          options: sourceUses.map((value) => ({ value, label: useLabels[value] })),
        },
      ],
    },
    {
      name: 'url',
      type: 'text',
      required: true,
      label: { en: 'Fetch URL', zh: '抓取地址' },
      validate: validateSourceUrl,
      admin: {
        description: {
          en: 'The feed, list page or API address that is fetched.',
          zh: '实际抓取的地址：订阅源、列表页或接口。',
        },
      },
    },
    { name: 'homepage', type: 'text', label: { en: 'Homepage', zh: '网站首页' } },
    {
      name: 'config',
      type: 'json',
      label: { en: 'Reader settings', zh: '读取设置' },
      validate: (value, { jsonError, siblingData }) =>
        jsonError ?? validateSourceConfig((siblingData as { type?: unknown }).type, value),
      admin: {
        condition: (data) => data?.type !== 'rss',
        description: {
          en: 'Web list: {"item", "link", "title", "summary", "date", "dateAttr", "group", "groupDate", "skipHosts"}. JSON: {"kind": "hacker_news", "minPoints": 50}.',
          zh: '网页列表填选择器：{"item", "link", "title", "summary", "date", "dateAttr", "group", "groupDate", "skipHosts"}；JSON 接口填 {"kind": "hacker_news", "minPoints": 50}。',
        },
      },
    },
    {
      name: 'intervalMinutes',
      type: 'number',
      required: true,
      defaultValue: 60,
      min: 15,
      max: 180,
      label: { en: 'Fetch interval (minutes)', zh: '抓取间隔（分钟）' },
      admin: {
        description: {
          en: 'Adjusted automatically from the last 7 days of output: 15–60, up to 180 for hot signals.',
          zh: '按近 7 天的产出自动调整：15–60 分钟，只当热度证据的信源最长 180 分钟。',
        },
      },
    },
    { name: 'notes', type: 'textarea', label: { en: 'Notes', zh: '备注' } },
    {
      name: 'testFetch',
      type: 'ui',
      admin: { components: { Field: '/modules/daily/admin/test-fetch-button#TestFetchButton' } },
    },
    {
      name: 'enabled',
      type: 'checkbox',
      defaultValue: true,
      label: { en: 'Enabled', zh: '启用' },
      admin: { position: 'sidebar' },
    },
    readOnlyDate('lastFetchedAt', { en: 'Last fetched', zh: '最近抓取' }),
    readOnlyDate('lastSuccessAt', { en: 'Last success', zh: '最近成功' }),
    readOnlyDate('nextFetchAt', { en: 'Next fetch', zh: '下次抓取' }),
    readOnlyDate('firstFetchedAt', { en: 'First fetched', zh: '首次抓取' }),
    {
      name: 'lastItemCount',
      type: 'number',
      label: { en: 'Items in last fetch', zh: '最近一次抓到' },
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'itemsLast7Days',
      type: 'number',
      label: { en: 'New items, last 7 days', zh: '近 7 天新条目' },
      admin: { readOnly: true, position: 'sidebar' },
    },
    {
      name: 'lastError',
      type: 'textarea',
      label: { en: 'Last error', zh: '最近失败原因' },
      admin: { readOnly: true, position: 'sidebar' },
    },
  ],
}
