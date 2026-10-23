import { describe, expect, it } from 'vitest'

import { isCrossSite } from '@/lib/same-origin'
import { parseSaveTarget, pendingSaveValue, readPendingSave } from '@/modules/saves/target'

describe('parseSaveTarget', () => {
  it('reads a type and a Payload id from a query string or a JSON body', () => {
    expect(parseSaveTarget('app', '12')).toEqual({ type: 'app', id: 12 })
    expect(parseSaveTarget('app', 12)).toEqual({ type: 'app', id: 12 })
    expect(parseSaveTarget('skill', '3')).toEqual({ type: 'skill', id: 3 })
    expect(parseSaveTarget('story', '5')).toEqual({ type: 'story', id: 5 })
  })

  it('refuses unknown types and ids that are not positive whole numbers in range', () => {
    expect(parseSaveTarget('poster', '12')).toBeNull()
    expect(parseSaveTarget(null, '12')).toBeNull()
    for (const id of ['0', '-1', '1.5', '012', 'abc', '', '99999999999', 0, -3, 1.5, 2 ** 31, null, undefined]) {
      expect(parseSaveTarget('app', id), String(id)).toBeNull()
    }
    expect(parseSaveTarget('app', 2 ** 31 - 1)).toEqual({ type: 'app', id: 2 ** 31 - 1 })
  })
})

describe('the save to finish after signing in', () => {
  it('round-trips through the address', () => {
    const value = pendingSaveValue({ type: 'app', id: 7 })
    expect(value).toBe('app-7')
    expect(readPendingSave(value)).toEqual({ type: 'app', id: 7 })
    expect(readPendingSave('skill-3')).toEqual({ type: 'skill', id: 3 })
    expect(readPendingSave('story-3')).toEqual({ type: 'story', id: 3 })
  })

  it('ignores anything else', () => {
    for (const value of [null, '', 'app', 'app-', 'app-x', 'poster-3', 'app-3-4', 'APP-3']) {
      expect(readPendingSave(value), String(value)).toBeNull()
    }
  })
})

describe('isCrossSite', () => {
  const request = (headers: Record<string, string>) => new Request('https://ifai.example/api/saves', { method: 'POST', headers })

  it("trusts the browser's Sec-Fetch-Site first", () => {
    expect(isCrossSite(request({ 'sec-fetch-site': 'same-origin' }))).toBe(false)
    expect(isCrossSite(request({ 'sec-fetch-site': 'same-site' }))).toBe(true)
    expect(isCrossSite(request({ 'sec-fetch-site': 'cross-site', origin: 'https://ifai.example' }))).toBe(true)
  })

  it('falls back to Origin, and leaves requests from outside a browser to the session check', () => {
    expect(isCrossSite(request({ origin: 'https://ifai.example' }))).toBe(false)
    expect(isCrossSite(request({ origin: 'https://evil.example' }))).toBe(true)
    expect(isCrossSite(request({}))).toBe(false)
  })
})
