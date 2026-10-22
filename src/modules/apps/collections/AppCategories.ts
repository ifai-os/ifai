import type { CollectionConfig } from 'payload'

import { syncHantFromHans } from '@/lib/i18n/hant-sync'

import { appsAdminGroup, isAdmin, slugField } from './shared'

/** The eight categories of the apps directory (seeded by the apps migration). */
export const AppCategories: CollectionConfig = {
  slug: 'app-categories',
  labels: {
    singular: { en: 'App category', zh: '应用分类' },
    plural: { en: 'App categories', zh: '应用分类' },
  },
  admin: {
    useAsTitle: 'name',
    group: appsAdminGroup,
    defaultColumns: ['name', 'slug', 'order'],
    description: {
      en: 'Traditional Chinese is converted from Simplified automatically (OpenCC). Fill in the other languages by hand.',
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
    afterChange: [syncHantFromHans(['name'])],
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
