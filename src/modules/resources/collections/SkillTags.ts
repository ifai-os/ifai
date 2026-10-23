import type { CollectionConfig } from 'payload'

import { syncHantFromHans } from '@/lib/i18n/hant-sync'

import { refreshSkillsAfterChange, refreshSkillsAfterDelete } from '../public/cache'
import { isAdmin, resourcesAdminGroup, slugField } from './shared'

/** Free-form tags on Skills ("Agent", "code review" …). The list page shows the most used ones. */
export const SkillTags: CollectionConfig = {
  slug: 'skill-tags',
  labels: {
    singular: { en: 'Skill tag', zh: 'Skill 标签' },
    plural: { en: 'Skill tags', zh: 'Skill 标签' },
  },
  admin: {
    useAsTitle: 'name',
    group: resourcesAdminGroup,
    defaultColumns: ['name', 'slug', 'updatedAt'],
    description: {
      en: 'Traditional Chinese is converted from Simplified automatically (OpenCC). Fill in the other languages by hand.',
      zh: '繁体中文由简体自动转换（OpenCC），不用手改；英语、日语、韩语分别填写。',
    },
  },
  access: {
    read: () => true,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    afterChange: [syncHantFromHans(['name']), refreshSkillsAfterChange],
    afterDelete: [refreshSkillsAfterDelete],
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
  ],
}
