import { DefaultTemplate } from '@payloadcms/next/templates'
import { Gutter } from '@payloadcms/ui'
// eslint-disable-next-line no-restricted-imports -- admin routes have no locale prefix
import { redirect } from 'next/navigation'
import type { AdminViewServerProps, Payload } from 'payload'
import type { CSSProperties, ReactNode } from 'react'

import type { LogDetail } from '@/lib/admin-log/rules'

import { loadAdminLog, type LogRow } from './data'
import { filtersFrom, hrefWith, logKinds, type LogFilters } from './rules'
import { logText, type LogText } from './text'

const section: CSSProperties = { marginTop: 'calc(var(--base) * 1.5)' }
const muted: CSSProperties = { color: 'var(--theme-elevation-600)' }
const table: CSSProperties = { width: '100%', borderCollapse: 'collapse', fontSize: '0.9rem' }
const cell: CSSProperties = { padding: '0.45em 0.6em', borderBottom: '1px solid var(--theme-elevation-100)', textAlign: 'left', verticalAlign: 'top' }
const head: CSSProperties = { ...cell, fontWeight: 600, color: 'var(--theme-elevation-700)', whiteSpace: 'nowrap' }
const scroll: CSSProperties = { overflowX: 'auto' }
const code: CSSProperties = { fontSize: '0.8rem' }
const field: CSSProperties = { display: 'flex', flexDirection: 'column', gap: '0.25em', fontSize: '0.85rem' }
const select: CSSProperties = {
  font: 'inherit',
  padding: '0.35em 0.5em',
  border: '1px solid var(--theme-elevation-250)',
  borderRadius: 'var(--style-radius-s)',
  background: 'var(--theme-input-bg)',
  color: 'var(--theme-text)',
  minWidth: '10rem',
}

type Label = string | Record<string, string> | ((...args: never[]) => unknown) | false | undefined

/** A Payload label ({ en, zh } or a plain string) in the admin's language. */
function labelIn(label: Label, language: string, fallback: string): string {
  if (typeof label === 'string') return label
  if (label && typeof label === 'object') return label[language] ?? label.zh ?? label.en ?? fallback
  return fallback
}

type Names = {
  collection: (slug: string | null) => string
  field: (slug: string | null, name: string) => string
}

function namesFor(payload: Payload, language: string): Names {
  const lang = language.startsWith('zh') ? 'zh' : 'en'
  return {
    collection: (slug) => {
      if (!slug) return '—'
      const config = payload.collections[slug as keyof typeof payload.collections]?.config
      return config ? labelIn(config.labels?.plural as Label, lang, slug) : slug
    },
    field: (slug, name) => {
      const config = slug ? payload.collections[slug as keyof typeof payload.collections]?.config : undefined
      const found = config?.flattenedFields.find((item) => item.name === name) as { label?: Label } | undefined
      return labelIn(found?.label, lang, name)
    },
  }
}

/**
 * /admin/admin-log (docs/specs/foundation.md「后台 · 操作记录」): who saved, created, deleted,
 * pressed a module's button or signed in, newest first, filtered by content, admin and action;
 * `?collection=apps&doc=12` shows one document's history. Payload treats custom root views as
 * public and leaves out its template, so the view sends visitors who are not signed in to the
 * login page itself and wraps itself in the template.
 */
export async function AdminLogView({ initPageResult, params, searchParams }: AdminViewServerProps) {
  const { req, permissions, locale, visibleEntities } = initPageResult
  const adminRoute = req.payload.config.routes.admin
  const base = `${adminRoute}/admin-log`
  const slugs = req.payload.config.collections.map((collection) => collection.slug)
  const filters = filtersFrom(searchParams, slugs)
  if (!req.user || !permissions.canAccessAdmin) {
    const back = hrefWith('/admin-log', filters, { page: filters.page })
    redirect(`${adminRoute}${req.payload.config.admin.routes.login}?redirect=${encodeURIComponent(back)}`)
  }

  const t = logText(req.i18n.language)
  const names = namesFor(req.payload, req.i18n.language)
  const data = await loadAdminLog(filters)
  const zh = req.i18n.language.startsWith('zh')
  const time = (at: string) =>
    new Date(at).toLocaleString(zh ? 'zh-CN' : 'en-GB', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    })
  const filtered = Boolean(filters.collection || filters.admin || filters.kind)
  const docLabel = filters.doc ? (data.rows.find((row) => row.docTitle)?.docTitle ?? `#${filters.doc}`) : null

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

        <form method="get" action={base} style={{ ...section, display: 'flex', flexWrap: 'wrap', gap: 'var(--base)', alignItems: 'flex-end' }}>
          <label style={field}>
            {t.filters.collection}
            <select name="collection" defaultValue={filters.collection ?? ''} style={select}>
              <option value="">{t.filters.all}</option>
              {slugs.map((slug) => (
                <option key={slug} value={slug}>
                  {names.collection(slug)}
                </option>
              ))}
            </select>
          </label>
          {filters.doc && <input type="hidden" name="doc" value={filters.doc} />}
          <label style={field}>
            {t.filters.admin}
            <select name="admin" defaultValue={filters.admin ?? ''} style={select}>
              <option value="">{t.filters.all}</option>
              {data.admins.map((admin) => (
                <option key={admin.id} value={String(admin.id)}>
                  {admin.email}
                </option>
              ))}
            </select>
          </label>
          <label style={field}>
            {t.filters.kind}
            <select name="kind" defaultValue={filters.kind ?? ''} style={select}>
              <option value="">{t.filters.all}</option>
              {logKinds.map((kind) => (
                <option key={kind} value={kind}>
                  {t.kinds[kind]}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="btn btn--style-secondary btn--size-small" style={{ margin: 0 }}>
            {t.filters.apply}
          </button>
          {filtered && <a href={base}>{t.filters.clear}</a>}
        </form>

        {filters.doc && docLabel && (
          <p style={{ margin: 'var(--base) 0 0' }}>
            <strong>{t.filters.onlyDoc(`${names.collection(filters.collection)} · ${docLabel}`)}</strong>{' '}
            <a href={hrefWith(base, filters, { doc: null })}>{t.filters.showAll}</a>
          </p>
        )}

        <section style={section}>
          <p style={{ ...muted, margin: '0 0 calc(var(--base) * 0.5)' }}>{t.total(data.rows.length, data.total)}</p>
          {data.rows.length === 0 ? (
            <p style={{ margin: 0 }}>{filtered ? t.noneFiltered : t.none}</p>
          ) : (
            <div style={scroll}>
              <table style={table}>
                <thead>
                  <tr>
                    <th style={head}>{t.columns.at}</th>
                    <th style={head}>{t.columns.admin}</th>
                    <th style={head}>{t.columns.what}</th>
                    <th style={head}>{t.columns.target}</th>
                    <th style={head}>{t.columns.detail}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.rows.map((row) => (
                    <Row key={row.id} row={row} t={t} names={names} time={time} adminRoute={adminRoute} base={base} filters={filters} />
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

type RowProps = {
  row: LogRow
  t: LogText
  names: Names
  time: (at: string) => string
  adminRoute: string
  base: string
  filters: LogFilters
}

function Row({ row, t, names, time, adminRoute, base, filters }: RowProps) {
  const what = row.kind === 'action' && row.action ? (t.actions[row.action] ?? row.action) : t.kinds[row.kind]
  return (
    <tr>
      <td style={{ ...cell, whiteSpace: 'nowrap' }}>{time(row.at)}</td>
      <td style={cell}>{row.adminEmail ?? (row.adminId ? `#${row.adminId}` : '—')}</td>
      <td style={cell}>
        {what}
        {row.kind === 'action' && row.action && !t.actions[row.action] && <code style={{ ...code, ...muted, display: 'block' }}>{row.action}</code>}
      </td>
      <td style={cell}>
        <Target row={row} t={t} names={names} adminRoute={adminRoute} />
        {row.collection && row.docId && filters.doc !== row.docId && (
          <a href={hrefWith(base, filters, { collection: row.collection, doc: row.docId, kind: null, admin: null })} style={{ display: 'block', fontSize: '0.8rem' }}>
            {t.history}
          </a>
        )}
      </td>
      <td style={{ ...cell, minWidth: '14rem' }}>
        <Detail detail={row.detail} collection={row.collection} t={t} names={names} />
      </td>
    </tr>
  )
}

function Target({ row, t, names, adminRoute }: Omit<RowProps, 'time' | 'base' | 'filters'>) {
  const collection = names.collection(row.collection)
  if (!row.docId) return <>{row.collection ? collection : '—'}</>
  const title = row.docTitle ?? `#${row.docId}`
  const gone = row.kind === 'delete'
  return (
    <>
      <span style={{ ...muted, display: 'block', fontSize: '0.8rem' }}>{collection}</span>
      {gone ? (
        <span>
          {title} <span style={muted}>({t.deleted})</span>
        </span>
      ) : (
        <a href={`${adminRoute}/collections/${row.collection}/${row.docId}`}>{title}</a>
      )}
    </>
  )
}

function Line({ label, children, t }: { label: string; children: ReactNode; t: LogText }) {
  return (
    <div>
      <span style={muted}>
        {label}
        {t.colon}
      </span>
      {children}
    </div>
  )
}

function Detail({ detail, collection, t, names }: { detail: LogDetail; collection: string | null; t: LogText; names: Names }) {
  const lines: ReactNode[] = []
  if (detail.count) lines.push(<div key="count">{t.detail.count(detail.count)}</div>)
  if (detail.status?.length) {
    lines.push(
      <Line t={t} key="status" label={t.detail.status}>
        {detail.status.map((change) => (
          <span key={change.field} style={{ marginRight: '0.6em' }}>
            <code style={code}>{change.from ?? '—'}</code> → <code style={code}>{change.to ?? '—'}</code>
          </span>
        ))}
      </Line>,
    )
  }
  // A status change already says itself above.
  const fields = (detail.fields ?? []).filter((name) => !detail.status?.some((change) => change.field === name))
  if (fields.length) {
    lines.push(
      <Line t={t} key="fields" label={t.detail.fields}>
        {fields.map((name) => names.field(collection, name)).join(t.list)}
      </Line>,
    )
  }
  if (detail.locales?.length) lines.push(<Line t={t} key="locales" label={t.detail.locales}>{detail.locales.join(t.list)}</Line>)
  const pairs = (record: Record<string, unknown>) =>
    Object.entries(record)
      .map(([key, value]) => `${key} ${Array.isArray(value) ? value.join(', ') : String(value)}`)
      .join(' · ')
  if (detail.params && Object.keys(detail.params).length) lines.push(<Line t={t} key="params" label={t.detail.params}>{pairs(detail.params)}</Line>)
  if (detail.body && Object.keys(detail.body).length) lines.push(<Line t={t} key="body" label={t.detail.body}>{pairs(detail.body)}</Line>)
  if (detail.omitted?.length) lines.push(<Line t={t} key="omitted" label={t.detail.omitted}>{detail.omitted.join(t.list)}</Line>)
  return lines.length ? <>{lines}</> : <span style={muted}>—</span>
}
