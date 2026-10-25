import { useTranslations } from 'next-intl'

import { Link } from '@/i18n/navigation'

import type { BoardRow } from '../data'

/** 「模型排行」on the home page: the first arena's top places and scores, the top three's places red. */
export function HomeRankings({ rows }: { rows: BoardRow[] }) {
  const t = useTranslations('home')

  return (
    <section
      aria-labelledby="home-rankings"
      className="flex min-w-0 flex-[2_1_320px] flex-col gap-1 rounded-hero border border-surface-2 bg-surface px-6 py-5.5"
    >
      <div className="flex items-baseline justify-between gap-4 pb-2">
        <h2 id="home-rankings" className="text-h3 font-semibold">
          {t('modelTop')}
        </h2>
        <Link href="/rankings" className="text-ui text-ink-4 hover:text-accent-ink">
          {t('viewAll')} ›
        </Link>
      </div>
      <ol className="flex flex-col">
        {rows.map((row) => (
          <li
            key={row.modelId}
            className="grid grid-cols-[24px_minmax(0,1fr)_auto] items-center gap-2.5 border-t border-line py-2.25 text-ui"
          >
            <span className={`font-semibold tabular-nums ${(row.rank ?? 99) <= 3 ? 'text-accent-ink' : 'text-ink-4'}`}>{row.rank}</span>
            <span className="truncate font-medium">{row.name}</span>
            <span className="text-ink-2 tabular-nums">{Math.round(row.score)}</span>
          </li>
        ))}
      </ol>
    </section>
  )
}
