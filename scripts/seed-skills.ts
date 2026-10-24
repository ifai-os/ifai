/**
 * Sample Skills for local development and the CI smoke tests (tests/e2e/resources.spec.ts).
 * The Skills are fictional and harmless (Markdown only, no scripts). Runs only against a
 * database on this machine, or main's preview when asked (./seed-target.ts), so it can never put
 * sample Skills on a real site. Safe to run again: sample Skills are matched by slug and rebuilt
 * with their versions.
 *
 *   pnpm payload run scripts/seed-skills.ts
 */
import config from '@payload-config'
import { getPayload, type Payload } from 'payload'

import type { Skill } from '../src/payload-types'
import { buildZip } from '../src/modules/resources/package/zip'
import { assertSeedTarget } from './seed-target'

type Texts = Partial<Pick<Skill, 'name' | 'tagline' | 'example' | 'notes' | 'ownerNotes'>> & {
  capabilities?: { title: string; detail?: string }[]
  workflow?: { title: string; detail?: string }[]
}

type SampleVersion = {
  version: string
  /** What happens after it is published. */
  then?: { status: 'deprecated' } | { status: 'withdrawn'; withdrawReason: string }
  changelog?: string
  /** Extra files beside SKILL.md. */
  files?: Record<string, string>
}

type SampleSkill = Pick<Skill, 'slug' | 'category'> &
  Partial<Pick<Skill, 'certified' | 'featured' | 'needsApiKey' | 'runtime'>> & {
    status?: 'published' | 'draft'
    /** Taken down after publishing, for this reason. */
    delist?: string
    author: string
    tags: string[]
    installs: number
    installs7d: number
    installsPrev7d: number
    texts: { en: Texts & { name: string } } & Partial<Record<'zh-Hans' | 'ja' | 'ko', Texts>>
    versions: SampleVersion[]
  }

const tags: Record<string, Record<'en' | 'zh-Hans' | 'ja' | 'ko', string>> = {
  'release-notes': { en: 'Release notes', 'zh-Hans': '发布说明', ja: 'リリースノート', ko: '릴리스 노트' },
  git: { en: 'Git', 'zh-Hans': 'Git', ja: 'Git', ko: 'Git' },
  sql: { en: 'SQL', 'zh-Hans': 'SQL', ja: 'SQL', ko: 'SQL' },
}

const samples: SampleSkill[] = [
  {
    slug: 'sample-release-notes',
    category: 'writing',
    certified: true,
    featured: true,
    author: 'IFAI Samples',
    tags: ['release-notes', 'git'],
    installs: 1280,
    installs7d: 96,
    installsPrev7d: 120,
    texts: {
      en: {
        name: 'Release Notes Writer',
        tagline: 'Sample Skill: turns merged changes into release notes',
        capabilities: [
          { title: 'Reads the changes', detail: 'Collects the merged pull requests since the last tag.' },
          { title: 'Groups them', detail: 'Features, fixes and breaking changes, each in plain words.' },
        ],
        example: 'Write the release notes for everything merged since v2.3.0.',
        workflow: [
          { title: 'Find the range', detail: 'Asks which tag to start from.' },
          { title: 'Draft', detail: 'Writes the notes and shows them before saving.' },
        ],
        notes: 'Only writes CHANGELOG.md, after you agree.',
        ownerNotes: 'Tried in Claude Code on this repository; the draft needed one small edit.',
      },
      'zh-Hans': {
        name: '发布说明助手',
        tagline: '示例 Skill：把合并的改动整理成发布说明',
        capabilities: [
          { title: '读取改动', detail: '收集上一个 tag 之后合并的 PR。' },
          { title: '分组整理', detail: '新功能、修复和不兼容改动，各用白话写清楚。' },
        ],
        example: '把 v2.3.0 之后合并的改动写成发布说明。',
        workflow: [
          { title: '确定范围', detail: '先问从哪个 tag 开始。' },
          { title: '起草', detail: '写好后先给你看，再保存。' },
        ],
        notes: '只会在你同意后写入 CHANGELOG.md。',
        ownerNotes: '在 Claude Code 里对本仓库试过，草稿只改了一处。',
      },
    },
    versions: [
      { version: '0.9.0', then: { status: 'withdrawn', withdrawReason: 'Wrote to the wrong file.' }, changelog: 'First try.' },
      { version: '1.0.0', then: { status: 'deprecated' }, changelog: 'First release.' },
      {
        version: '1.1.0',
        changelog: 'Groups breaking changes first.',
        files: { 'references/style.md': '# Style\n\nShort sentences. One change per line.\n' },
      },
    ],
  },
  {
    slug: 'sample-sql-helper',
    category: 'data',
    needsApiKey: true,
    runtime: ['Python 3.10+'],
    author: 'Sample Data Team',
    tags: ['sql'],
    installs: 300,
    installs7d: 140,
    installsPrev7d: 40,
    texts: {
      en: { name: 'SQL Helper', tagline: 'Sample Skill: explains slow queries and suggests indexes' },
      'zh-Hans': { name: 'SQL 助手', tagline: '示例 Skill：解释慢查询并给出索引建议' },
    },
    versions: [{ version: '2.0.0', changelog: 'Reads EXPLAIN output.' }],
  },
  {
    slug: 'sample-delisted-skill',
    category: 'productivity',
    delist: 'Taken down at the author’s request.',
    author: 'IFAI Samples',
    tags: [],
    installs: 12,
    installs7d: 0,
    installsPrev7d: 0,
    texts: { en: { name: 'Delisted Sample Skill', tagline: 'Published, then taken down; its page says why' } },
    versions: [{ version: '1.0.0', changelog: 'First release.' }],
  },
  {
    slug: 'sample-draft-skill',
    category: 'coding',
    status: 'draft',
    author: 'IFAI Samples',
    tags: [],
    installs: 0,
    installs7d: 0,
    installsPrev7d: 0,
    texts: { en: { name: 'Draft Sample Skill', tagline: 'Not published; never listed' } },
    versions: [],
  },
]

function skillMd(sample: SampleSkill, version: string): string {
  return [
    '---',
    `name: ${sample.slug}`,
    `description: ${JSON.stringify(sample.texts.en.tagline ?? sample.texts.en.name)}`,
    `version: ${version}`,
    'license: MIT',
    '---',
    '',
    `# ${sample.texts.en.name}`,
    '',
    'A sample Skill for trying the IFAI Skills pages. It only contains Markdown.',
    '',
    '## Steps',
    '',
    '1. Ask the user what to work on.',
    '2. Show the result before writing any file.',
    '',
  ].join('\n')
}

async function upsertTags(payload: Payload): Promise<Map<string, number>> {
  const ids = new Map<string, number>()
  for (const [slug, names] of Object.entries(tags)) {
    const found = await payload.find({ collection: 'skill-tags', where: { slug: { equals: slug } }, limit: 1, depth: 0 })
    const doc = found.docs[0] ?? (await payload.create({ collection: 'skill-tags', locale: 'en', data: { slug, name: names.en }, depth: 0 }))
    for (const locale of ['en', 'zh-Hans', 'ja', 'ko'] as const) {
      await payload.update({ collection: 'skill-tags', id: doc.id, locale, data: { name: names[locale] }, depth: 0 })
    }
    ids.set(slug, doc.id)
  }
  return ids
}

async function seedSkill(payload: Payload, sample: SampleSkill, tagIds: Map<string, number>) {
  const existing = await payload.find({ collection: 'skills', where: { slug: { equals: sample.slug } }, limit: 1, depth: 0 })
  if (existing.docs[0]) {
    const id = existing.docs[0].id
    await payload.update({ collection: 'skills', id, data: { currentVersion: null, status: 'draft' }, depth: 0, context: { system: true } })
    await payload.delete({ collection: 'skill-versions', where: { skill: { equals: id } } })
    await payload.delete({ collection: 'skills', id })
  }

  const { en, ...others } = sample.texts
  const skill = await payload.create({
    collection: 'skills',
    locale: 'en',
    depth: 0,
    data: {
      slug: sample.slug,
      category: sample.category,
      status: 'draft',
      certified: sample.certified ?? false,
      featured: sample.featured ?? false,
      needsApiKey: sample.needsApiKey ?? false,
      runtime: sample.runtime ?? [],
      license: 'MIT',
      author: { name: sample.author, official: sample.author.startsWith('IFAI') },
      repository: `https://github.com/ifai-samples/${sample.slug}`,
      tags: sample.tags.map((slug) => tagIds.get(slug)).filter((id) => id !== undefined),
      ...en,
    },
  })
  for (const [locale, texts] of Object.entries(others)) {
    await payload.update({ collection: 'skills', id: skill.id, locale: locale as 'zh-Hans' | 'ja' | 'ko', data: texts, depth: 0 })
  }

  for (const version of sample.versions) {
    const files = [
      { path: 'SKILL.md', data: new TextEncoder().encode(skillMd(sample, version.version)) },
      ...Object.entries(version.files ?? {}).map(([path, text]) => ({ path, data: new TextEncoder().encode(text) })),
    ]
    const zip = buildZip(files)
    const created = await payload.create({
      collection: 'skill-versions',
      locale: 'en',
      depth: 0,
      // scanStatus is replaced by the upload hook, which inspects the Zip.
      data: { skill: skill.id, version: version.version, status: 'in_review', scanStatus: 'pending', changelog: version.changelog },
      file: { data: zip, name: `${sample.slug}-${version.version}.zip`, mimetype: 'application/zip', size: zip.length },
    })
    if (sample.status === 'draft') continue
    await payload.update({ collection: 'skill-versions', id: created.id, data: { status: 'published' }, depth: 0 })
  }
  for (const version of sample.versions) {
    if (!version.then) continue
    const found = await payload.find({
      collection: 'skill-versions',
      where: { and: [{ skill: { equals: skill.id } }, { version: { equals: version.version } }] },
      limit: 1,
      depth: 0,
    })
    await payload.update({ collection: 'skill-versions', id: found.docs[0].id, data: version.then, depth: 0 })
  }
  await payload.update({
    collection: 'skills',
    id: skill.id,
    data: { stats: { installs: sample.installs, installs7d: sample.installs7d, installsPrev7d: sample.installsPrev7d, saves: 0 } },
    depth: 0,
  })
  if (sample.delist) {
    await payload.update({ collection: 'skills', id: skill.id, data: { status: 'delisted', delistReason: sample.delist }, depth: 0 })
  }
  console.log(`${sample.slug}: ${sample.versions.length} version(s)`)
}

assertSeedTarget('sample Skills')
const payload = await getPayload({ config })

// The two hosts verified first get sample directories when the owner has not filled them in yet.
const sampleDirs: Record<string, { globalDir: string; projectDir: string }> = {
  'claude-code': { globalDir: '~/.claude/skills/', projectDir: '.claude/skills/' },
  codex: { globalDir: '~/.codex/skills/', projectDir: '.codex/skills/' },
}
for (const [slug, dirs] of Object.entries(sampleDirs)) {
  const host = (await payload.find({ collection: 'agent-hosts', where: { slug: { equals: slug } }, limit: 1, depth: 0 })).docs[0]
  if (host && !host.globalDir && !host.projectDir) await payload.update({ collection: 'agent-hosts', id: host.id, data: dirs, depth: 0 })
}

// A sample install note in English and Simplified Chinese (Traditional follows), for the install guide.
const sampleNotes = { en: 'Sample note: start a new session after adding the folder.', 'zh-Hans': '示例说明：放好文件夹后，新开一个会话。' } as const
const claudeCode = (await payload.find({ collection: 'agent-hosts', where: { slug: { equals: 'claude-code' } }, limit: 1, depth: 0, locale: 'en' })).docs[0]
if (claudeCode && !claudeCode.instructions) {
  for (const [locale, instructions] of Object.entries(sampleNotes)) {
    await payload.update({ collection: 'agent-hosts', id: claudeCode.id, data: { instructions }, locale: locale as keyof typeof sampleNotes, depth: 0 })
  }
}

const tagIds = await upsertTags(payload)
for (const sample of samples) await seedSkill(payload, sample, tagIds)
process.exit(0)
