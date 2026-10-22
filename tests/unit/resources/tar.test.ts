import { gzipSync } from 'node:zlib'
import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { readTarGz, TarError } from '@/modules/resources/package/tar'
import { utf8 } from '@/modules/resources/package/types'

const fixture = readFileSync(path.join(import.meta.dirname, 'fixtures/skill-repo.tar.gz'))

describe('readTarGz', () => {
  it('reads a git archive: files, directories, symlinks and the commit from the pax header', () => {
    const archive = readTarGz(fixture)
    expect(archive.commit).toBe('d5f3a9efabec70338e4a50b67f8e373a310824ca')
    const license = archive.entries.find((e) => e.path === 'skill-repo-main/LICENSE')
    expect(license?.type).toBe('file')
    expect(utf8(license!.data)).toMatch(/^MIT License/)
    const link = archive.entries.find((e) => e.path === 'skill-repo-main/skills/hello/link-to-readme')
    expect(link?.type).toBe('symlink')
    expect(link?.linkTarget).toBe('../../README.md')
    expect(archive.entries.find((e) => e.path === 'skill-repo-main/skills/')?.type).toBe('dir')
  })

  it('refuses things that are not gzip or not tar', () => {
    expect(() => readTarGz(new Uint8Array([1, 2, 3, 4]))).toThrow(TarError)
    expect(() => readTarGz(gzipSync(Buffer.alloc(1024, 65)))).toThrow(/Not a tar archive/)
  })

  it('stops at the decompressed size cap', () => {
    expect(() => readTarGz(gzipSync(Buffer.alloc(4096)), 1024)).toThrow(/expands beyond/)
  })
})
