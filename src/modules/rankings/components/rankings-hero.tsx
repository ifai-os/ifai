import { useFormatter, useTranslations } from 'next-intl'

import { ButtonLink } from '@/components/button'

import type { Newcomer } from '../data'
import { MakerTile } from './maker-tile'

type RankingsHeroProps = {
  /** Counted votes in the arena now. */
  votes: number
  voteHref: `/${string}`
  newcomers: Newcomer[]
}

/**
 * The page heading: what the rankings are, the counted votes and「参与盲测投票」; beside it
 *「新上榜」when the latest week placed a model for the first time (otherwise the heading spans the row).
 */
export function RankingsHero({ votes, voteHref, newcomers }: RankingsHeroProps) {
  const t = useTranslations('rankings')
  const format = useFormatter()

  return (
    <section className="flex flex-wrap gap-4">
      <div className="flex min-w-0 flex-[3_1_440px] flex-col justify-between gap-6 rounded-hero border border-surface-2 bg-surface p-6 md:p-8">
        <div className="flex flex-col gap-2.5">
          <p className="text-small tracking-[0.04em] text-ink-4">{t('eyebrow')}</p>
          <h1 className="text-h1 md:text-display">{t('headline')}</h1>
          <p className="max-w-130 text-body text-ink-2">{t('intro')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
          <p className="flex items-baseline gap-2">
            <span aria-hidden="true" className="size-2 self-center rounded-pill bg-up" />
            <span className="text-h2 tabular-nums">{format.number(votes)}</span>
            <span className="text-meta text-ink-4">{t('votesLabel', { count: votes })}</span>
          </p>
          <ButtonLink href={voteHref}>{t('voteCta')}</ButtonLink>
        </div>
      </div>

      {newcomers.length > 0 && (
        <section
          aria-labelledby="rankings-newcomers"
          className="flex min-w-0 flex-[2_1_320px] flex-col gap-1 rounded-hero border border-surface-2 bg-surface px-6 py-5.5"
        >
          <h2 id="rankings-newcomers" className="pb-2 text-body font-medium">
            {t('newcomers')}
          </h2>
          <ul className="flex flex-col">
            {newcomers.map((model) => (
              <li key={model.modelId} className="flex items-center gap-3 border-t border-surface-2 py-3">
                <MakerTile org={model.org} size="md" />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="truncate text-body font-medium">{model.name}</span>
                  <span className="text-small text-ink-4">
                    {t.rich('newcomerRank', {
                      rank: model.rank ?? 0,
                      place: (chunks) => <b className="font-semibold text-accent-ink">{chunks}</b>,
                    })}
                    {model.org && ` · ${model.org}`}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </section>
  )
}
