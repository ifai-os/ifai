'use client'

import { Button, toast, useDocumentInfo, useTranslation } from '@payloadcms/ui'
import { useCallback, useEffect, useState } from 'react'

import type { AppHeatResponse } from '../metrics/endpoints'
import type { MentionBasis } from '../schema'

// The back office is for the site owner; its text follows Payload's own admin language (zh / en).
const text = {
  zh: {
    saveFirst: '保存并发布后，每天上海时间 06:00 算一次热度。',
    none: '还没有热度。发布后，下一次热度计算（每天上海时间 06:00，或应用列表上方的「现在重算」）会算它。',
    heading: (day: string) => `${day} 的热度`,
    rank: '网站排名',
    engagement: '点击与收藏',
    mentions: '日报提及',
    trancoRank: (rank: number, domain: string) => `Tranco 第 ${rank.toLocaleString()} 名（${domain}）`,
    notRanked: '不在 Tranco 前 100 万名里；官网是 GitHub、Hugging Face 这类网站上的页面或子域名时也不算排名。',
    clicks: (count: number) => `近 7 天 ${count} 位访客点了「打开网站」（同一访客每天只算一次）`,
    mentionCount: (count: number) => `近 30 天 ${count} 条日报（同一事件只算一次）`,
    change: (change: number | null) =>
      change === null ? '7 天前还没有热度。' : `7 天变化 ${change > 0 ? '+' : ''}${change}。`,
    ranks: (overall: number, category: number | null, rising: number | null) =>
      [`综合第 ${overall} 名`, category ? `分类第 ${category} 名` : '', rising ? `飙升第 ${rising} 名` : '不在飙升榜']
        .filter(Boolean)
        .join(' · '),
    history: '近 30 天',
    mentionsTitle: '日报里提到它',
    noMentions: '还没有匹配到日报。',
    basis: { name: '名称', alias: '别名', domain: '来源链接' } satisfies Record<MentionBasis, string>,
    remove: '不是它，删掉',
    restore: '恢复',
    removed: '已删掉',
    nextRun: '改动在下一次计算热度时生效。',
    failedRequest: '操作失败',
  },
  en: {
    saveFirst: 'Once saved and published, heat is computed every day at 06:00 Shanghai time.',
    none: 'No heat yet. Once published, the next run (06:00 Shanghai time, or「Run now」above the apps list) scores it.',
    heading: (day: string) => `Heat on ${day}`,
    rank: 'Site rank',
    engagement: 'Clicks and saves',
    mentions: 'Daily mentions',
    trancoRank: (rank: number, domain: string) => `Tranco #${rank.toLocaleString()} (${domain})`,
    notRanked: 'Not in the Tranco top million. A page or subdomain on a site like GitHub or Hugging Face gets no rank either.',
    clicks: (count: number) => `${count} visitors opened the website from here in the last 7 days (once per visitor a day)`,
    mentionCount: (count: number) => `${count} daily stories in the last 30 days (one per event)`,
    change: (change: number | null) =>
      change === null ? 'No heat from 7 days ago.' : `7-day change ${change > 0 ? '+' : ''}${change}.`,
    ranks: (overall: number, category: number | null, rising: number | null) =>
      [`#${overall} overall`, category ? `#${category} in its category` : '', rising ? `#${rising} rising` : 'not rising']
        .filter(Boolean)
        .join(' · '),
    history: 'Last 30 days',
    mentionsTitle: 'In the daily news',
    noMentions: 'No daily stories matched yet.',
    basis: { name: 'name', alias: 'alias', domain: 'source link' } satisfies Record<MentionBasis, string>,
    remove: 'Not this app, remove',
    restore: 'Restore',
    removed: 'Removed',
    nextRun: 'Heat follows at the next run.',
    failedRequest: 'Failed',
  },
}

const box = {
  marginBottom: 'var(--base)',
  padding: 'calc(var(--base) * 0.75)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 'var(--style-radius-m)',
  lineHeight: 1.5,
} as const

const list = { margin: '0.25em 0 0', paddingLeft: '1.25em' } as const

/** The「热度」tab of an app: today's heat and its three parts, its places, the last 30 days and the matched stories. */
export function HeatPanel() {
  const { id } = useDocumentInfo()
  const { i18n } = useTranslation()
  const t = i18n.language.startsWith('zh') ? text.zh : text.en
  const [heat, setHeat] = useState<AppHeatResponse | null>(null)
  const [busy, setBusy] = useState<number | null>(null)

  const load = useCallback(async (): Promise<AppHeatResponse | null> => {
    const response = await fetch(`/api/apps/${id}/heat`, { credentials: 'same-origin' })
    return response.ok ? ((await response.json()) as AppHeatResponse) : null
  }, [id])

  useEffect(() => {
    if (id) void load().then((next) => next && setHeat(next))
  }, [id, load])

  if (!id) return <div style={box}>{t.saveFirst}</div>

  async function setRemoved(mentionId: number, removed: boolean) {
    setBusy(mentionId)
    try {
      const response = await fetch(`/api/apps/${id}/mentions/${mentionId}`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ removed }),
      })
      const data = (await response.json()) as { ok?: boolean; error?: string }
      if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`)
      toast.success(t.nextRun)
      const next = await load()
      if (next) setHeat(next)
    } catch (error) {
      toast.error(`${t.failedRequest}: ${error instanceof Error ? error.message : String(error)}`)
    } finally {
      setBusy(null)
    }
  }

  const latest = heat?.latest ?? null
  const day = (iso: string) => new Date(iso).toLocaleDateString(i18n.language)

  return (
    <div style={box}>
      {heat === null ? (
        <p style={{ margin: 0 }}>…</p>
      ) : latest === null ? (
        <p style={{ margin: 0 }}>{t.none}</p>
      ) : (
        <>
          <p style={{ margin: 0 }}>
            <strong>
              {t.heading(latest.day)}：{latest.heat}
            </strong>{' '}
            = {t.rank} {latest.rankScore} + {t.engagement} {latest.engagementScore} + {t.mentions} {latest.mentionScore}
          </p>
          <ul style={list}>
            <li>
              {t.rank}：
              {latest.trancoRank !== null && latest.trancoDomain ? t.trancoRank(latest.trancoRank, latest.trancoDomain) : t.notRanked}
            </li>
            <li>
              {t.engagement}：{t.clicks(latest.clicks)}
            </li>
            <li>
              {t.mentions}：{t.mentionCount(latest.mentions)}
            </li>
          </ul>
          <p style={{ margin: '0.5em 0 0' }}>
            {t.ranks(latest.rankOverall, latest.rankCategory, latest.rankRising)}。{t.change(latest.change7d)}
          </p>
          {heat.history.length > 1 && (
            <p style={{ margin: '0.5em 0 0' }}>
              {t.history}：
              <small>{heat.history.map((point) => `${point.day.slice(5)} ${point.heat}`).join(' · ')}</small>
            </p>
          )}
        </>
      )}

      {heat !== null && (
        <div style={{ marginTop: 'var(--base)' }}>
          <strong>{t.mentionsTitle}</strong>
          {heat.mentions.length === 0 ? (
            <p style={{ margin: '0.25em 0 0' }}>{t.noMentions}</p>
          ) : (
            <ul style={list}>
              {heat.mentions.map((mention) => (
                <li key={mention.id} style={{ marginBottom: '0.25em', wordBreak: 'break-word' }}>
                  <span style={mention.removed ? { textDecoration: 'line-through' } : undefined}>
                    <a href={`/admin/collections/stories/${mention.storyId}`}>{mention.title || `#${mention.storyId}`}</a>
                  </span>{' '}
                  <small>
                    {day(mention.publishedAt)} · {t.basis[mention.basis]}：{mention.matched}
                    {mention.removed ? ` · ${t.removed}` : ''}
                  </small>{' '}
                  <Button
                    buttonStyle="secondary"
                    size="small"
                    margin={false}
                    disabled={busy !== null}
                    onClick={() => setRemoved(mention.id, !mention.removed)}
                  >
                    {mention.removed ? t.restore : t.remove}
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
