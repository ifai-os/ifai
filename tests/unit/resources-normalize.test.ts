import { describe, expect, it } from 'vitest'

import {
  isSha256,
  isValidVersion,
  normalizeSha256,
  normalizeVersion,
  shanghaiDay,
  shanghaiDayStart,
  submissionCode,
} from '@/modules/resources/normalize'

describe('skill versions', () => {
  it('drops the leading v and keeps the rest', () => {
    expect(normalizeVersion(' v2.4.0 ')).toBe('2.4.0')
    expect(normalizeVersion('V1.0')).toBe('1.0')
    expect(normalizeVersion('2026.10.18')).toBe('2026.10.18')
  })

  it('accepts dotted numbers with an optional pre-release tag', () => {
    expect(isValidVersion('2.4.0')).toBe(true)
    expect(isValidVersion('1.0')).toBe(true)
    expect(isValidVersion('2026.10.18')).toBe(true)
    expect(isValidVersion('1.0.0-beta.1')).toBe(true)
    expect(isValidVersion('v2.4.0')).toBe(false)
    expect(isValidVersion('2')).toBe(false)
    expect(isValidVersion('latest')).toBe(false)
    expect(isValidVersion('')).toBe(false)
  })
})

describe('fingerprints', () => {
  const digest = '9f3a'.repeat(16)

  it('normalizes case and the sha256: prefix', () => {
    expect(normalizeSha256(` sha256:${digest.toUpperCase()} `)).toBe(digest)
  })

  it('accepts exactly 64 hex characters', () => {
    expect(isSha256(digest)).toBe(true)
    expect(isSha256(digest.slice(1))).toBe(false)
    expect(isSha256(digest.toUpperCase())).toBe(false)
    expect(isSha256('')).toBe(false)
  })
})

describe('submission numbers', () => {
  it('uses the Shanghai date, so late UTC evenings count as the next day', () => {
    expect(shanghaiDay(new Date('2026-10-22T15:59:00Z'))).toBe('2026-10-22')
    expect(shanghaiDay(new Date('2026-10-22T16:00:00Z'))).toBe('2026-10-23')
    expect(shanghaiDayStart(new Date('2026-10-22T16:00:00Z')).toISOString()).toBe('2026-10-22T16:00:00.000Z')
  })

  it('reads S-MMDD-NN', () => {
    expect(submissionCode(new Date('2026-10-22T03:00:00Z'), 7)).toBe('S-1022-07')
    expect(submissionCode(new Date('2026-01-05T20:00:00Z'), 12)).toBe('S-0106-12')
  })
})

describe('compareVersions / nextVersion', async () => {
  const { compareVersions, nextVersion } = await import('@/modules/resources/normalize')

  it('orders numerically, pre-releases first', () => {
    expect(['1.2.10', '1.2.9', '1.10.0', '1.2.10-beta.1', 'v0.9'].sort(compareVersions)).toEqual(['v0.9', '1.2.9', '1.2.10-beta.1', '1.2.10', '1.10.0'])
    expect(compareVersions('1.0', '1.0.0')).toBe(0)
  })

  it('bumps the last number of the latest version, starting from 1.0.0', () => {
    expect(nextVersion([])).toBe('1.0.0')
    expect(nextVersion(['1.0.0', '1.2.3', 'v1.2.9'])).toBe('1.2.10')
    expect(nextVersion(['2026.10.18', '2026.10.19'])).toBe('2026.10.20')
    expect(nextVersion(['1.0.0-beta.1'])).toBe('1.0.1')
  })
})
