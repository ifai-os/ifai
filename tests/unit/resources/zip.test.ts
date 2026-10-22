import { createHash } from 'node:crypto'

import { describe, expect, it } from 'vitest'

import { buildZip, readZip, ZipError } from '@/modules/resources/package/zip'

const enc = (text: string) => new TextEncoder().encode(text)
const sha = (data: Uint8Array) => createHash('sha256').update(data).digest('hex')

describe('buildZip / readZip', () => {
  const files = [
    { path: 'scripts/run.py', data: enc('print(1)\n') },
    { path: 'SKILL.md', data: enc('---\nname: x\ndescription: y\n---\n') },
  ]

  it('round-trips and is deterministic regardless of input order', () => {
    const a = buildZip(files)
    const b = buildZip([...files].reverse())
    expect(sha(a)).toBe(sha(b))
    const back = readZip(a)
    expect(back.rejected).toEqual([])
    expect(back.files.map((f) => f.path)).toEqual(['SKILL.md', 'scripts/run.py'])
    expect(new TextDecoder().decode(back.files[1].data)).toBe('print(1)\n')
  })

  it('leaves out entries over the limits and says why', () => {
    const many = Array.from({ length: 3 }, (_, i) => ({ path: `f${i}.txt`, data: enc('x') }))
    const limited = readZip(buildZip(many), { maxFiles: 2, maxTotalBytes: 100, maxFileBytes: 100 })
    expect(limited.files).toHaveLength(2)
    expect(limited.rejected).toEqual([{ path: 'f2.txt', reason: 'too_many_files' }])

    const big = readZip(buildZip([{ path: 'big.bin', data: new Uint8Array(300) }]), { maxFiles: 10, maxTotalBytes: 1000, maxFileBytes: 200 })
    expect(big.rejected).toEqual([{ path: 'big.bin', reason: 'file_too_large' }])

    const total = readZip(buildZip([{ path: 'a', data: new Uint8Array(150) }, { path: 'b', data: new Uint8Array(150) }]), { maxFiles: 10, maxTotalBytes: 200, maxFileBytes: 200 })
    expect(total.rejected).toEqual([{ path: 'b', reason: 'total_too_large' }])
  })

  it('refuses a corrupt Zip', () => {
    expect(() => readZip(enc('definitely not a zip'))).toThrow(ZipError)
  })
})
