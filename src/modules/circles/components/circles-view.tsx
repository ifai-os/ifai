'use client'

import { useTranslations } from 'next-intl'

import type { AuthProviders } from '@/lib/auth/providers'

import type { CircleView, CirclesOverview } from '../rules'
import { CircleCards } from './circle-cards'
import { CirclesProvider, useCircles } from './circles-provider'
import { Composer } from './composer'
import { Feed } from './feed'
import { CirclesSidebar } from './sidebar'

type CirclesViewProps = {
  circles: CircleView[]
  overview: CirclesOverview
  signIn: AuthProviders
}

/**
 * The circles page (「IFAI 圈子」board): the header, the circles' cards, then the post form and the
 * feed beside「我的圈子」. 1080px wide as on the board, so the cards line up with the two columns.
 */
export function CirclesView({ circles, overview, signIn }: CirclesViewProps) {
  return (
    <CirclesProvider circles={circles} overview={overview} signIn={signIn}>
      <main id="main" className="mx-auto flex w-full max-w-[1080px] flex-col gap-7 px-4 pt-8 pb-24">
        <Header />
        <CircleCards />
        <div className="flex flex-wrap items-start gap-x-10 gap-y-8">
          <div className="flex min-w-0 flex-[999_1_520px] flex-col gap-4 md:max-w-read">
            <Composer />
            <Feed />
          </div>
          <CirclesSidebar />
        </div>
      </main>
    </CirclesProvider>
  )
}

function Header() {
  const t = useTranslations('circles')
  const { overview } = useCircles()
  return (
    <section className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-wrap items-baseline gap-x-3.5 gap-y-1">
        <h1 className="text-h1">{t('title')}</h1>
        <p className="text-ui text-ink-4">{t('tagline')}</p>
      </div>
      {overview.postersToday > 0 && (
        <p className="text-meta text-ink-4">
          {t.rich('postersToday', {
            count: overview.postersToday,
            b: (chunks) => <b className="font-medium text-ink">{chunks}</b>,
          })}
        </p>
      )}
    </section>
  )
}
