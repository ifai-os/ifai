import type { Option } from 'payload'

import { promptLangs, regions, weightsKinds } from '../rules'

export { adminMessage, isAdmin, slugField } from '@/modules/apps/collections/shared'

export const rankingsAdminGroup = { en: 'Rankings', zh: '排行' }

const langLabels: Record<(typeof promptLangs)[number], { en: string; zh: string }> = {
  en: { en: 'English', zh: '英语' },
  'zh-Hans': { en: 'Simplified Chinese', zh: '简体中文' },
  ja: { en: 'Japanese', zh: '日语' },
  ko: { en: 'Korean', zh: '韩语' },
}

/** The languages a question can be written in (docs/specs/rankings.md rule 5). */
export const promptLangOptions: Option[] = promptLangs.map((value) => ({ value, label: langLabels[value] }))

const weightsLabels: Record<(typeof weightsKinds)[number], { en: string; zh: string }> = {
  open: { en: 'Open weights', zh: '开放权重' },
  closed: { en: 'Closed', zh: '闭源' },
}

export const weightsOptions: Option[] = weightsKinds.map((value) => ({ value, label: weightsLabels[value] }))

const regionLabels: Record<(typeof regions)[number], { en: string; zh: string }> = {
  us: { en: 'United States', zh: '美国' },
  cn: { en: 'China', zh: '中国' },
  eu: { en: 'Europe', zh: '欧洲' },
  other: { en: 'Elsewhere', zh: '其他' },
}

export const regionOptions: Option[] = regions.map((value) => ({ value, label: regionLabels[value] }))
