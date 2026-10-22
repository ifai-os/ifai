import type { CollectionConfig, SelectFieldSingleValidation } from 'payload'

import { syncHantFromHans } from '@/lib/i18n/hant-sync'

import { skillCategories, skillCategoryLabels } from '../categories'
import { adminMessage, isAdmin, resourcesAdminGroup, slugField, urlValidation } from './shared'

/** Localized fields whose zh-Hant value is converted from zh-Hans. */
const hantFields = ['name', 'tagline', 'capabilities', 'example', 'workflow', 'notes', 'ownerNotes'] as const

/** A Skill goes public only with a version to install (docs/specs/resources.md, «页面与路由»). */
const validateStatus: SelectFieldSingleValidation = (value, { req, siblingData }) =>
  value === 'published' && !(siblingData as Record<string, unknown> | undefined)?.currentVersion
    ? adminMessage(req, {
        en: 'Pick the current version before publishing.',
        zh: '发布前先选当前版本。',
      })
    : true

/**
 * One Agent Skill: the stable identity behind /resources/skills/<slug> (docs/specs/resources.md,
 * «数据»). Files, fingerprints and declarations live on its versions; the texts here are written
 * per language and reviewed by the owner before publishing. The public only sees published Skills.
 */
export const Skills: CollectionConfig = {
  slug: 'skills',
  labels: {
    singular: { en: 'Skill', zh: 'Skill' },
    plural: { en: 'Skills', zh: 'Skills' },
  },
  admin: {
    useAsTitle: 'name',
    group: resourcesAdminGroup,
    defaultColumns: ['name', 'category', 'status', 'certified', 'updatedAt'],
    listSearchableFields: ['name', 'slug'],
    description: {
      en: 'Traditional Chinese is converted from Simplified automatically (OpenCC). Write English, Japanese and Korean separately. Files and fingerprints are on the versions.',
      zh: '繁体中文由简体自动转换（OpenCC），不用手改；英语、日语、韩语分别填写。文件和指纹在「Skill 版本」里。',
    },
  },
  access: {
    read: ({ req: { user } }) => (user ? true : { status: { equals: 'published' } }),
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    afterChange: [syncHantFromHans(hantFields)],
  },
  fields: [
    {
      name: 'name',
      type: 'text',
      required: true,
      localized: true,
      label: { en: 'Display name', zh: '显示名' },
      admin: { description: { en: 'Per language. The slug and SKILL.md stay in the original.', zh: '按语言分别写；slug 和 SKILL.md 保持原文。' } },
    },
    slugField({ from: 'name' }),
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'draft',
      index: true,
      label: { en: 'Status', zh: '状态' },
      options: [
        { value: 'draft', label: { en: 'Draft', zh: '草稿' } },
        { value: 'in_review', label: { en: 'In review', zh: '待审' } },
        { value: 'published', label: { en: 'Published', zh: '已发布' } },
        { value: 'delisted', label: { en: 'Delisted', zh: '已下架' } },
      ],
      validate: validateStatus,
      admin: { position: 'sidebar' },
    },
    {
      name: 'delistReason',
      type: 'textarea',
      label: { en: 'Delist reason', zh: '下架原因' },
      admin: {
        position: 'sidebar',
        condition: (data) => data?.status === 'delisted',
        description: { en: 'Shown on the Skill page in place of the install panel.', zh: '显示在 Skill 主页上，代替安装面板。' },
      },
    },
    {
      name: 'currentVersion',
      type: 'relationship',
      relationTo: 'skill-versions',
      label: { en: 'Current version', zh: '当前版本' },
      filterOptions: ({ id }) => (id ? { skill: { equals: id } } : false),
      admin: {
        position: 'sidebar',
        description: { en: 'The version the Skill page shows and installs.', zh: 'Skill 主页显示和安装的版本。' },
      },
    },
    {
      name: 'certified',
      type: 'checkbox',
      defaultValue: false,
      index: true,
      label: { en: 'IFAI certified', zh: 'IFAI 认证' },
      admin: {
        position: 'sidebar',
        description: {
          en: 'Only after you installed it in at least one host and ran the task SKILL.md describes (rule 5).',
          zh: '你亲自在至少一个宿主里装好、跑通 SKILL.md 描述的任务之后再勾（规则 5）。',
        },
      },
    },
    {
      name: 'featured',
      type: 'checkbox',
      defaultValue: false,
      label: { en: 'Pick of the week', zh: '本周精选' },
      admin: { position: 'sidebar', description: { en: 'Shown at the top of the list and on the home page.', zh: '显示在列表顶部和首页。' } },
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: { en: 'Basics', zh: '基本信息' },
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'category',
                  type: 'select',
                  required: true,
                  index: true,
                  label: { en: 'Category', zh: '分类' },
                  options: skillCategories.map((value) => ({ value, label: skillCategoryLabels[value] })),
                },
                {
                  name: 'tags',
                  type: 'relationship',
                  relationTo: 'skill-tags',
                  hasMany: true,
                  maxRows: 8,
                  label: { en: 'Tags', zh: '标签' },
                },
              ],
            },
            {
              name: 'author',
              type: 'group',
              label: { en: 'Author', zh: '作者' },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'name', type: 'text', required: true, label: { en: 'Name', zh: '名字' } },
                    { name: 'url', type: 'text', label: { en: 'Link', zh: '链接' }, validate: urlValidation(false) },
                  ],
                },
                {
                  name: 'official',
                  type: 'checkbox',
                  defaultValue: false,
                  label: { en: 'Written by IFAI', zh: 'IFAI 官方' },
                },
              ],
            },
            {
              name: 'repository',
              type: 'text',
              label: { en: 'Source repository', zh: '来源仓库' },
              validate: urlValidation(false),
              admin: {
                description: {
                  en: 'GitHub address, optionally with a sub-directory. Versions are imported from here.',
                  zh: 'GitHub 地址，可以带子目录。版本从这里导入。',
                },
              },
            },
            {
              type: 'row',
              fields: [
                {
                  name: 'license',
                  type: 'text',
                  label: { en: 'License', zh: '许可' },
                  admin: {
                    description: {
                      en: 'SPDX id, e.g. MIT, Apache-2.0. No license → only with the author’s written consent (rule 13).',
                      zh: 'SPDX 标识，例如 MIT、Apache-2.0。没有许可的要作者书面同意（规则 13）。',
                    },
                  },
                },
                {
                  name: 'needsApiKey',
                  type: 'checkbox',
                  defaultValue: false,
                  index: true,
                  label: { en: 'Needs an API key', zh: '需要 API Key' },
                },
              ],
            },
            {
              name: 'runtime',
              type: 'text',
              hasMany: true,
              label: { en: 'Runtime requirements', zh: '运行依赖' },
              admin: { description: { en: 'e.g. Python 3.10+, Node 22, ffmpeg.', zh: '例如 Python 3.10+、Node 22、ffmpeg。' } },
            },
          ],
        },
        {
          label: { en: 'Description', zh: '说明' },
          description: {
            en: 'Drafted per language from SKILL.md and the README, then reviewed by you. Only what the files actually say.',
            zh: '由 SKILL.md 和 README 按语言起草，你审核后发布。只写文件里确实有的内容。',
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
              name: 'capabilities',
              type: 'array',
              localized: true,
              maxRows: 8,
              label: { en: 'What it does', zh: '它能做什么' },
              labels: {
                singular: { en: 'Capability', zh: '能力' },
                plural: { en: 'Capabilities', zh: '能力' },
              },
              fields: [
                { name: 'title', type: 'text', required: true, label: { en: 'Title', zh: '标题' } },
                { name: 'detail', type: 'textarea', label: { en: 'Detail', zh: '说明' } },
              ],
            },
            {
              name: 'example',
              type: 'textarea',
              localized: true,
              label: { en: 'Example prompt', zh: '使用示例' },
              admin: { description: { en: 'What to say to the assistant once the Skill is installed.', zh: '装好以后对 AI 助手说的一句话。' } },
            },
            {
              name: 'workflow',
              type: 'array',
              localized: true,
              maxRows: 8,
              label: { en: 'How it works', zh: '工作流程' },
              labels: {
                singular: { en: 'Step', zh: '步骤' },
                plural: { en: 'Steps', zh: '步骤' },
              },
              fields: [
                { name: 'title', type: 'text', required: true, label: { en: 'Step', zh: '步骤' } },
                { name: 'detail', type: 'textarea', label: { en: 'Detail', zh: '说明' } },
              ],
            },
            {
              name: 'notes',
              type: 'textarea',
              localized: true,
              label: { en: 'Things to know', zh: '注意事项' },
              admin: { description: { en: 'Files it writes, commands it runs, what it asks before acting.', zh: '它会写哪些文件、跑哪些命令、动手前会不会先问。' } },
            },
            {
              name: 'ownerNotes',
              type: 'textarea',
              localized: true,
              label: { en: 'Owner’s field notes', zh: '试用笔记' },
              admin: { description: { en: 'Your own notes from trying it. Every certified Skill has them (rule 10).', zh: '你自己试用后写的。认证的 Skill 都要有（规则 10）。' } },
            },
          ],
        },
        {
          label: { en: 'Stats', zh: '统计' },
          fields: [
            {
              name: 'stats',
              type: 'group',
              label: { en: 'Install statistics', zh: '安装统计' },
              admin: { description: { en: 'Rolled up hourly from skill_events. Not edited by hand.', zh: '每小时从 skill_events 汇总，不用手改。' } },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'installs', type: 'number', defaultValue: 0, label: { en: 'Installs', zh: '安装数' }, admin: { readOnly: true } },
                    { name: 'installs7d', type: 'number', defaultValue: 0, label: { en: 'Installs, last 7 days', zh: '近 7 天安装数' }, admin: { readOnly: true } },
                    { name: 'saves', type: 'number', defaultValue: 0, label: { en: 'Saves', zh: '收藏数' }, admin: { readOnly: true } },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}
