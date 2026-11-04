import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
// eslint-disable-next-line no-restricted-imports -- admin routes have no locale prefix
import { redirect } from 'next/navigation'
import type { AdminViewServerProps } from 'payload'
import type { CSSProperties } from 'react'

import { isLaunched } from '@/config/site'
import { agentWritesEnabled } from '@/lib/switches'

import { adminAgents, type AdminAgent } from '../admin'
import { adminFiltersFrom, type AdminAgentFilters } from '../rules'
import { AgentActions } from './agent-actions'
import { agentsAdminText, type AgentsAdminText } from './text'

const section: CSSProperties = { marginTop: 'calc(var(--base) * 1.5)' }
const muted: CSSProperties = { color: 'var(--theme-elevation-600)' }
const small: CSSProperties = { ...muted, display: 'block', fontSize: '0.8rem' }
const table: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }
const cell: CSSProperties = { padding: '0.45em 0.6em', borderBottom: '1px solid var(--theme-elevation-100)', textAlign: 'left', verticalAlign: 'top' }
const head: CSSProperties = { ...cell, fontWeight: 600, color: 'var(--theme-elevation-700)', whiteSpace: 'nowrap' }
const scroll: CSSProperties = { overflowX: 'auto' }
const off: CSSProperties = { color: 'var(--theme-error-500)', fontWeight: 600 }

/** This page's address with some filters changed; a new filter starts again at page 1. */
function hrefWith(base: string, filters: AdminAgentFilters, change: Partial<AdminAgentFilters>): string {
  const next = { ...filters, ...('page' in change ? {} : { page: 1 }), ...change }
  const query = new URLSearchParams()
  if (next.agent) query.set('agent', String(next.agent))
  if (next.disabled) query.set('disabled', '1')
  if (next.page > 1) query.set('page', String(next.page))
  const text = query.toString()
  return text ? `${base}?${text}` : base
}

/**
 * /admin/agents (docs/specs/agents.md「后台」): every member's agents, newest first, with their
 * owners, keys and today's requests; turn one off or back on. `?agent=12` (from the admin log)
 * shows one. Like the other root views, it sends visitors to the login page and wraps itself in
 * Payload's template.
 */
export async function AgentsView({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req, permissions, locale, visibleEntities } = initPageResult
  const adminRoute = req.payload.config.routes.admin
  const base = `${adminRoute}/agents`
  const filters = adminFiltersFrom(searchParams)
  if (!req.user || !permissions.canAccessAdmin) {
    const back = hrefWith('/agents', filters, { page: filters.page })
    redirect(`${adminRoute}${req.payload.config.admin.routes.login}?redirect=${encodeURIComponent(back)}`)
  }

  const t = agentsAdminText(req.i18n.language)
  const data = await adminAgents(req.payload, filters, new Date())
  const zh = req.i18n.language.startsWith('zh')
  const time = (at: string) =>
    new Date(at).toLocaleString(zh ? 'zh-CN' : 'en-GB', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  const one = filters.agent ? data.agents[0] : undefined
  const circles = isLaunched('circles')

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
        <p style={{ ...muted, margin: 0, maxWidth: '60rem' }}>{t.intro}</p>

        <p style={{ ...section, marginBottom: 0 }}>
          {t.summary(t.number(data.summary.agents), data.summary.disabled, t.number(data.summary.agentRequests), t.number(data.summary.visitorRequests))}
        </p>
        <p style={{ ...muted, margin: '0.25em 0 0' }}>{t.writing(agentWritesEnabled())}</p>

        <nav style={{ display: 'flex', flexWrap: 'wrap', gap: '1em', margin: 'var(--base) 0 0' }}>
          {filters.agent ? (
            <>
              <strong>{t.filters.one(one?.name ?? `#${filters.agent}`)}</strong>
              <a href={hrefWith(base, filters, { agent: null })}>{t.filters.showAll}</a>
            </>
          ) : (
            <>
              {filters.disabled ? <a href={hrefWith(base, filters, { disabled: false })}>{t.filters.all}</a> : <strong>{t.filters.all}</strong>}
              {filters.disabled ? <strong>{t.filters.disabled}</strong> : <a href={hrefWith(base, filters, { disabled: true })}>{t.filters.disabled}</a>}
            </>
          )}
        </nav>

        <section style={{ ...section, marginTop: 'var(--base)' }}>
          {data.agents.length === 0 ? (
            <p style={{ margin: 0 }}>{filters.agent || filters.disabled ? t.noneFiltered : t.none}</p>
          ) : (
            <div style={scroll}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={head}>{t.columns.agent}</th>
                    <th style={head}>{t.columns.owner}</th>
                    <th style={head}>{t.columns.keys}</th>
                    <th style={head}>{t.columns.lastUsed}</th>
                    <th style={head}>{t.columns.today}</th>
                    {circles && <th style={head}>{t.columns.writes}</th>}
                    <th style={head}>{t.columns.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.agents.map((agent) => (
                    <Row key={agent.id} agent={agent} t={t} time={time} circles={circles} logHref={`${adminRoute}/admin-log?collection=agents&doc=${agent.id}`} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {data.pages > 1 && (
            <nav style={{ display: 'flex', gap: '1em', alignItems: 'center', marginTop: 'var(--base)' }}>
              {filters.page > 1 ? <a href={hrefWith(base, filters, { page: filters.page - 1 })}>{t.previous}</a> : <span style={muted}>{t.previous}</span>}
              <span>{t.page(filters.page, data.pages)}</span>
              {filters.page < data.pages ? <a href={hrefWith(base, filters, { page: filters.page + 1 })}>{t.next}</a> : <span style={muted}>{t.next}</span>}
            </nav>
          )}
        </section>
      </Gutter>
    </DefaultTemplate>
  )
}

function Row({
  agent,
  t,
  time,
  circles,
  logHref,
}: {
  agent: AdminAgent
  t: AgentsAdminText
  time: (at: string) => string
  circles: boolean
  logHref: string
}) {
  return (
    <tr>
      <td style={{ ...cell, minWidth: '12rem' }}>
        <strong>{agent.name}</strong>
        {agent.about && <span style={{ display: 'block' }}>{agent.about}</span>}
        <span style={small}>{t.created(time(agent.createdAt))}</span>
      </td>
      <td style={cell}>
        {agent.owner.name}
        <span style={small}>{agent.owner.email}</span>
      </td>
      <td style={cell}>{t.keys(agent.keys.working, agent.keys.total, agent.keys.write)}</td>
      <td style={{ ...cell, whiteSpace: 'nowrap' }}>{agent.lastUsedAt ? time(agent.lastUsedAt) : <span style={muted}>{t.never}</span>}</td>
      <td style={cell}>{t.number(agent.requestsToday)}</td>
      {circles && <td style={cell}>{t.writes(agent.writesToday.posts, agent.writesToday.reactions)}</td>}
      <td style={{ ...cell, minWidth: '12rem' }}>
        {agent.disabled ? (
          <>
            <span style={off}>{t.disabledAt(time(agent.disabled.at))}</span>
            <span style={{ display: 'block' }}>{agent.disabled.reason ? t.reason(agent.disabled.reason) : <span style={muted}>{t.noReason}</span>}</span>
          </>
        ) : (
          <span>{t.active}</span>
        )}
        <div style={{ marginTop: '0.5em' }}>
          <AgentActions id={agent.id} disabled={agent.disabled !== null} />
        </div>
        <a href={logHref} style={{ display: 'block', fontSize: '0.8rem', marginTop: '0.4em' }}>
          {t.history}
        </a>
      </td>
    </tr>
  )
}
