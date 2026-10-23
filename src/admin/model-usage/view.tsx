import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
// eslint-disable-next-line no-restricted-imports -- admin routes have no locale prefix
import { redirect } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'
import type { CSSProperties, ReactNode } from 'react'

import { loadModelUsage, type About, type ModelUsage } from './data'
import { periodFrom, periods, sumDays } from './rules'
import { usageText, type UsageText } from './text'

const OPENROUTER_ACTIVITY = 'https://openrouter.ai/activity'

const section: CSSProperties = { marginTop: 'calc(var(--base) * 1.5)' }
const heading: CSSProperties = { margin: '0 0 calc(var(--base) * 0.5)', fontSize: '1.15rem', fontWeight: 600 }
const box: CSSProperties = {
  padding: 'calc(var(--base) * 0.75)',
  border: '1px solid var(--theme-elevation-150)',
  borderRadius: 'var(--style-radius-m)',
  lineHeight: 1.5,
}
const line: CSSProperties = { margin: '0.25em 0 0' }
const muted: CSSProperties = { color: 'var(--theme-elevation-600)' }
const warn: CSSProperties = { ...line, color: 'var(--theme-error-600)' }
const table: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }
const cell: CSSProperties = { padding: '0.45em 0.6em', borderBottom: '1px solid var(--theme-elevation-100)', textAlign: 'left', verticalAlign: 'top' }
const head: CSSProperties = { ...cell, fontWeight: 600, color: 'var(--theme-elevation-700)', whiteSpace: 'nowrap' }
const num: CSSProperties = { ...cell, textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }
const numHead: CSSProperties = { ...head, textAlign: 'right' }
const scroll: CSSProperties = { overflowX: 'auto' }

/**
 * /admin/model-usage (docs/specs/foundation.md「后台 · 模型用量」): today's spend against the
 * budget, the switches, the last 14 days, spend by purpose and the calls that need a person.
 * Payload treats custom root views as public and leaves out its template, so the view sends
 * visitors who are not signed in to the login page itself and wraps itself in the template.
 */
export async function ModelUsageView({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req, permissions, locale, visibleEntities } = initPageResult
  const adminRoute = req.payload.config.routes.admin
  const period = periodFrom(searchParams?.days)
  if (!req.user || !permissions.canAccessAdmin) {
    const back = `/model-usage${searchParams?.days ? `?days=${period}` : ''}`
    redirect(`${adminRoute}${req.payload.config.admin.routes.login}?redirect=${encodeURIComponent(back)}`)
  }

  const t = usageText(req.i18n.language)
  const data = await loadModelUsage({
    period,
    adminRoute,
    locale: req.i18n.language.startsWith('zh') ? 'zh-Hans' : 'en',
  })
  const zh = req.i18n.language.startsWith('zh')
  const time = (at: string) =>
    new Date(at).toLocaleString(zh ? 'zh-CN' : 'en-GB', {
      timeZone: 'Asia/Shanghai',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })

  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={locale}
      params={params}
      payload={req.payload}
      permissions={permissions}
      req={req}
      searchParams={searchParams}
      user={req.user}
      visibleEntities={{ collections: visibleEntities?.collections, globals: visibleEntities?.globals }}
    >
      <Gutter>
        <h1 style={{ margin: 'calc(var(--base) * 1.5) 0 calc(var(--base) * 0.5)' }}>{t.title}</h1>
        <p style={{ ...muted, margin: 0 }}>{t.intro}</p>

        <Overview data={data} t={t} />
        <Days data={data} t={t} />
        <Purposes data={data} t={t} adminRoute={adminRoute} />
        <Problems data={data} t={t} time={time} />

        <p style={{ ...muted, ...section, fontSize: '0.85rem' }}>
          {t.footnote}{' '}
          <a href={OPENROUTER_ACTIVITY} target="_blank" rel="noopener noreferrer">
            {t.switches.activity} ↗
          </a>
        </p>
      </Gutter>
    </DefaultTemplate>
  )
}

type Props = { data: ModelUsage; t: UsageText }

function Overview({ data, t }: Props) {
  const { today, switches } = data
  const switchRows: [string, boolean, string, string][] = [
    [t.switches.modelCalls, switches.modelCalls, t.switches.on, t.switches.off],
    [t.switches.collect, switches.collect, t.switches.on, t.switches.off],
    [t.switches.dailyEmail, switches.dailyEmail, t.switches.on, t.switches.off],
    [t.switches.apiKey, switches.apiKey, t.switches.set, t.switches.unset],
  ]
  return (
    <div style={{ ...section, display: 'grid', gap: 'var(--base)', gridTemplateColumns: 'repeat(auto-fit, minmax(18rem, 1fr))' }}>
      <div style={box}>
        <strong>{t.today.heading}</strong>
        <p style={{ margin: '0.35em 0 0', fontSize: '1.6rem', fontWeight: 600, fontVariantNumeric: 'tabular-nums' }}>
          {t.today.spent(t.money(today.spentUsd), t.money(today.budgetUsd))}
        </p>
        <Bar ratio={today.ratio} over={today.usedUp} label={t.days.share} />
        <p style={today.usedUp ? warn : line}>{today.usedUp ? t.today.usedUp : t.today.left(t.money(today.leftUsd))}</p>
        <p style={line}>{t.today.calls(today.succeeded, today.failed)}</p>
      </div>
      <div style={box}>
        <strong>{t.switches.heading}</strong>
        <dl style={{ margin: '0.35em 0 0', display: 'grid', gridTemplateColumns: '1fr auto', columnGap: '1em', rowGap: '0.2em' }}>
          {switchRows.map(([label, value, yes, no]) => (
            <Pair key={label} label={label}>
              <span style={{ fontWeight: 600, color: value ? 'var(--theme-success-600)' : 'var(--theme-elevation-600)' }}>{value ? yes : no}</span>
            </Pair>
          ))}
        </dl>
        {switches.modelCalls && !switches.apiKey && <p style={warn}>{t.switches.keyMissing}</p>}
        {switches.localBaseUrl && <p style={{ ...line, ...muted }}>{t.switches.localBaseUrl}</p>}
      </div>
    </div>
  )
}

function Pair({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd style={{ margin: 0, textAlign: 'right' }}>{children}</dd>
    </>
  )
}

/** A thin bar for a share of the daily budget; red once it is used up. */
function Bar({ ratio, over, label }: { ratio: number; over: boolean; label: string }) {
  const percent = Math.round(Math.max(0, Math.min(1, ratio)) * 100)
  return (
    <div
      role="meter"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      style={{ marginTop: '0.4em', height: 6, borderRadius: 3, background: 'var(--theme-elevation-100)', overflow: 'hidden', minWidth: '6rem' }}
    >
      <div style={{ width: `${percent}%`, height: '100%', background: over ? 'var(--theme-error-500)' : 'var(--theme-success-500)' }} />
    </div>
  )
}

function Days({ data, t }: Props) {
  const budget = data.today.budgetUsd
  const total = sumDays(data.days)
  return (
    <section style={section}>
      <h2 style={heading}>{t.days.heading}</h2>
      <div style={scroll}>
        <table style={table}>
          <thead>
            <tr>
              <th style={head}>{t.days.date}</th>
              <th style={numHead}>{t.days.succeeded}</th>
              <th style={numHead}>{t.days.failed}</th>
              <th style={numHead}>{t.days.cost}</th>
              <th style={{ ...head, width: '35%' }}>{t.days.share}</th>
            </tr>
          </thead>
          <tbody>
            {data.days.map((day, index) => {
              const over = budget > 0 ? day.costUsd >= budget : day.costUsd > 0
              const quiet = day.succeeded + day.failed === 0
              return (
                <tr key={day.date} style={quiet ? muted : undefined}>
                  <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                    {day.date}
                    {index === 0 && <span style={muted}> · {t.days.todayMark}</span>}
                  </td>
                  <td style={num}>{t.number(day.succeeded)}</td>
                  <td style={{ ...num, ...(day.failed ? { color: 'var(--theme-error-600)' } : {}) }}>{t.number(day.failed)}</td>
                  <td style={num}>{t.money(day.costUsd)}</td>
                  <td style={cell}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.6em' }}>
                      <div style={{ flex: 1 }}>
                        <Bar ratio={budget > 0 ? day.costUsd / budget : over ? 1 : 0} over={over} label={`${day.date} ${t.days.share}`} />
                      </div>
                      {over && <span style={{ color: 'var(--theme-error-600)', whiteSpace: 'nowrap' }}>{t.days.over}</span>}
                    </div>
                  </td>
                </tr>
              )
            })}
            <tr>
              <th style={head} scope="row">
                {t.days.total}
              </th>
              <td style={{ ...num, fontWeight: 600 }}>{t.number(total.succeeded)}</td>
              <td style={{ ...num, fontWeight: 600 }}>{t.number(total.failed)}</td>
              <td style={{ ...num, fontWeight: 600 }}>{t.money(total.costUsd)}</td>
              <td style={cell} />
            </tr>
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Purposes({ data, t, adminRoute }: Props & { adminRoute: string }) {
  return (
    <section style={section}>
      <h2 style={heading}>{t.purposes.heading}</h2>
      <nav aria-label={t.purposes.heading} style={{ display: 'flex', gap: '1em', marginBottom: 'calc(var(--base) * 0.5)' }}>
        {periods.map((days) =>
          days === data.period ? (
            <strong key={days} aria-current="page">
              {t.purposes.period[days]}
            </strong>
          ) : (
            <a key={days} href={`${adminRoute}/model-usage?days=${days}`}>
              {t.purposes.period[days]}
            </a>
          ),
        )}
      </nav>
      <div style={scroll}>
        <table style={table}>
          <thead>
            <tr>
              <th style={head}>{t.purposes.purpose}</th>
              <th style={head}>{t.purposes.module}</th>
              <th style={head}>{t.purposes.model}</th>
              <th style={numHead}>{t.purposes.succeeded}</th>
              <th style={numHead}>{t.purposes.failed}</th>
              <th style={numHead}>{t.purposes.tokens}</th>
              <th style={numHead}>{t.purposes.cost}</th>
              <th style={numHead}>{t.purposes.average}</th>
            </tr>
          </thead>
          <tbody>
            {data.purposes.map((row) => {
              const quiet = row.succeeded + row.failed === 0
              return (
                <tr key={row.purpose} style={quiet ? muted : undefined}>
                  <td style={cell}>
                    {t.purposes.names[row.purpose] ?? row.purpose} <code style={{ ...muted, fontSize: '0.8rem' }}>{row.purpose}</code>
                    {!row.module && <span style={muted}> {t.purposes.unknown}</span>}
                  </td>
                  <td style={{ ...cell, whiteSpace: 'nowrap' }}>{row.module ? t.purposes.modules[row.module] : '—'}</td>
                  <td style={cell}>
                    {row.model ? <code style={{ fontSize: '0.8rem' }}>{row.model}</code> : '—'}
                    {row.changed && (
                      <span title={t.purposes.changedHint} style={{ marginLeft: '0.4em', color: 'var(--theme-warning-700)', whiteSpace: 'nowrap' }}>
                        {t.purposes.changed}
                      </span>
                    )}
                  </td>
                  <td style={num}>{t.number(row.succeeded)}</td>
                  <td style={{ ...num, ...(row.failed ? { color: 'var(--theme-error-600)' } : {}) }}>{t.number(row.failed)}</td>
                  <td style={num}>
                    {t.number(row.inputTokens)} / {t.number(row.outputTokens)}
                  </td>
                  <td style={num}>{t.money(row.costUsd)}</td>
                  <td style={num}>{row.averageUsd === null ? '—' : t.money(row.averageUsd)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Problems({ data, t, time }: Props & { time: (at: string) => string }) {
  const { items, total } = data.problems
  return (
    <section style={section}>
      <h2 style={heading}>{t.problems.heading}</h2>
      <p style={{ ...muted, margin: '0 0 calc(var(--base) * 0.5)' }}>
        {t.problems.note} {total > 0 && t.problems.count(items.length, total)}
      </p>
      {items.length === 0 ? (
        <p style={{ ...box, margin: 0 }}>{t.problems.none}</p>
      ) : (
        <div style={scroll}>
          <table style={table}>
            <thead>
              <tr>
                <th style={head}>{t.problems.at}</th>
                <th style={head}>{t.problems.purpose}</th>
                <th style={head}>{t.problems.about}</th>
                <th style={head}>{t.problems.attempts}</th>
                <th style={head}>{t.problems.error}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id}>
                  <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                    {time(item.at)}
                    <br />
                    <span style={{ color: item.status === 'failed' ? 'var(--theme-error-600)' : 'var(--theme-warning-700)' }}>
                      {item.status === 'failed' ? t.problems.failed : t.problems.stuck}
                    </span>
                  </td>
                  <td style={cell}>
                    {t.purposes.names[item.purpose] ?? item.purpose}
                    <br />
                    <code style={{ ...muted, fontSize: '0.8rem', whiteSpace: 'nowrap' }}>{item.model}</code>
                  </td>
                  <td style={cell}>{item.about ? <AboutLink about={item.about} t={t} /> : '—'}</td>
                  <td style={{ ...cell, whiteSpace: 'nowrap' }}>
                    {item.attempts}
                    {item.exhausted && (
                      <>
                        <br />
                        <span title={t.problems.exhaustedHint} style={{ color: 'var(--theme-error-600)' }}>
                          {t.problems.exhausted}
                        </span>
                      </>
                    )}
                  </td>
                  <td style={{ ...cell, wordBreak: 'break-word', minWidth: '16rem' }} title={item.fullError || undefined}>
                    {item.error || '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function AboutLink({ about, t }: { about: About; t: UsageText }) {
  const label = `${t.problems.kinds[about.kind]} #${about.id}`
  const title = about.title ? <span style={{ display: 'block' }}>{about.title}</span> : null
  if (!about.href) {
    return (
      <>
        {label}
        {title}
      </>
    )
  }
  if (about.external) {
    return (
      <>
        {label}
        <a href={about.href} target="_blank" rel="noopener noreferrer" style={{ display: 'block' }}>
          {about.title ?? t.problems.original} ↗
        </a>
      </>
    )
  }
  return (
    <a href={about.href}>
      {label}
      {title}
    </a>
  )
}
