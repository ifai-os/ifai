import { gunzipSync } from 'node:zlib'

import { utf8 } from './types'

/**
 * A small tar reader for GitHub archives (codeload …/tar.gz/<ref>), which `git archive` writes:
 * ustar headers, pax extended headers for long paths, and a pax global header whose
 * `comment` is the commit the archive was made from. No dependency, no extraction to disk.
 */
export type TarEntry = {
  path: string
  type: 'file' | 'dir' | 'symlink' | 'hardlink' | 'other'
  data: Uint8Array
  linkTarget?: string
  mode: number
}

export type TarArchive = {
  entries: TarEntry[]
  /** The commit from the pax global header, when the archive came from `git archive`. */
  commit?: string
}

const BLOCK = 512

/** Decompressed size we are willing to hold in memory for one repository snapshot. */
export const MAX_UNPACKED_BYTES = 128 * 1024 * 1024

export class TarError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'TarError'
  }
}

export function readTarGz(gz: Uint8Array, maxBytes: number = MAX_UNPACKED_BYTES): TarArchive {
  let tar: Buffer
  try {
    tar = gunzipSync(gz, { maxOutputLength: maxBytes })
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    throw new TarError(
      code === 'ERR_BUFFER_TOO_LARGE'
        ? `Archive expands beyond ${Math.round(maxBytes / 1024 / 1024)} MB`
        : `Not a gzip archive: ${(error as Error).message}`,
    )
  }
  return readTar(tar)
}

function field(buf: Uint8Array, start: number, length: number): string {
  let end = start
  const stop = Math.min(start + length, buf.length)
  while (end < stop && buf[end] !== 0) end++
  return utf8(buf.subarray(start, end))
}

/** Octal text, or GNU base-256 when the high bit of the first byte is set. */
function numeric(buf: Uint8Array, start: number, length: number): number {
  if (buf[start] & 0x80) {
    let value = 0
    for (let i = start + 1; i < start + length; i++) value = value * 256 + buf[i]
    return value
  }
  const text = field(buf, start, length).trim()
  return text ? parseInt(text, 8) : 0
}

/** pax records: "<length> <key>=<value>\n" … */
function parsePax(data: Uint8Array): Record<string, string> {
  const text = utf8(data)
  const records: Record<string, string> = {}
  let pos = 0
  while (pos < text.length) {
    const space = text.indexOf(' ', pos)
    if (space === -1) break
    const length = Number(text.slice(pos, space))
    if (!Number.isFinite(length) || length <= 0) break
    const record = text.slice(space + 1, pos + length)
    const eq = record.indexOf('=')
    if (eq > 0) records[record.slice(0, eq)] = record.slice(eq + 1).replace(/\n$/, '')
    pos += length
  }
  return records
}

export function readTar(tar: Uint8Array): TarArchive {
  const entries: TarEntry[] = []
  const global: Record<string, string> = {}
  let longName: string | undefined
  let longLink: string | undefined
  let extended: Record<string, string> | undefined
  let pos = 0

  while (pos + BLOCK <= tar.length) {
    const header = tar.subarray(pos, pos + BLOCK)
    if (header.every((byte) => byte === 0)) break
    const magic = field(header, 257, 6)
    if (!magic.startsWith('ustar')) throw new TarError('Not a tar archive')

    const name = field(header, 0, 100)
    const mode = numeric(header, 100, 8)
    const size = numeric(header, 124, 12)
    const type = String.fromCharCode(header[156])
    const linkName = field(header, 157, 100)
    const prefix = field(header, 345, 155)
    pos += BLOCK

    const data = tar.subarray(pos, Math.min(pos + size, tar.length))
    pos += Math.ceil(size / BLOCK) * BLOCK

    switch (type) {
      case 'L':
        longName = field(data, 0, data.length)
        continue
      case 'K':
        longLink = field(data, 0, data.length)
        continue
      case 'x':
        extended = parsePax(data)
        continue
      case 'g':
        Object.assign(global, parsePax(data))
        continue
    }

    const path = longName ?? extended?.path ?? (prefix ? `${prefix}/${name}` : name)
    const linkTarget = longLink ?? extended?.linkpath ?? linkName
    const entryType: TarEntry['type'] =
      type === '0' || type === '\0' || type === '7'
        ? 'file'
        : type === '5'
          ? 'dir'
          : type === '2'
            ? 'symlink'
            : type === '1'
              ? 'hardlink'
              : 'other'
    entries.push({
      path,
      type: entryType,
      data: entryType === 'file' ? data : new Uint8Array(0),
      linkTarget: linkTarget || undefined,
      mode,
    })
    longName = longLink = extended = undefined
  }

  const commit = global.comment?.trim()
  return { entries, commit: commit && /^[0-9a-f]{40}$/.test(commit) ? commit : undefined }
}
