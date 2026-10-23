import { describe, expect, it } from 'vitest'

import { needsBody, parseAppReportInput, reportKinds, reportRules } from '@/modules/apps/reports/rules'
import { cleanLine } from '@/modules/apps/reviews/rules'

const report = { app: 12, kind: 'wrong-info', body: 'The free plan was dropped in March.', contact: 'me@example.com', locale: 'ja' }

describe('parseAppReportInput', () => {
  it('reads a report from the page', () => {
    expect(parseAppReportInput(report)).toEqual({ ok: true, value: report })
    expect(parseAppReportInput({ ...report, app: '12' })).toMatchObject({ ok: true, value: { app: 12 } })
  })

  it('needs details, except for an app that has shut down', () => {
    expect(needsBody('wrong-info')).toBe(true)
    expect(needsBody('other')).toBe(true)
    expect(needsBody('shut-down')).toBe(false)
    expect(parseAppReportInput({ ...report, body: '  \n ' })).toEqual({ ok: false, error: 'empty-body' })
    expect(parseAppReportInput({ ...report, kind: 'other', body: undefined })).toEqual({ ok: false, error: 'empty-body' })
    expect(parseAppReportInput({ ...report, kind: 'shut-down', body: '' })).toMatchObject({ ok: true, value: { body: '' } })
  })

  it('cleans the details as reviews are cleaned, and the contact to one line', () => {
    const parsed = parseAppReportInput({ ...report, body: ' Pricing\r\n\r\n\r\nis wrong​ ', contact: ' me@example.com\n(Telegram @me) ' })
    expect(parsed).toMatchObject({ ok: true, value: { body: 'Pricing\n\nis wrong', contact: 'me@example.com (Telegram @me)' } })
    expect(parseAppReportInput({ ...report, contact: 42 })).toMatchObject({ ok: true, value: { contact: '' } })
  })

  it('counts characters, as readers do', () => {
    expect(parseAppReportInput({ ...report, body: '错'.repeat(reportRules.maxBody) }).ok).toBe(true)
    expect(parseAppReportInput({ ...report, body: '错'.repeat(reportRules.maxBody + 1) })).toEqual({ ok: false, error: 'body-too-long' })
    expect(parseAppReportInput({ ...report, contact: '😀'.repeat(reportRules.maxContact) }).ok).toBe(true)
    expect(parseAppReportInput({ ...report, contact: 'a'.repeat(reportRules.maxContact + 1) })).toEqual({ ok: false, error: 'contact-too-long' })
  })

  it('refuses unknown apps, kinds and languages', () => {
    expect(parseAppReportInput(null)).toEqual({ ok: false, error: 'invalid-app' })
    expect(parseAppReportInput({ ...report, app: 0 })).toEqual({ ok: false, error: 'invalid-app' })
    expect(parseAppReportInput({ ...report, kind: 'spam' })).toEqual({ ok: false, error: 'invalid-kind' })
    expect(parseAppReportInput({ ...report, locale: 'fr' })).toEqual({ ok: false, error: 'invalid-locale' })
    expect(parseAppReportInput({ ...report, locale: 'zh-hans' })).toEqual({ ok: false, error: 'invalid-locale' })
  })

  it('knows three kinds', () => {
    expect(reportKinds).toEqual(['wrong-info', 'shut-down', 'other'])
  })
})

describe('cleanLine', () => {
  it('folds line breaks and runs of space, and drops invisible characters', () => {
    expect(cleanLine('  a\n\tb  ‮c⁦ ')).toBe('a b c')
    expect(cleanLine('​')).toBe('')
  })
})
