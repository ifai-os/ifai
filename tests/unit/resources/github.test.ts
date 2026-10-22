import { describe, expect, it } from 'vitest'

import { archiveUrl, isValidRef, parseRepositoryUrl } from '@/modules/resources/import/github'

describe('parseRepositoryUrl', () => {
  it('reads owner, repo, ref and sub-directory', () => {
    expect(parseRepositoryUrl('https://github.com/anthropics/skills')).toEqual({ owner: 'anthropics', repo: 'skills', ref: undefined, subdir: undefined })
    expect(parseRepositoryUrl('https://github.com/anthropics/skills.git/')).toEqual({ owner: 'anthropics', repo: 'skills', ref: undefined, subdir: undefined })
    expect(parseRepositoryUrl(' https://github.com/anthropics/skills/tree/main/skills/pdf/ ')).toEqual({ owner: 'anthropics', repo: 'skills', ref: 'main', subdir: 'skills/pdf' })
    expect(parseRepositoryUrl('https://github.com/o/r/tree/v1.2.0')).toEqual({ owner: 'o', repo: 'r', ref: 'v1.2.0', subdir: undefined })
    expect(parseRepositoryUrl('https://github.com/o/r/blob/main/dir/SKILL.md')).toEqual({ owner: 'o', repo: 'r', ref: 'main', subdir: 'dir/SKILL.md' })
  })

  it('rejects other hosts and incomplete addresses', () => {
    expect(parseRepositoryUrl('https://gitlab.com/o/r')).toBeNull()
    expect(parseRepositoryUrl('https://github.com/onlyowner')).toBeNull()
    expect(parseRepositoryUrl('github.com/o/r')).toBeNull()
    expect(parseRepositoryUrl('https://github.com/o/r/pulls')).toBeNull()
  })
})

describe('archiveUrl / isValidRef', () => {
  it('builds the codeload address, keeping slashes between ref segments', () => {
    expect(archiveUrl({ owner: 'o', repo: 'r' }, 'refs/heads/feat/x')).toBe('https://codeload.github.com/o/r/tar.gz/refs/heads/feat/x')
    expect(archiveUrl({ owner: 'o', repo: 'r' }, 'v1.0 beta')).toBe('https://codeload.github.com/o/r/tar.gz/v1.0%20beta')
  })

  it('accepts branch, tag and commit names and refuses path tricks', () => {
    expect(isValidRef('main')).toBe(true)
    expect(isValidRef('d5f3a9efabec70338e4a50b67f8e373a310824ca')).toBe(true)
    expect(isValidRef('release/2026.10')).toBe(true)
    expect(isValidRef('../main')).toBe(false)
    expect(isValidRef('-flag')).toBe(false)
    expect(isValidRef('main/')).toBe(false)
  })
})
