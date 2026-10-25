'use client'

import { useTranslations } from 'next-intl'
import type { ReactNode } from 'react'

import { buttonClass } from '@/components/button'
import { Icon } from '@/components/icon'
import { StateShell } from '@/components/states/state-shell'
import { Link } from '@/i18n/navigation'
import type { AuthProviders } from '@/lib/auth/providers'
import { CirclesSessionProvider } from '@/modules/circles/components/circles-session'
import { PersonAvatar } from '@/modules/circles/components/person-avatar'
import type { CircleView } from '@/modules/circles/rules'

import type { PeoplePageData } from '../public'
import { peoplePath, peopleSides, profilePath, type PeopleSide, type PersonRow } from '../rules'
import { FollowButton, FollowsProvider, useFollowers } from './follows'
import { ProfileLink } from './profile-link'

type PeopleListProps = {
  page: PeoplePageData
  side: PeopleSide
  /** The page's heading, for screen readers:「林栖的关注者」. */
  title: string
  circles: CircleView[]
  signIn: AuthProviders
}

/**
 * 「关注者」and「正在关注」(docs/specs/circles.md「/u/[handle]」): back to the member's page, the two
 * lists as tabs, then 30 people a page, the latest follow first, each with「关注」unless it is the reader
 * or one of the two blocked the other (rule 23).
 */
export function PeopleList({ page, side, title, circles, signIn }: PeopleListProps) {
  const t = useTranslations('profiles')
  const circlesT = useTranslations('circles')
  const { profile } = page
  const name = profile.name || circlesT('anonymous')
  return (
    <CirclesSessionProvider circles={circles} signIn={signIn} afterSignIn={t('afterSignIn')}>
      <FollowsProvider>
        <main id="main" className="mx-auto flex w-full max-w-[720px] flex-col px-4 pt-8 pb-24 md:pt-12">
          <h1 className="sr-only">{title}</h1>
          <Link href={profilePath(profile.handle)} className="flex items-center gap-1.5 self-start text-ui font-medium text-ink-2 hover:text-ink">
            <Icon name="arrowLeft" size={18} />
            <span className="wrap-anywhere">{name}</span>
          </Link>
          <PeopleTabs page={page} side={side} />
          {page.people.length === 0 ? (
            <div className="pt-6">
              <StateShell icon="user" title={t(side === 'followers' ? 'noFollowers' : 'noFollowing')} />
            </div>
          ) : (
            <ul className="flex flex-col">
              {page.people.map((person) => (
                <PersonItem key={person.handle} person={person} />
              ))}
            </ul>
          )}
          {page.next && (
            <div className="flex justify-center pt-7">
              <Link
                href={{ pathname: peoplePath(profile.handle, side), query: { before: String(page.next) } }}
                scroll={false}
                className={buttonClass('secondary')}
              >
                {t('morePeople')}
              </Link>
            </div>
          )}
        </main>
      </FollowsProvider>
    </CirclesSessionProvider>
  )
}

function PeopleTabs({ page, side }: { page: PeoplePageData; side: PeopleSide }) {
  const t = useTranslations('profiles')
  const { handle } = page.profile
  // The member's followers count what the reader just did on this page, as on the member's page.
  const followers = useFollowers(handle, page.follows.followers)
  const bold = (chunks: ReactNode) => <b className="font-semibold">{chunks}</b>
  return (
    <nav aria-label={t('peopleLabel')} className="mt-5 flex gap-7 border-b border-line">
      {peopleSides.map((item) => (
        <Link
          key={item}
          href={peoplePath(handle, item)}
          scroll={false}
          aria-current={item === side ? 'page' : undefined}
          className={`-mb-px flex h-12 items-center border-b-2 text-body whitespace-nowrap transition-colors ${
            item === side ? 'border-ink text-ink' : 'border-transparent text-ink-4 hover:text-ink'
          }`}
        >
          {/* One flex item, so the space between the number and the word stays. */}
          <span>
            {item === 'followers'
              ? t.rich('followersCount', { count: followers, b: bold })
              : t.rich('followingCount', { count: page.follows.following, b: bold })}
          </span>
        </Link>
      ))}
    </nav>
  )
}

function PersonItem({ person }: { person: PersonRow }) {
  const circlesT = useTranslations('circles')
  const name = person.name || circlesT('anonymous')
  return (
    <li className="flex items-center gap-3 border-b border-hairline py-4">
      <ProfileLink handle={person.handle} twin className="flex-none rounded-pill">
        <PersonAvatar name={name} tone={person.tone} />
      </ProfileLink>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-baseline gap-x-2">
          <ProfileLink handle={person.handle} className="text-ui font-medium wrap-anywhere hover:underline">
            {person.self ? circlesT('youNamed', { name }) : name}
          </ProfileLink>
          <span className="text-meta text-ink-4">@{person.handle}</span>
        </span>
        {person.bio && (
          <span lang={person.bioLang ?? undefined} className="line-clamp-1 text-meta text-ink-3">
            {person.bio}
          </span>
        )}
      </span>
      {!person.self && !person.blocked && <FollowButton handle={person.handle} name={name} initial={person.following} look="accent" />}
    </li>
  )
}
