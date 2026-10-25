import { useTranslations } from 'next-intl'

import type { BoardRow } from '../data'
import { MakerDot } from './maker-tile'

/** Bar length: 40% for the lowest of the ten, the full width for the first. */
function barWidth(score: number, low: number, high: number): string {
  return `${high > low ? 40 + ((score - low) / (high - low)) * 60 : 100}%`
}

/** 「<赛道> · 前 10」: the placed models as bars by score, the first black, the top three's places red. */
export function TopTen({ arenaName, rows }: { arenaName: string; rows: BoardRow[] }) {
  const t = useTranslations('rankings')
  const scores = rows.map((row) => row.score)
  const low = Math.min(...scores)
  const high = Math.max(...scores)

  return (
    <section
      aria-labelledby="rankings-top"
      className="flex min-w-0 flex-[1_1_460px] flex-col gap-3.5 rounded-hero border border-surface-2 px-5 py-5.5 md:px-6"
    >
      <div className="flex items-baseline justify-between gap-3">
        <h2 id="rankings-top" className="text-title">
          {t('topTen', { arena: arenaName })}
        </h2>
        <span className="text-small text-ink-4">{t('higherIsBetter')}</span>
      </div>
      <ol className="flex flex-col gap-3.5">
        {rows.map((row) => {
          const first = row.rank === 1
          return (
            <li key={row.modelId} className="grid grid-cols-[22px_minmax(0,1fr)_48px] items-center gap-2.5">
              <span className={`text-right text-meta font-semibold tabular-nums ${(row.rank ?? 99) <= 3 ? 'text-accent-ink' : 'text-ink-4'}`}>
                {row.rank}
              </span>
              <span className="relative h-8 overflow-hidden rounded-thumb bg-surface">
                <span
                  aria-hidden="true"
                  className={`absolute inset-y-0 left-0 rounded-thumb ${first ? 'bg-ink' : 'bg-line'}`}
                  style={{ width: barWidth(row.score, low, high) }}
                />
                <span className={`relative flex h-8 items-center gap-2 px-2.5 text-meta font-medium ${first ? 'text-bg' : 'text-ink'}`}>
                  <MakerDot org={row.org} />
                  <span className="truncate">{row.name}</span>
                </span>
              </span>
              <span className="text-right text-meta font-medium tabular-nums">{Math.round(row.score)}</span>
            </li>
          )
        })}
      </ol>
    </section>
  )
}
