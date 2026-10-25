'use client'

import { Button, CheckboxInput, toast, useTranslation } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'

import { localizePath } from '@/i18n/config'

import type { OpenMemberReport } from '../admin'
import type { MemberReportsResponse } from '../endpoints'
import { profilePath, type MemberReportReason } from '../rules'

// The back office is for the site owner; its text follows Payload's own admin language (zh / en).
const text = {
  zh: {
    title: (members: number) => `有 ${members} 位读者被举报，还没处理`,
    more: (shown: number) => `只列最近被举报的 ${shown} 位。`,
    anonymous: '（没有名字）',
    noHandle: '（没有主页地址）',
    reported: (reports: number) => `被举报 ${reports} 次`,
    reasons: {
      impersonation: '冒充他人',
      profile: '主页资料不当',
      spam: '广告或刷屏',
      abuse: '骚扰或冒犯',
      other: '其他',
    } satisfies Record<MemberReportReason, string>,
    bio: '介绍',
    website: '网站',
    empty: '（空）',
    clearProfile: '清掉介绍和网站',
    resetHandle: '重置主页地址',
    resetName: '重置昵称',
    handle: '处理',
    keep: '保留，举报不成立',
    handled: '已处理，这个人的举报标为已处理。',
    kept: '已保留，举报标为已处理。',
    failedRequest: '操作失败',
    separator: '、',
    colon: '：',
  },
  en: {
    title: (members: number) => `${members} reported ${members === 1 ? 'member' : 'members'} nobody has dealt with yet`,
    more: (shown: number) => `Only the ${shown} most recently reported are listed.`,
    anonymous: '(no name)',
    noHandle: '(no address)',
    reported: (reports: number) => `reported ${reports} times`,
    reasons: {
      impersonation: 'pretending to be someone else',
      profile: 'unsuitable profile',
      spam: 'spam or flooding',
      abuse: 'abusive',
      other: 'other',
    } satisfies Record<MemberReportReason, string>,
    bio: 'Line',
    website: 'Website',
    empty: '(empty)',
    clearProfile: 'Clear their line and website',
    resetHandle: 'Reset their address',
    resetName: 'Reset their name',
    handle: 'Deal with it',
    keep: 'Keep them, the reports were wrong',
    handled: 'Done; their reports are marked as dealt with.',
    kept: 'Kept; their reports are marked as dealt with.',
    failedRequest: 'Failed',
    separator: ', ',
    colon: ': ',
  },
}

const box = {
  marginBottom: 'var(--base)',
  padding: 'calc(var(--base) * 0.75)',
  border: '1px solid var(--theme-error-500)',
  borderRadius: 'var(--style-radius-m)',
  lineHeight: 1.5,
} as const

const row = {
  padding: 'calc(var(--base) * 0.5) 0',
  borderTop: '1px solid var(--theme-elevation-100)',
} as const

type Choices = { clearProfile: boolean; resetHandle: boolean; resetName: boolean }
const noChoices: Choices = { clearProfile: false, resetHandle: false, resetName: false }

/**
 * Above the circles list, only when there are any: members readers reported that the site owner
 * has not dealt with (docs/specs/circles.md rule 24). Clear their line and site, reset their
 * address or name, any of these at once; or keep them as they are.
 */
export function MemberReports() {
  const { i18n } = useTranslation()
  const t = i18n.language.startsWith('zh') ? text.zh : text.en
  const [reports, setReports] = useState<MemberReportsResponse | null>(null)
  const [choices, setChoices] = useState<Record<string, Choices>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(
    () =>
      fetch('/api/circles/member-reports', { credentials: 'same-origin' })
        .then((response) => (response.ok ? (response.json() as Promise<MemberReportsResponse>) : null))
        .catch(() => null),
    [],
  )

  useEffect(() => {
    void load().then(setReports)
  }, [load])

  if (!reports || reports.total === 0) return null

  async function deal(member: OpenMemberReport, change: Choices | { keep: true }) {
    setBusy(member.userId)
    try {
      const response = await fetch(`/api/circles/member-reports/${encodeURIComponent(member.userId)}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(change),
      })
      const data = (await response.json()) as { ok?: boolean; error?: string }
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
      toast.success('keep' in change ? t.kept : t.handled)
      setChoices((current) => {
        const next = { ...current }
        delete next[member.userId]
        return next
      })
      setReports(await load())
    } catch (error) {
      toast.error(`${t.failedRequest}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(null)
    }
  }

  // Their page on the site, in the back office's language.
  const pageHref = (handle: string) => localizePath(i18n.language.startsWith('zh') ? 'zh-Hans' : 'en', profilePath(handle))

  return (
    <div style={box} role="status">
      <strong>{t.title(reports.total)}</strong>
      {reports.total > reports.members.length && <p style={{ margin: 0 }}>{t.more(reports.members.length)}</p>}
      {reports.members.map((member) => {
        const chosen = choices[member.userId] ?? noChoices
        const choose = (key: keyof Choices) => (value: boolean) => setChoices((current) => ({ ...current, [member.userId]: { ...chosen, [key]: value } }))
        return (
          <div key={member.userId} style={row}>
            <p style={{ margin: 0, wordBreak: 'break-word' }}>
              <strong>{member.name || t.anonymous}</strong>{' '}
              {member.handle ? (
                <a href={pageHref(member.handle)} target="_blank" rel="noreferrer">
                  @{member.handle}
                </a>
              ) : (
                t.noHandle
              )}{' '}
              <small>&lt;{member.email}&gt;</small>
            </p>
            <p style={{ margin: '0.25em 0 0', color: 'var(--theme-error-500)' }}>
              {t.reported(member.reports)}
              {t.colon}
              {Object.entries(member.reasons)
                .map(([reason, times]) => `${t.reasons[reason as MemberReportReason]} × ${times}`)
                .join(t.separator)}
            </p>
            <p style={{ margin: '0.25em 0 0', wordBreak: 'break-word' }}>
              <small>
                {t.bio}
                {t.colon}
              </small>
              <span lang={member.bioLang ?? undefined}>{member.bio || t.empty}</span>
            </p>
            <p style={{ margin: '0.25em 0 0', wordBreak: 'break-all' }}>
              <small>
                {t.website}
                {t.colon}
              </small>
              {member.website || t.empty}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5em 1em', marginTop: '0.5em' }}>
              {(['clearProfile', 'resetHandle', 'resetName'] as const).map((key) => (
                <CheckboxInput
                  key={key}
                  id={`member-report-${member.userId}-${key}`}
                  name={`member-report-${member.userId}-${key}`}
                  label={t[key]}
                  checked={chosen[key]}
                  readOnly={busy !== null}
                  onToggle={(event) => choose(key)(event.target.checked)}
                />
              ))}
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5em', marginTop: '0.5em' }}>
              <Button
                buttonStyle="secondary"
                size="small"
                margin={false}
                disabled={busy !== null || !(chosen.clearProfile || chosen.resetHandle || chosen.resetName)}
                onClick={() => deal(member, chosen)}
              >
                {t.handle}
              </Button>
              <Button buttonStyle="secondary" size="small" margin={false} disabled={busy !== null} onClick={() => deal(member, { keep: true })}>
                {t.keep}
              </Button>
            </div>
          </div>
        )
      })}
    </div>
  )
}
