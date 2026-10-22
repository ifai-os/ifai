import { createHash } from 'node:crypto'

import type {
  CollectionBeforeValidateHook,
  CollectionConfig,
  SelectFieldSingleValidation,
  TextFieldSingleValidation,
} from 'payload'
import { text } from 'payload/shared'

import { syncHantFromHans } from '@/lib/i18n/hant-sync'

import { isSha256, isValidVersion, normalizeSha256, normalizeVersion } from '../normalize'
import { adminMessage, isAdmin, resourcesAdminGroup } from './shared'

/** The package fingerprint comes from the uploaded Zip itself, never from what was typed. */
const fingerprintUpload: CollectionBeforeValidateHook = ({ data, req }) => {
  const file = req.file
  return file?.data ? { ...data, sha256: createHash('sha256').update(file.data).digest('hex') } : data
}

function relationId(value: unknown): number | string | undefined {
  if (typeof value === 'number' || typeof value === 'string') return value
  if (value && typeof value === 'object' && 'id' in value) return (value as { id: number | string }).id
  return undefined
}

/** 2.4.0 style, and unique within the Skill. */
const validateVersion: TextFieldSingleValidation = async (value, args) => {
  const required = text(value, args)
  if (required !== true) return required
  if (typeof value !== 'string' || !isValidVersion(value)) {
    return adminMessage(args.req, {
      en: 'Digits separated by dots, e.g. 2.4.0 (the leading v is optional).',
      zh: '数字加点，例如 2.4.0（开头的 v 可以不写）。',
    })
  }
  const skill = relationId((args.siblingData as Record<string, unknown> | undefined)?.skill)
  if (skill === undefined) return true
  const { totalDocs } = await args.req.payload.count({
    collection: 'skill-versions',
    where: {
      and: [
        { skill: { equals: skill } },
        { version: { equals: value } },
        ...(args.id ? [{ id: { not_equals: args.id } }] : []),
      ],
    },
    req: args.req,
  })
  return totalDocs === 0
    ? true
    : adminMessage(args.req, { en: 'This Skill already has that version.', zh: '这个 Skill 已经有这个版本号了。' })
}

const validateSha256: TextFieldSingleValidation = (value, { req }) =>
  !value || (typeof value === 'string' && isSha256(value))
    ? true
    : adminMessage(req, { en: '64 hex characters.', zh: '64 位十六进制。' })

/** Nothing installs without a file and its fingerprint. */
const validateStatus: SelectFieldSingleValidation = (value, { req, siblingData }) => {
  const { filename, sha256 } = (siblingData ?? {}) as Record<string, unknown>
  return value === 'published' && !(filename && sha256)
    ? adminMessage(req, {
        en: 'Upload the Zip before publishing; the fingerprint is computed from it.',
        zh: '发布前先上传 Zip，指纹由它算出。',
      })
    : true
}

/**
 * One immutable release of a Skill (docs/specs/resources.md, rules 2 and 3): the Zip (stored in R2
 * under skills/), its sha256 and file list, the SKILL.md text, what it declares to need, the
 * static scan result and the per-host compatibility record. Published content never changes;
 * a change is a new version (enforced in step 2 of the implementation order).
 */
export const SkillVersions: CollectionConfig = {
  slug: 'skill-versions',
  labels: {
    singular: { en: 'Skill version', zh: 'Skill 版本' },
    plural: { en: 'Skill versions', zh: 'Skill 版本' },
  },
  admin: {
    useAsTitle: 'version',
    group: resourcesAdminGroup,
    defaultColumns: ['skill', 'version', 'status', 'scanStatus', 'updatedAt'],
    description: {
      en: 'Upload the Zip of the Skill directory (SKILL.md at the top). The sha256 is computed from it. Release notes: Traditional Chinese is converted from Simplified automatically.',
      zh: '上传 Skill 目录的 Zip（SKILL.md 在最外层），sha256 自动算出。更新说明的繁体由简体自动转换。',
    },
  },
  upload: {
    mimeTypes: ['application/zip', 'application/x-zip-compressed'],
    filesRequiredOnCreate: false,
  },
  access: {
    read: ({ req: { user } }) => (user ? true : { status: { in: ['published', 'deprecated', 'withdrawn'] } }),
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeValidate: [fingerprintUpload],
    afterChange: [syncHantFromHans(['changelog'])],
  },
  fields: [
    {
      name: 'skill',
      type: 'relationship',
      relationTo: 'skills',
      required: true,
      index: true,
      label: { en: 'Skill', zh: 'Skill' },
    },
    {
      name: 'version',
      type: 'text',
      required: true,
      index: true,
      label: { en: 'Version', zh: '版本号' },
      hooks: {
        beforeValidate: [({ value }) => (typeof value === 'string' ? normalizeVersion(value) : value)],
      },
      validate: validateVersion,
    },
    {
      name: 'status',
      type: 'select',
      required: true,
      defaultValue: 'in_review',
      index: true,
      label: { en: 'Status', zh: '状态' },
      options: [
        { value: 'scanning', label: { en: 'Scanning', zh: '检测中' } },
        { value: 'in_review', label: { en: 'In review', zh: '待审' } },
        { value: 'published', label: { en: 'Published', zh: '已发布' } },
        { value: 'deprecated', label: { en: 'Deprecated', zh: '已弃用' } },
        { value: 'withdrawn', label: { en: 'Withdrawn', zh: '已撤回' } },
      ],
      validate: validateStatus,
      admin: { position: 'sidebar' },
    },
    {
      name: 'publishedAt',
      type: 'date',
      label: { en: 'Published on', zh: '发布时间' },
      admin: { position: 'sidebar', date: { pickerAppearance: 'dayAndTime' } },
    },
    {
      name: 'withdrawReason',
      type: 'textarea',
      label: { en: 'Withdraw reason', zh: '撤回原因' },
      admin: {
        position: 'sidebar',
        condition: (data) => data?.status === 'withdrawn',
        description: { en: 'Shown on the fixed-version page. No risk details.', zh: '显示在固定版本页上，不写风险细节。' },
      },
    },
    {
      type: 'tabs',
      tabs: [
        {
          label: { en: 'Source & fingerprint', zh: '来源与指纹' },
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'sourceCommit',
                  type: 'text',
                  label: { en: 'Source commit', zh: '来源 commit' },
                  admin: { description: { en: 'The repository commit this version was built from.', zh: '这个版本取自仓库的哪个 commit。' } },
                },
                {
                  name: 'sha256',
                  type: 'text',
                  index: true,
                  label: { en: 'Zip sha256', zh: 'Zip sha256' },
                  hooks: {
                    beforeValidate: [({ value }) => (typeof value === 'string' ? normalizeSha256(value) : value)],
                  },
                  validate: validateSha256,
                  admin: { description: { en: 'Computed from the uploaded Zip.', zh: '由上传的 Zip 自动算出。' } },
                },
              ],
            },
            {
              name: 'files',
              type: 'array',
              label: { en: 'File list', zh: '文件清单' },
              labels: {
                singular: { en: 'File', zh: '文件' },
                plural: { en: 'Files', zh: '文件' },
              },
              admin: { description: { en: 'Written by the import job (step 2).', zh: '由导入任务生成（第 2 步）。' } },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'path', type: 'text', required: true, label: { en: 'Path', zh: '路径' } },
                    { name: 'size', type: 'number', min: 0, label: { en: 'Bytes', zh: '字节' } },
                    { name: 'sha256', type: 'text', label: { en: 'sha256', zh: 'sha256' }, validate: validateSha256 },
                  ],
                },
              ],
            },
          ],
        },
        {
          label: { en: 'SKILL.md', zh: 'SKILL.md' },
          fields: [
            {
              name: 'skillMd',
              type: 'textarea',
              label: { en: 'SKILL.md', zh: 'SKILL.md 原文' },
              admin: {
                rows: 24,
                description: {
                  en: 'Shown as text in the author’s language. Treated as data, never as instructions (rule 4).',
                  zh: '按作者语言原文显示。只当数据，不当指令（规则 4）。',
                },
              },
            },
            {
              name: 'frontmatter',
              type: 'json',
              label: { en: 'Frontmatter', zh: 'frontmatter' },
              admin: { description: { en: 'name, description and the rest of the SKILL.md header.', zh: 'SKILL.md 头部的 name、description 等。' } },
            },
          ],
        },
        {
          label: { en: 'Declarations', zh: '声明' },
          description: {
            en: 'What this version needs, taken from SKILL.md and the files. The scan compares the files against it.',
            zh: '这个版本需要什么，取自 SKILL.md 和文件。检测会拿文件和它对比。',
          },
          fields: [
            {
              name: 'declarations',
              type: 'group',
              label: { en: 'Declarations', zh: '声明' },
              fields: [
                {
                  name: 'domains',
                  type: 'text',
                  hasMany: true,
                  label: { en: 'Network domains', zh: '外联域名' },
                },
                {
                  name: 'fileScope',
                  type: 'text',
                  label: { en: 'Files it reads and writes', zh: '读写范围' },
                  admin: { description: { en: 'e.g. the project directory only.', zh: '例如：只在项目目录内。' } },
                },
                {
                  name: 'tools',
                  type: 'text',
                  hasMany: true,
                  label: { en: 'Command-line tools', zh: '需要的命令行工具' },
                },
                {
                  name: 'apiKeys',
                  type: 'text',
                  hasMany: true,
                  label: { en: 'API keys', zh: 'API Key' },
                  admin: { description: { en: 'Names of the keys the user must provide, never values.', zh: '用户要自己提供的 key 的名字，不是值。' } },
                },
              ],
            },
          ],
        },
        {
          label: { en: 'Scan', zh: '安全检测' },
          fields: [
            {
              type: 'row',
              fields: [
                {
                  name: 'scanStatus',
                  type: 'select',
                  required: true,
                  defaultValue: 'pending',
                  index: true,
                  label: { en: 'Result', zh: '结果' },
                  options: [
                    { value: 'pending', label: { en: 'Not scanned', zh: '未检测' } },
                    { value: 'passed', label: { en: 'Passed', zh: '通过' } },
                    { value: 'warnings', label: { en: 'Needs a look', zh: '有提示' } },
                    { value: 'blocked', label: { en: 'Blocked', zh: '拦截' } },
                  ],
                },
                {
                  name: 'scannedAt',
                  type: 'date',
                  label: { en: 'Scanned on', zh: '检测时间' },
                  admin: { date: { pickerAppearance: 'dayAndTime' } },
                },
              ],
            },
            {
              name: 'checks',
              type: 'array',
              label: { en: 'Checks', zh: '检查项' },
              labels: {
                singular: { en: 'Check', zh: '检查项' },
                plural: { en: 'Checks', zh: '检查项' },
              },
              admin: { description: { en: 'Shown on the Skill page: only the names and results.', zh: '显示在 Skill 页上：只有名称和结论。' } },
              fields: [
                {
                  type: 'row',
                  fields: [
                    { name: 'key', type: 'text', required: true, label: { en: 'Check', zh: '检查' } },
                    {
                      name: 'result',
                      type: 'select',
                      required: true,
                      label: { en: 'Result', zh: '结论' },
                      options: [
                        { value: 'pass', label: { en: 'Pass', zh: '通过' } },
                        { value: 'warn', label: { en: 'Needs a look', zh: '有提示' } },
                        { value: 'block', label: { en: 'Blocked', zh: '拦截' } },
                      ],
                    },
                    { name: 'note', type: 'text', label: { en: 'Note', zh: '说明' } },
                  ],
                },
              ],
            },
            {
              name: 'findings',
              type: 'array',
              label: { en: 'Findings', zh: '发现' },
              labels: {
                singular: { en: 'Finding', zh: '发现' },
                plural: { en: 'Findings', zh: '发现' },
              },
              // Files and line numbers stay in the back office and the email to the submitter.
              access: { read: ({ req: { user } }) => Boolean(user) },
              admin: { description: { en: 'Back office only; the public sees "not installable" at most.', zh: '只在后台看；前台最多显示「暂不可安装」。' } },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'severity',
                      type: 'select',
                      required: true,
                      label: { en: 'Severity', zh: '级别' },
                      options: [
                        { value: 'high', label: { en: 'High', zh: '高' } },
                        { value: 'medium', label: { en: 'Medium', zh: '中' } },
                      ],
                    },
                    { name: 'file', type: 'text', label: { en: 'File', zh: '文件' } },
                    { name: 'line', type: 'number', min: 1, label: { en: 'Line', zh: '行' } },
                  ],
                },
                { name: 'message', type: 'text', required: true, label: { en: 'What was found', zh: '发现了什么' } },
              ],
            },
          ],
        },
        {
          label: { en: 'Compatibility', zh: '兼容' },
          fields: [
            {
              name: 'compatibility',
              type: 'array',
              label: { en: 'Hosts', zh: '宿主' },
              labels: {
                singular: { en: 'Host record', zh: '宿主记录' },
                plural: { en: 'Host records', zh: '宿主记录' },
              },
              admin: {
                description: {
                  en: '"Verified" only when you installed and ran it there yourself; otherwise the author’s claim or untested (rule 11).',
                  zh: '「已验证」只在你亲自装过、跑过时填；否则是作者声明或未测试（规则 11）。',
                },
              },
              fields: [
                {
                  type: 'row',
                  fields: [
                    {
                      name: 'host',
                      type: 'relationship',
                      relationTo: 'agent-hosts',
                      required: true,
                      label: { en: 'Host', zh: '宿主' },
                    },
                    {
                      name: 'status',
                      type: 'select',
                      required: true,
                      defaultValue: 'untested',
                      label: { en: 'Status', zh: '状态' },
                      options: [
                        { value: 'verified', label: { en: 'Verified', zh: '已验证' } },
                        { value: 'claimed', label: { en: 'Author’s claim', zh: '作者声明' } },
                        { value: 'untested', label: { en: 'Untested', zh: '未测试' } },
                        { value: 'failed', label: { en: 'Does not work', zh: '不适用' } },
                        { value: 'needs_recheck', label: { en: 'Needs re-check', zh: '待复核' } },
                      ],
                    },
                    { name: 'checkedAt', type: 'date', label: { en: 'Checked on', zh: '日期' } },
                  ],
                },
                { name: 'note', type: 'text', label: { en: 'Note', zh: '备注' } },
              ],
            },
          ],
        },
        {
          label: { en: 'Release notes', zh: '更新说明' },
          fields: [
            {
              name: 'changelog',
              type: 'textarea',
              localized: true,
              label: { en: 'What changed', zh: '更新说明' },
            },
          ],
        },
      ],
    },
  ],
}
