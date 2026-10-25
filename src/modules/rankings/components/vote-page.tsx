import { getTranslations } from 'next-intl/server'

import { authProviders } from '@/lib/auth/providers'

import type { PublicArena } from '../data'
import { boardHref, voteHref } from '../rules'
import { ArenaTabs } from './arena-tabs'
import { BlindVote } from './blind-vote'

type VotePageProps = {
  arena: PublicArena
  arenas: PublicArena[]
}

/** 盲测投票 (docs/specs/rankings.md「页面与路由」): the heading, the arena tabs and the vote itself. */
export async function VotePage({ arena, arenas }: VotePageProps) {
  const t = await getTranslations('rankingsVote')
  const slugOf = (item: PublicArena) => (item.slug === arenas[0]?.slug ? null : item.slug)

  return (
    <main id="main" className="mx-auto flex w-full max-w-content flex-col gap-5 px-4 pt-5 pb-10 md:gap-6 md:pt-8">
      <header className="flex flex-col gap-1.5">
        <h1 className="text-h2 md:text-h1">{t('title')}</h1>
        <p className="max-w-160 text-ui text-ink-3">{t('intro')}</p>
      </header>
      <ArenaTabs arenas={arenas} current={arena.slug} hrefOf={(item) => voteHref(slugOf(item))} />
      <BlindVote key={arena.slug} arena={arena.slug} boardHref={boardHref(slugOf(arena))} signIn={authProviders()} />
    </main>
  )
}
