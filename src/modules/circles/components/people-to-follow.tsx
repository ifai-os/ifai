'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

import { FollowButton, useFollowers } from '@/modules/profiles/components/follows'
import { ProfileLink } from '@/modules/profiles/components/profile-link'
import { profileRules, type SuggestedPerson } from '@/modules/profiles/rules'

import { request, useCirclesSession } from './circles-session'
import { PersonAvatar } from './person-avatar'

const shownAtOnce = profileRules.suggestionsShown

/**
 * 「值得关注的人」beside the feed (docs/specs/circles.md rule 21): four at a time,「换一换」for the
 * next four, back to the first four after the last. Read for the reader once the session is known;
 * nobody to suggest, no section.
 */
export function PeopleToFollow() {
  const t = useTranslations('circles')
  const { member, sessionPending } = useCirclesSession()
  const memberId = member?.id ?? null
  const [read, setRead] = useState<{ memberId: string | null; people: SuggestedPerson[] } | null>(null)
  const [start, setStart] = useState(0)

  useEffect(() => {
    if (sessionPending) return
    let current = true
    void request<{ people: SuggestedPerson[] }>('/api/circles/people').then(({ data }) => {
      if (!current) return
      setRead({ memberId, people: data?.people ?? [] })
      setStart(0)
    })
    return () => {
      current = false
    }
  }, [sessionPending, memberId])

  // What was read for someone else is not this reader's.
  const people = read?.memberId === memberId ? read.people : []
  if (people.length === 0) return null

  return (
    <section aria-labelledby="people-to-follow" className="flex flex-col px-1">
      <div className="flex items-baseline justify-between pb-1">
        <h2 id="people-to-follow" className="text-title font-medium">
          {t('peopleTitle')}
        </h2>
        {people.length > shownAtOnce && (
          <button
            type="button"
            onClick={() => setStart((at) => (at + shownAtOnce >= people.length ? 0 : at + shownAtOnce))}
            className="min-h-8 text-meta text-ink-4 hover:text-ink"
          >
            {t('peopleNext')}
          </button>
        )}
      </div>
      <ul className="flex flex-col">
        {people.slice(start, start + shownAtOnce).map((person) => (
          <PersonItem key={person.handle} person={person} />
        ))}
      </ul>
    </section>
  )
}

/** Their picture and name (to their page),「# 圈子 · N 位关注者」and「关注」. */
function PersonItem({ person }: { person: SuggestedPerson }) {
  const t = useTranslations('circles')
  const { byId } = useCirclesSession()
  const followers = useFollowers(person.handle, person.followers)
  const circle = person.circle === null ? undefined : byId.get(person.circle)
  const name = person.name || t('anonymous')
  return (
    <li className="flex items-center gap-2.5 border-b border-hairline py-2.5">
      <ProfileLink handle={person.handle} twin className="flex-none rounded-pill">
        <PersonAvatar name={name} tone={person.tone} size="sm" />
      </ProfileLink>
      <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5">
        <ProfileLink handle={person.handle} className="max-w-full text-meta font-medium wrap-anywhere hover:underline">
          {name}
        </ProfileLink>
        <span className="text-small text-ink-4 wrap-anywhere">
          {circle ? t('personLine', { circle: circle.name, count: followers }) : t('personFollowers', { count: followers })}
        </span>
      </span>
      <FollowButton handle={person.handle} name={name} initial={false} look="accent" />
    </li>
  )
}
