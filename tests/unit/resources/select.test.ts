import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { isSelectionError, selectSkillDir } from '@/modules/resources/package/select'
import { readTarGz } from '@/modules/resources/package/tar'

const archive = readTarGz(readFileSync(path.join(import.meta.dirname, 'fixtures/skill-repo.tar.gz')))

describe('selectSkillDir', () => {
  it('lists the candidates when the repository holds several Skills and no directory was given', () => {
    const result = selectSkillDir(archive)
    expect(isSelectionError(result) && result.error).toBe('ambiguous')
    expect(isSelectionError(result) && result.candidates).toEqual(['skills/hello', 'skills/second'])
  })

  it('takes the files under the given directory, relative to it, and notes links and the root license', () => {
    const result = selectSkillDir(archive, '/skills/hello/')
    if (isSelectionError(result)) throw new Error(result.error)
    expect(result.dir).toBe('skills/hello')
    expect(result.files.map((f) => f.path).sort()).toEqual(['SKILL.md', 'references/notes.md', 'scripts/run.py'])
    expect(result.symlinks).toEqual(['link-to-readme'])
    expect(result.repoLicenseFile).toBe('LICENSE')
    expect(result.repoReadme?.path).toBe('README.md')
  })

  it('reports a directory without SKILL.md', () => {
    const result = selectSkillDir(archive, 'skills/nope')
    expect(isSelectionError(result) && result.error).toBe('no_skill_md')
  })

  it('uses the single Skill of a repository without being told where it is', () => {
    const single = {
      entries: archive.entries.filter((e) => !e.path.includes('skills/second')),
      commit: archive.commit,
    }
    const result = selectSkillDir(single)
    expect(!isSelectionError(result) && result.dir).toBe('skills/hello')
  })

  it('accepts SKILL.md at the repository root', () => {
    const root = {
      entries: [
        { path: 'r-main/SKILL.md', type: 'file' as const, data: new Uint8Array([35]), mode: 0o644 },
        { path: 'r-main/.DS_Store', type: 'file' as const, data: new Uint8Array(0), mode: 0o644 },
        { path: 'r-main/scripts/a.sh', type: 'file' as const, data: new Uint8Array(0), mode: 0o755 },
      ],
    }
    const result = selectSkillDir(root)
    expect(!isSelectionError(result) && result.files.map((f) => f.path)).toEqual(['SKILL.md', 'scripts/a.sh'])
  })
})
