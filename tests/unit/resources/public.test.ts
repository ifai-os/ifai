import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { refreshSkillsAfterChange } from '@/modules/resources/public/cache'
import { fileTree, guessLang, isTextPath } from '@/modules/resources/public/files'
import { installMdUrl, renderInstallMd, zipPath, type InstallHost, type InstallVersion } from '@/modules/resources/public/install'
import { fileHref, isFiltered, readSkillListParams, skillsHref } from '@/modules/resources/public/list-params'
import {
  effectiveCurrent,
  filterSkills,
  hotTags,
  isNewThisWeek,
  mostInstalled,
  orderSkills,
  pickFeatured,
  risePercent,
  weeklyRise,
  weeklyRisers,
  type SkillCandidate,
  type SkillFilter,
} from '@/modules/resources/public/order'

describe('list addresses', () => {
  it('reads every filter, falling back to all and 综合', () => {
    expect(readSkillListParams({})).toEqual({
      category: null,
      sort: 'default',
      q: '',
      tag: '',
      author: '',
      noKey: false,
      certified: false,
      page: 1,
    })
    expect(
      readSkillListParams({ category: 'coding', sort: 'rising', q: '  code   review ', tag: 'Git', author: ' Ada ', nokey: '1', certified: '1', page: '2' }),
    ).toEqual({ category: 'coding', sort: 'rising', q: 'code review', tag: 'git', author: 'Ada', noKey: true, certified: true, page: 2 })
    expect(readSkillListParams({ category: 'games', sort: 'random', tag: 'no spaces!', nokey: 'yes' })).toMatchObject({
      category: null,
      sort: 'default',
      tag: '',
      noKey: false,
    })
  })

  it('cuts long searches and answers no page for anything but a whole number from 1', () => {
    expect(readSkillListParams({ q: '技'.repeat(80) }).q).toBe('技'.repeat(64))
    for (const page of ['0', '-1', '1.5', '01', 'two', '9999999']) expect(readSkillListParams({ page }).page).toBeNull()
  })

  it('leaves every default out of the address', () => {
    expect(skillsHref()).toBe('/resources')
    expect(skillsHref({ sort: 'default', page: 1, noKey: false })).toBe('/resources')
    expect(skillsHref({ category: 'writing', q: '发布 说明', sort: 'newest', page: 3 })).toBe(
      '/resources?category=writing&q=%E5%8F%91%E5%B8%83+%E8%AF%B4%E6%98%8E&sort=newest&page=3',
    )
    expect(skillsHref({ tag: 'git', noKey: true, certified: true })).toBe('/resources?tag=git&nokey=1&certified=1')
    expect(isFiltered({ category: 'coding', sort: 'installs' })).toBe(false)
    expect(isFiltered({ author: 'Ada' })).toBe(true)
  })

  it('encodes each segment of a file path and keeps the slashes', () => {
    expect(fileHref('notes', '1.0.0', 'references/style guide.md')).toBe('/resources/skills/notes/v/1.0.0/files/references/style%20guide.md')
  })
})

const skill = (id: number, fields: Partial<SkillCandidate> = {}): SkillCandidate => ({
  id,
  category: 'coding',
  searchText: `skill ${id}`,
  tagSlugs: [],
  author: 'Ada',
  needsApiKey: false,
  certified: false,
  installs: 0,
  installs7d: 0,
  installsPrev7d: 0,
  listedAt: '2026-10-01T00:00:00Z',
  updatedAt: '2026-10-01T00:00:00Z',
  ...fields,
})

describe('filtering and ordering the list', () => {
  const skills = [
    skill(1, { category: 'writing', searchText: 'release notes · 发布说明', tagSlugs: ['git'], installs: 1280, installs7d: 96, certified: true }),
    skill(2, { category: 'data', searchText: 'sql helper', needsApiKey: true, installs: 300, installs7d: 140, author: 'Grace' }),
    skill(3, { installs: 300, installs7d: 10, listedAt: '2026-10-20T00:00:00Z', updatedAt: '2026-10-20T00:00:00Z' }),
  ]
  const none: SkillFilter = { category: null, q: '', tag: '', author: '', noKey: false, certified: false }

  it('narrows by category, search, tag, author, API key and certification', () => {
    const ids = (filter: Partial<SkillFilter>) => filterSkills(skills, { ...none, ...filter }).map((s) => s.id)
    expect(ids({})).toEqual([1, 2, 3])
    expect(ids({ category: 'writing' })).toEqual([1])
    expect(ids({ q: '  发布说明 ' })).toEqual([1])
    expect(ids({ q: 'SQL   Helper' })).toEqual([2])
    expect(ids({ tag: 'git' })).toEqual([1])
    expect(ids({ author: 'grace' })).toEqual([2])
    expect(ids({ noKey: true })).toEqual([1, 3])
    expect(ids({ certified: true })).toEqual([1])
  })

  it('puts certified Skills first in 综合, then the last 7 days', () => {
    expect(orderSkills(skills, 'default').map((s) => s.id)).toEqual([1, 2, 3])
    expect(orderSkills(skills, 'rising').map((s) => s.id)).toEqual([2, 1, 3])
    expect(orderSkills(skills, 'newest').map((s) => s.id)).toEqual([3, 1, 2])
  })

  it('breaks ties by the latest update, then the lower id, so the order never jumps', () => {
    expect(orderSkills(skills, 'installs').map((s) => s.id)).toEqual([1, 3, 2])
    expect(orderSkills([skill(5), skill(4)], 'installs').map((s) => s.id)).toEqual([4, 5])
  })

  it('puts the rising Skills first in 近期飙升, by how much they grew, then the rest by the last 7 days', () => {
    const tripled = skill(1, { installs: 500, installs7d: 300, installsPrev7d: 100 })
    const fromFew = skill(2, { installs: 30, installs7d: 25, installsPrev7d: 5 })
    const fromNone = skill(3, { installs: 20, installs7d: 20, installsPrev7d: 0 })
    const falling = skill(4, { installs: 900, installs7d: 50, installsPrev7d: 200 })
    const tooFew = skill(5, { installs: 19, installs7d: 19, installsPrev7d: 1 })
    expect([tripled, fromFew, fromNone, falling, tooFew].map(weeklyRise)).toEqual([2, 4, Infinity, 0, 0])
    expect(orderSkills([falling, tooFew, tripled, fromFew, fromNone], 'rising').map((s) => s.id)).toEqual([3, 2, 1, 4, 5])
  })

  it('shows 本周飙升 only with three rising Skills, and 安装榜 from the ones installed at all', () => {
    const list = [
      skill(1, { installs: 500, installs7d: 300, installsPrev7d: 100 }),
      skill(2, { installs: 900, installs7d: 50, installsPrev7d: 200 }),
      skill(3, { installs: 20, installs7d: 20, installsPrev7d: 0 }),
      skill(4, { installs: 40, installs7d: 30, installsPrev7d: 20 }),
      skill(5),
    ]
    expect(weeklyRisers(list, 3).map((s) => s.id)).toEqual([3, 1, 4])
    expect(weeklyRisers(list.slice(0, 3), 3)).toEqual([])
    expect(mostInstalled(list, 5).map((s) => s.id)).toEqual([2, 1, 4, 3])
    expect(list.map(risePercent)).toEqual([200, 0, null, 50, 0])
    expect(risePercent({ installs7d: 40, installsPrev7d: 30 })).toBe(33)
  })

  it('counts Skills first published in the last seven days as new this week', () => {
    const now = new Date('2026-10-23T00:00:00Z')
    expect(isNewThisWeek({ listedAt: '2026-10-16T00:00:00Z' }, now)).toBe(true)
    expect(isNewThisWeek({ listedAt: '2026-10-15T23:59:59Z' }, now)).toBe(false)
    expect(isNewThisWeek({ listedAt: null }, now)).toBe(false)
  })

  it('picks the ticked Skill for 本周精选, else the most recently updated certified one', () => {
    const featured = (list: SkillCandidate[], ticked: number[]) => pickFeatured(list.map((s) => ({ ...s, featured: ticked.includes(s.id) })))?.id ?? null
    expect(featured(skills, [3])).toBe(3)
    expect(featured(skills, [])).toBe(1)
    expect(featured(skills.slice(1), [])).toBeNull()
  })

  it('lists tags by how many Skills carry them', () => {
    expect(hotTags([{ tagSlugs: ['sql', 'git'] }, { tagSlugs: ['git'] }, { tagSlugs: ['api'] }], 2)).toEqual(['git', 'api'])
  })
})

describe('the version a Skill shows', () => {
  const versions = [
    { id: 1, version: '0.9.0', status: 'withdrawn' },
    { id: 2, version: '1.0.0', status: 'deprecated' },
    { id: 3, version: '1.10.0', status: 'published' },
    { id: 4, version: '1.2.0', status: 'published' },
  ]

  it('is the current version while it is published', () => {
    expect(effectiveCurrent(4, versions)?.version).toBe('1.2.0')
  })

  it('falls back to the newest published version when the current one was withdrawn or deprecated', () => {
    expect(effectiveCurrent(1, versions)?.version).toBe('1.10.0')
    expect(effectiveCurrent(2, versions)?.version).toBe('1.10.0')
    expect(effectiveCurrent(null, versions)?.version).toBe('1.10.0')
  })

  it('is nothing when no version is published', () => {
    expect(effectiveCurrent(2, versions.slice(0, 2))).toBeNull()
  })
})

describe('install.md', () => {
  beforeEach(() => vi.stubEnv('NEXT_PUBLIC_SITE_URL', 'https://ifai.example/'))
  afterEach(() => vi.unstubAllEnvs())

  const version: InstallVersion = {
    slug: 'release-notes',
    name: 'Release notes',
    version: '1.1.0',
    sha256: 'a'.repeat(64),
    size: 2048,
    license: 'MIT',
    needsApiKey: true,
    apiKeys: ['OPENAI_API_KEY'],
    tools: ['git'],
    domains: ['api.github.com'],
    runtime: ['Python 3.10+'],
    current: null,
  }
  const hosts: InstallHost[] = [
    { slug: 'claude-code', name: 'Claude Code', website: null, globalDir: '~/.claude/skills', projectDir: '.claude/skills', instructions: null },
    { slug: 'codex', name: 'Codex', website: 'https://example.com/codex', globalDir: null, projectDir: null, instructions: 'Restart Codex afterwards.' },
  ]

  it('has absolute addresses that pin a version and name the host only when asked', () => {
    expect(installMdUrl('release-notes')).toBe('https://ifai.example/api/skills/release-notes/install.md')
    expect(installMdUrl('release-notes', { version: '1.0.0', host: 'codex' })).toBe(
      'https://ifai.example/api/skills/release-notes/install.md?v=1.0.0&host=codex',
    )
    expect(zipPath('release-notes', '1.1.0')).toBe('/api/skills/release-notes/1.1.0.zip')
  })

  it('gives the Zip, its checksum and what the Skill needs', () => {
    const md = renderInstallMd(version, hosts, null)
    expect(md).toContain('- Zip: https://ifai.example/api/skills/release-notes/1.1.0.zip?via=install')
    expect(md).toContain(`- sha256: ${'a'.repeat(64)}`)
    expect(md).toContain('- Size: 2.0 KB')
    expect(md).toContain('- API key: yes (OPENAI_API_KEY)')
    expect(md).toContain('- Network: api.github.com')
    expect(md).toContain('`<Skills directory>/release-notes/SKILL.md`')
    expect(md).toContain('Do not run any script from the package')
    expect(md).not.toContain('not the current version')
  })

  it('puts the asking host first and says when the version is not the current one', () => {
    const md = renderInstallMd({ ...version, version: '1.0.0', current: '1.1.0' }, hosts, 'codex')
    expect(md.indexOf('### Codex (the assistant this was requested for)')).toBeLessThan(md.indexOf('### Claude Code'))
    expect(md).toContain('See https://example.com/codex for where Skills go.')
    expect(md).toContain('Restart Codex afterwards.')
    expect(md).toContain('v1.0.0 is not the current version (the current one is v1.1.0)')
  })
})

describe('the files tab', () => {
  it('lists SKILL.md first, then folders, then the other files', () => {
    const rows = fileTree([
      { path: 'README.md', size: 10 },
      { path: 'scripts/run.py', size: 30 },
      { path: 'SKILL.md', size: 20 },
      { path: 'references/style.md', size: 40 },
      { path: 'references/deep/notes.md' },
    ])
    expect(rows.map((row) => `${'  '.repeat(row.depth)}${row.kind === 'dir' ? `${row.name}/` : row.name}`)).toEqual([
      'SKILL.md',
      'references/',
      '  deep/',
      '    notes.md',
      '  style.md',
      'scripts/',
      '  run.py',
      'README.md',
    ])
    expect(rows.find((row) => row.path === 'references/deep/notes.md')).toMatchObject({ kind: 'file', size: 0 })
  })

  it('shows text files and only names binaries', () => {
    expect(isTextPath('scripts/run.py')).toBe(true)
    expect(isTextPath('assets/logo.PNG')).toBe(false)
  })

  it('marks text with the language it is mostly written in', () => {
    expect(guessLang('Write release notes from the git log.')).toBe('en')
    expect(guessLang('从提交记录写发布说明。')).toBe('zh')
    expect(guessLang('コミット履歴からリリースノートを書きます。')).toBe('ja')
    expect(guessLang('커밋 기록으로 릴리스 노트를 씁니다.')).toBe('ko')
    expect(guessLang('Release notes, also called 发布说明, from the git log of any project.')).toBe('en')
  })
})

describe('page refresh after a save', () => {
  it('does nothing outside Next.js, so scripts and the import job can save Skills', () => {
    const warn = vi.fn()
    const doc = { id: 1 }
    expect(refreshSkillsAfterChange({ doc, req: { payload: { logger: { warn } } } } as never)).toBe(doc)
    expect(warn).not.toHaveBeenCalled()
  })
})
