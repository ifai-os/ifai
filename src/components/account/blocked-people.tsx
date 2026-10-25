'use client'

import { useFormatter, useTranslations } from 'next-intl'
import { useState } from 'react'

import { useReaderTimeZone } from '@/components/local-time'
import { PersonAvatar } from '@/modules/circles/components/person-avatar'
import { ProfileLink } from '@/modules/profiles/components/profile-link'
import type { BlockedPerson } from '@/modules/profiles/rules'

import { rowButton, SettingsCard, SettingsRow } from './settings-ui'

/**
 * 「屏蔽的人」under「隐私」(docs/specs/circles.md rule 23): the latest first, each with when and
 * 「解除屏蔽」, which takes them off the list at once.
 */
export function BlockedPeople({ people }: { people: BlockedPerson[] }) {
  const t = useTranslations('account')
  const [shown, setShown] = useState(people)

  if (shown.length === 0) {
    return (
      <SettingsCard>
        <p className="py-4.5 text-ui text-ink-3">{t('blockedNone')}</p>
      </SettingsCard>
    )
  }
  return (
    <SettingsCard>
      {shown.map((person) => (
        <BlockedRow key={person.handle} person={person} onUnblocked={() => setShown((list) => list.filter((item) => item.handle !== person.handle))} />
      ))}
    </SettingsCard>
  )
}

function BlockedRow({ person, onUnblocked }: { person: BlockedPerson; onUnblocked: () => void }) {
  const t = useTranslations('account')
  const circlesT = useTranslations('circles')
  const format = useFormatter()
  const timeZone = useReaderTimeZone()
  const [status, setStatus] = useState<'idle' | 'busy' | 'failed'>('idle')
  const name = person.name || circlesT('anonymous')

  async function unblock() {
    setStatus('busy')
    const response = await fetch('/api/account/blocks', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ handle: person.handle, on: false }),
    }).catch(() => null)
    if (response?.ok) onUnblocked()
    else setStatus('failed')
  }

  return (
    <SettingsRow
      lead={
        <ProfileLink handle={person.handle} twin className="flex-none rounded-pill">
          <PersonAvatar name={name} tone={person.tone} />
        </ProfileLink>
      }
      title={
        <ProfileLink handle={person.handle} className="hover:underline">
          {name}
        </ProfileLink>
      }
      description={
        status === 'failed' ? (
          <span role="alert" className="text-down">
            {t('unblockFailed')}
          </span>
        ) : (
          t('blockedOn', { date: format.dateTime(new Date(person.blockedAt), { year: 'numeric', month: 'short', day: 'numeric', timeZone }) })
        )
      }
      action={
        <button type="button" onClick={unblock} disabled={status === 'busy'} aria-label={t('unblockName', { name })} className={rowButton.secondary}>
          {t('unblock')}
        </button>
      }
    />
  )
}
