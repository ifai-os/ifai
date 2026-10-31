import { useFormatter, useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'

import type { ExternalBoardRow } from '../external/data'
import { externalHref, TABLE_SHOWN, type BoardRef, type ExternalFilters } from '../external/sources'
import { weightsKinds } from '../rules'
import { MakerTile } from './maker-tile'

type ExternalTableProps = {
  board: BoardRef
  rows: ExternalBoardRow[]
  filters: ExternalFilters
}

/** The columns a source fills: a source without intervals, vote counts or licenses has none of those columns. */
type Columns = { interval: boolean; votes: boolean; license: boolean }

function Chip({ href, active, children }: { href: `/${string}`; active: boolean; children: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? 'true' : undefined}
      className={`flex h-8 items-center rounded-pill border px-3.5 text-meta whitespace-nowrap transition-colors ${
        active ? 'border-ink bg-ink text-bg' : 'border-line bg-bg text-ink-2 hover:border-ink-4'
      }`}
    >
      {children}
    </Link>
  )
}

function Head({ columns }: { columns: Columns }) {
  const t = useTranslations('rankings')
  return (
    <thead>
      <tr className="bg-surface text-left text-small text-ink-4">
        <th scope="col" className="w-16 px-4 py-3 font-medium">
          {t('columns.rank')}
        </th>
        <th scope="col" className="px-2 py-3 font-medium">
          {t('columns.model')}
        </th>
        <th scope="col" className={`py-3 text-right font-medium ${columns.interval || columns.votes || columns.license ? 'px-2' : 'pr-4 pl-2'}`}>
          {t('columns.score')}
        </th>
        {columns.interval && (
          <th scope="col" className="px-2 py-3 text-right font-medium">
            {t('columns.interval')}
          </th>
        )}
        {columns.votes && (
          <th scope="col" className="px-2 py-3 text-right font-medium">
            {t('columns.votes')}
          </th>
        )}
        {columns.license && (
          <th scope="col" className="py-3 pr-4 pl-2 font-medium">
            {t('columns.license')}
          </th>
        )}
      </tr>
    </thead>
  )
}

function Line({ row, columns, digits }: { row: ExternalBoardRow; columns: Columns; digits: number }) {
  const t = useTranslations('rankings')
  const format = useFormatter()
  const interval = row.lower !== null && row.upper !== null ? Math.max(1, Math.round((row.upper - row.lower) / 2)) : null
  const last = !(columns.interval || columns.votes || columns.license)
  return (
    <tr className="border-t border-surface-2">
      <td className={`px-4 py-3 font-semibold tabular-nums ${row.rank <= 3 ? 'text-accent-ink' : 'text-ink-4'}`}>{row.rank}</td>
      <td className="px-2 py-3">
        <span className="flex items-center gap-2.5">
          {row.maker && <MakerTile org={row.maker} />}
          <span className="flex min-w-0 flex-col gap-px">
            <span className="font-medium break-words">{row.model}</span>
            {row.maker && <span className="text-small text-ink-4">{row.maker}</span>}
          </span>
        </span>
      </td>
      <td className={`py-3 text-right font-semibold tabular-nums ${last ? 'pr-4 pl-2' : 'px-2'}`}>{row.score.toFixed(digits)}</td>
      {columns.interval && <td className="px-2 py-3 text-right text-ink-4 tabular-nums">{interval === null ? '—' : `±${interval}`}</td>}
      {columns.votes && <td className="px-2 py-3 text-right text-ink-2 tabular-nums">{row.votes === null ? '—' : format.number(row.votes)}</td>}
      {columns.license && (
        <td className="py-3 pr-4 pl-2">
          {row.weights ? (
          <span className="flex flex-col items-start gap-1">
            <span
              className={`rounded-tag px-2 py-0.5 text-small whitespace-nowrap ${
                row.weights === 'open' ? 'bg-success-soft text-success-ink' : 'bg-surface text-ink-2'
              }`}
            >
              {t(`weights.${row.weights}`)}
            </span>
              {row.weights === 'open' && row.license && <span className="text-small text-ink-4">{row.license}</span>}
            </span>
          ) : (
            <span className="text-ink-4">—</span>
          )}
        </td>
      )}
    </tr>
  )
}

/**
 * 「完整榜单」of an outside board: every model of its newest day as the source ranked them, with
 * the columns the source fills, and the license filter in the address (`?weights=open`) when it
 * gives licenses. The first 50 show; the rest open under the table. Scrolls sideways on narrow screens.
 */
export function ExternalTable({ board, rows, filters }: ExternalTableProps) {
  const t = useTranslations('rankings')
  const tx = useTranslations('rankingsExternal')
  const { source, slug } = board
  const shown = rows.filter((row) => !filters.weights || row.weights === filters.weights)
  const columns: Columns = {
    interval: rows.some((row) => row.lower !== null && row.upper !== null),
    votes: rows.some((row) => row.votes !== null),
    license: rows.some((row) => row.weights !== null),
  }
  const span = 3 + Number(columns.interval) + Number(columns.votes) + Number(columns.license)
  const first = shown.slice(0, TABLE_SHOWN)
  const rest = shown.slice(TABLE_SHOWN)
  const table = `w-full border-collapse text-ui ${span > 4 ? 'min-w-170' : 'min-w-120'}`

  return (
    <section aria-labelledby="rankings-board" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 id="rankings-board" className="text-h3 font-semibold">
          {t('fullBoard')}
        </h2>
        {(columns.license || filters.weights) && (
          <nav aria-label={t('licenseFilter')} className="flex flex-wrap gap-2">
            <Chip href={externalHref(source, slug, { weights: null })} active={!filters.weights}>
              {t('allLicenses')}
            </Chip>
            {weightsKinds.map((weights) => (
              <Chip key={weights} href={externalHref(source, slug, { weights })} active={filters.weights === weights}>
                {t(`weights.${weights}`)}
              </Chip>
            ))}
          </nav>
        )}
      </div>

      <div className="overflow-x-auto rounded-card border border-surface-2">
        <table className={table}>
          <Head columns={columns} />
          <tbody>
            {first.map((row, index) => (
              <Line key={`${row.rank}-${index}`} row={row} columns={columns} digits={board.digits} />
            ))}
            {shown.length === 0 && (
              <tr className="border-t border-surface-2">
                <td colSpan={span} className="px-4 py-8 text-center text-meta text-ink-4">
                  {t('noMatches')}{' '}
                  <Link href={externalHref(source, slug)} scroll={false} className="text-link hover:underline">
                    {t('clearFilters')}
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {rest.length > 0 && (
        <details className="group flex flex-col gap-3">
          <summary className="cursor-pointer self-start text-meta text-link hover:underline">{tx('moreModels', { count: rest.length })}</summary>
          <div className="mt-3 overflow-x-auto rounded-card border border-surface-2">
            <table className={table}>
              <Head columns={columns} />
              <tbody>
                {rest.map((row, index) => (
                  <Line key={`${row.rank}-${index}`} row={row} columns={columns} digits={board.digits} />
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  )
}
