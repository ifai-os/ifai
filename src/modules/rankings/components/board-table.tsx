import { useFormatter, useTranslations } from 'next-intl'

import { Icon } from '@/components/icon'
import { Link } from '@/i18n/navigation'

import type { BoardRow } from '../data'
import { boardHref, PROVISIONAL_UNDER, regions, weightsKinds, type BoardFilters } from '../rules'
import { MakerTile } from './maker-tile'
import { useCostFormat } from './cost-format'

type BoardTableProps = {
  /** The arena's slug in addresses: null for the first arena, which lives at /rankings. */
  arena: string | null
  rows: BoardRow[]
  filters: BoardFilters
}

function Chip({ href, active, children }: { href: `/${string}`; active: boolean; children: string }) {
  return (
    <Link
      href={href}
      scroll={false}
      aria-current={active ? 'true' : undefined}
      className={`flex h-8 items-center rounded-pill border px-3.5 text-meta whitespace-nowrap transition-colors ${
        active ? 'border-ink bg-ink text-white' : 'border-line bg-bg text-ink-2 hover:border-ink-4'
      }`}
    >
      {children}
    </Link>
  )
}

/**
 * 「完整榜单」: every model of the latest snapshot, placed ones first, with the license and region
 * filters in the address (`?weights=open&region=cn`). Scrolls sideways on narrow screens.
 */
export function BoardTable({ arena, rows, filters }: BoardTableProps) {
  const t = useTranslations('rankings')
  const format = useFormatter()
  const cost = useCostFormat()
  const shown = rows.filter((row) => (!filters.weights || row.weights === filters.weights) && (!filters.region || row.region === filters.region))
  // Only the regions the board has, and always the one picked, so it can be unpicked.
  const regionChoices = regions.filter((region) => region === filters.region || rows.some((row) => row.region === region))

  return (
    <section aria-labelledby="rankings-board" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <h2 id="rankings-board" className="text-h3 font-semibold">
          {t('fullBoard')}
        </h2>
        <div className="flex flex-wrap gap-2">
          <nav aria-label={t('licenseFilter')} className="flex flex-wrap gap-2">
            <Chip href={boardHref(arena, { ...filters, weights: null })} active={!filters.weights}>
              {t('allLicenses')}
            </Chip>
            {weightsKinds.map((weights) => (
              <Chip key={weights} href={boardHref(arena, { ...filters, weights })} active={filters.weights === weights}>
                {t(`weights.${weights}`)}
              </Chip>
            ))}
          </nav>
          {regionChoices.length > 1 && (
            <>
              <span aria-hidden="true" className="mx-1 my-1 hidden w-px bg-line md:block" />
              <nav aria-label={t('regionFilter')} className="flex flex-wrap gap-2">
                <Chip href={boardHref(arena, { ...filters, region: null })} active={!filters.region}>
                  {t('allRegions')}
                </Chip>
                {regionChoices.map((region) => (
                  <Chip key={region} href={boardHref(arena, { ...filters, region })} active={filters.region === region}>
                    {t(`regions.${region}`)}
                  </Chip>
                ))}
              </nav>
            </>
          )}
        </div>
      </div>

      <div className="overflow-x-auto rounded-card border border-surface-2">
        <table className="w-full min-w-190 border-collapse text-ui">
          <thead>
            <tr className="bg-surface text-left text-small text-ink-4">
              <th scope="col" className="w-16 px-4 py-3 font-medium">
                {t('columns.rank')}
              </th>
              <th scope="col" className="px-2 py-3 font-medium">
                {t('columns.model')}
              </th>
              <th scope="col" className="px-2 py-3 text-right font-medium">
                {t('columns.score')}
              </th>
              <th scope="col" className="px-2 py-3 text-right font-medium">
                {t('columns.interval')}
              </th>
              <th scope="col" className="px-2 py-3 text-right font-medium">
                {t('columns.votes')}
              </th>
              <th scope="col" className="px-2 py-3 font-medium">
                {t('columns.license')}
              </th>
              <th scope="col" className="py-3 pr-4 pl-2 text-right font-medium">
                {t('columns.cost')}
              </th>
            </tr>
          </thead>
          <tbody>
            {shown.map((row) => (
              <tr key={row.modelId} className="border-t border-surface-2">
                <td className={`px-4 py-3 font-semibold tabular-nums ${row.rank !== null && row.rank <= 3 ? 'text-accent' : 'text-ink-4'}`}>
                  {row.rank ?? <span className="text-small font-normal">{t('provisional')}</span>}
                </td>
                <td className="px-2 py-3">
                  <span className="flex items-center gap-2.5">
                    <MakerTile org={row.org} />
                    <span className="flex min-w-0 flex-col gap-px">
                      <span className="font-medium">{row.name}</span>
                      <span className="text-small text-ink-4">{row.org}</span>
                    </span>
                  </span>
                </td>
                <td className="px-2 py-3 text-right font-semibold tabular-nums">{Math.round(row.score)}</td>
                <td className="px-2 py-3 text-right text-ink-4 tabular-nums">±{Math.max(1, Math.round((row.upper - row.lower) / 2))}</td>
                <td className="px-2 py-3 text-right text-ink-2 tabular-nums">{format.number(row.votes)}</td>
                <td className="px-2 py-3">
                  <span className="flex flex-col items-start gap-1">
                    <span
                      className={`rounded-tag px-2 py-0.5 text-small whitespace-nowrap ${
                        row.weights === 'open' ? 'bg-success-soft text-success-ink' : 'bg-surface text-ink-2'
                      }`}
                    >
                      {t(`weights.${row.weights}`)}
                    </span>
                    {row.license &&
                      (row.licenseUrl ? (
                        <a
                          href={row.licenseUrl}
                          target="_blank"
                          rel="noopener noreferrer nofollow"
                          className="inline-flex items-center gap-0.5 text-small text-ink-4 hover:text-link"
                        >
                          {row.license}
                          <Icon name="external" size={12} />
                        </a>
                      ) : (
                        <span className="text-small text-ink-4">{row.license}</span>
                      ))}
                  </span>
                </td>
                <td className="py-3 pr-4 pl-2 text-right tabular-nums">{row.costUsd ? cost(row.costUsd) : '—'}</td>
              </tr>
            ))}
            {shown.length === 0 && (
              <tr className="border-t border-surface-2">
                <td colSpan={7} className="px-4 py-8 text-center text-meta text-ink-4">
                  {t('noMatches')}{' '}
                  <Link href={boardHref(arena)} scroll={false} className="text-link hover:underline">
                    {t('clearFilters')}
                  </Link>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <p className="text-small text-ink-4">{t('boardNote', { votes: PROVISIONAL_UNDER })}</p>
    </section>
  )
}
