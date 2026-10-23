import type { CollectionConfig } from 'payload'

import { syncHantFromHans } from '@/lib/i18n/hant-sync'

import { refreshSkillsAfterChange, refreshSkillsAfterDelete } from '../public/cache'
import { isAdmin, resourcesAdminGroup, slugField, urlValidation } from './shared'

/**
 * The AI assistants a Skill can be installed into (docs/specs/resources.md, rule 11). The six
 * hosts are seeded by the resources migration; directories, websites and install notes are
 * filled in here. Official logos are a launch item in docs/status.md.
 */
export const AgentHosts: CollectionConfig = {
  slug: 'agent-hosts',
  labels: {
    singular: { en: 'Agent host', zh: '宿主' },
    plural: { en: 'Agent hosts', zh: '宿主' },
  },
  admin: {
    useAsTitle: 'name',
    group: resourcesAdminGroup,
    defaultColumns: ['name', 'slug', 'enabled', 'order'],
    description: {
      en: 'Install notes: Traditional Chinese is converted from Simplified automatically (OpenCC); write English, Japanese and Korean separately.',
      zh: '安装说明的繁体中文由简体自动转换（OpenCC），不用手改；英语、日语、韩语分别填写。',
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
    afterChange: [syncHantFromHans(['instructions']), refreshSkillsAfterChange],
    afterDelete: [refreshSkillsAfterDelete],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      label: { en: 'Name', zh: '名称' },
      admin: { description: { en: 'As the product writes it, in every language.', zh: '按产品自己的写法，各语言相同。' } },
    },
    slugField({ from: 'name' }),
    {
      name: 'enabled',
      type: 'checkbox',
      defaultValue: true,
      label: { en: 'Shown in the install panel', zh: '在安装面板里显示' },
      admin: { position: 'sidebar' },
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
      label: { en: 'Order', zh: '排序' },
      admin: { position: 'sidebar', description: { en: 'Smaller comes first.', zh: '数字越小越靠前。' } },
    },
    {
      name: 'website',
      type: 'text',
      label: { en: 'Website', zh: '官网' },
      validate: urlValidation(false),
    },
    {
      name: 'logo',
      type: 'upload',
      relationTo: 'media',
      label: { en: 'Logo', zh: 'Logo' },
      admin: {
        description: {
          en: 'The official, licensed logo only. Empty → the initial-letter tile.',
          zh: '只放官方授权的 logo；没有时显示首字母图标。',
        },
      },
    },
    {
      type: 'row',
      fields: [
        {
          name: 'globalDir',
          type: 'text',
          label: { en: 'Global Skills directory', zh: '全局 Skills 目录' },
          admin: { description: { en: 'e.g. ~/.claude/skills/', zh: '例如 ~/.claude/skills/' } },
        },
        {
          name: 'projectDir',
          type: 'text',
          label: { en: 'Project Skills directory', zh: '项目级 Skills 目录' },
          admin: { description: { en: 'e.g. .claude/skills/', zh: '例如 .claude/skills/' } },
        },
      ],
    },
    {
      name: 'instructions',
      type: 'textarea',
      localized: true,
      label: { en: 'Install notes', zh: '安装说明' },
      admin: {
        description: {
          en: 'How to enable a Skill in this host after the files are in place. Shown in the install guide and install.md.',
          zh: '文件放好之后怎么在这个宿主里启用。显示在使用指南和 install.md 里。',
        },
      },
    },
  ],
}
