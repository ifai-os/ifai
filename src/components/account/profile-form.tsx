'use client'

import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { useId, useState, type FormEvent, type ReactNode } from 'react'

import { Button } from '@/components/button'
import { Icon } from '@/components/icon'
import type { Locale } from '@/i18n/config'
import { Link, useRouter } from '@/i18n/navigation'
import { authClient } from '@/lib/auth/client'
import { cleanName, reviewRules, textLength } from '@/modules/apps/reviews/rules'
import { request } from '@/modules/circles/components/circles-session'
import {
  checkHandle,
  cleanBio,
  normalizeHandle,
  parseWebsite,
  profilePath,
  profileRules,
  type ProfilesError,
  type ProfileSettings,
} from '@/modules/profiles/rules'

import { MemberAvatar } from './member-avatar'

type Status = 'idle' | 'saving' | 'saved' | 'failed'

/** What is wrong with each field, shown under it. */
type Problems = { name?: string; handle?: string; bio?: string; website?: string }

type ProfileFormProps = {
  userId: string
  name: string
  email: string
  /** The page address, the line about oneself and the site: with the circles (docs/specs/circles.md rules 18–19). */
  profile: ProfileSettings | null
  /** Before the address field:「ifai.io/u/」with this site's own host. */
  siteHost: string
}

/**
 * 「个人资料」(docs/specs/account.md): the avatar and the nickname, and with the circles the page
 * address, the line about oneself and the site. The nickname is the name on reviews and posts, so it
 * has the reviews' limit; the server cleans and checks it again (src/lib/auth/auth.ts). One「保存」
 * saves it all: the nickname through Better Auth, the rest through PATCH /api/account/profile.
 */
export function ProfileForm({ userId, name: savedName, email, profile: savedProfile, siteHost }: ProfileFormProps) {
  const t = useTranslations('account')
  const format = useFormatter()
  const locale = useLocale() as Locale
  const router = useRouter()
  const [name, setName] = useState(savedName)
  const [saved, setSaved] = useState({ name: savedName, profile: savedProfile })
  const [handle, setHandle] = useState(savedProfile?.handle ?? '')
  const [bio, setBio] = useState(savedProfile?.bio ?? '')
  const [website, setWebsite] = useState(savedProfile?.website ?? '')
  const [status, setStatus] = useState<Status>('idle')
  const [problems, setProblems] = useState<Problems>({})
  const ids = {
    name: useId(),
    count: useId(),
    hint: useId(),
    handle: useId(),
    handleHint: useId(),
    bio: useId(),
    bioCount: useId(),
    website: useId(),
  }
  const profile = saved.profile
  const locked = profile?.nextChange ?? null
  const bioLength = textLength(cleanBio(bio))

  /** What the field's text becomes on saving, or why it can't be saved. */
  function check(): { problems: Problems; changes: Record<string, string | null> } {
    const found: Problems = {}
    const changes: Record<string, string | null> = {}
    if (!cleanName(name)) found.name = t('nameEmpty')
    if (!profile) return { problems: found, changes }
    const nextHandle = normalizeHandle(handle)
    if (nextHandle !== profile.handle) {
      const checked = checkHandle(nextHandle)
      if (!checked.ok) found.handle = t(checked.error === 'invalid-handle' ? 'handleInvalid' : 'handleReserved')
      else changes.handle = checked.handle
    }
    const nextBio = cleanBio(bio)
    if (textLength(nextBio) > profileRules.maxBio) found.bio = t('bioTooLong', { max: profileRules.maxBio })
    else if (nextBio !== profile.bio) changes.bio = nextBio
    const site = parseWebsite(website)
    if (!site.ok) found.website = t('websiteInvalid')
    else if (site.value !== profile.website) changes.website = site.value
    return { problems: found, changes }
  }

  function problemFor(error: ProfilesError | undefined, nextChange?: string): Problems | null {
    switch (error) {
      case 'invalid-handle':
        return { handle: t('handleInvalid') }
      case 'reserved-handle':
        return { handle: t('handleReserved') }
      case 'handle-taken':
        return { handle: t('handleTaken') }
      case 'handle-too-soon':
        return { handle: nextChange ? t('handleLocked', { date: format.dateTime(new Date(nextChange), { dateStyle: 'long' }) }) : t('handleOnce') }
      case 'bio-too-long':
        return { bio: t('bioTooLong', { max: profileRules.maxBio }) }
      case 'invalid-website':
        return { website: t('websiteInvalid') }
      default:
        return null
    }
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const { problems: found, changes } = check()
    setProblems(found)
    if (Object.keys(found).length > 0) {
      setStatus('idle')
      return
    }
    setStatus('saving')
    let nextProfile = profile
    if (profile && Object.keys(changes).length > 0) {
      const { data, error } = await request<{ profile: ProfileSettings; nextChange?: string }, ProfilesError>('/api/account/profile', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ...changes, locale }),
      })
      if (!data) {
        const problem = problemFor(error)
        setProblems(problem ?? {})
        setStatus(problem ? 'idle' : 'failed')
        return
      }
      nextProfile = data.profile
    }
    const clean = cleanName(name)
    if (clean !== saved.name) {
      const { error } = await authClient.updateUser({ name: clean }).catch(() => ({ error: { code: 'NETWORK' } }))
      if (error) {
        if (error.code === 'INVALID_NAME') setProblems({ name: t('nameEmpty') })
        setStatus(error.code === 'INVALID_NAME' ? 'idle' : 'failed')
        if (nextProfile !== profile) setSaved((current) => ({ ...current, profile: nextProfile }))
        return
      }
    }
    // The address is in the session (the account menu shows it): read it again past the cookie's copy.
    if (nextProfile && profile && nextProfile.handle !== profile.handle) {
      await authClient.getSession({ query: { disableCookieCache: true } }).catch(() => null)
    }
    setName(clean)
    setSaved({ name: clean, profile: nextProfile })
    if (nextProfile) {
      setHandle(nextProfile.handle)
      setBio(nextProfile.bio)
      setWebsite(nextProfile.website ?? '')
    }
    setStatus('saved')
    router.refresh()
  }

  const edited = () => {
    if (status !== 'saving') setStatus('idle')
  }

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-5.5 rounded-card border border-surface-2 p-4 md:p-7">
      <div className="flex items-center gap-4.5">
        <MemberAvatar userId={userId} name={cleanName(name) || email} size="lg" />
        <p className="text-meta text-ink-4">{t('avatarNote')}</p>
      </div>

      <Field
        id={ids.name}
        label={t('nameLabel')}
        count={<span id={ids.count}>{t('nameCount', { count: [...name].length, max: reviewRules.maxName })}</span>}
        hint={<span id={ids.hint}>{profile ? t('nameHintCircles') : t('nameHint')}</span>}
        problem={problems.name}
      >
        <input
          id={ids.name}
          name="name"
          value={name}
          maxLength={reviewRules.maxName}
          autoComplete="nickname"
          onChange={(event) => {
            setName(event.target.value)
            edited()
          }}
          aria-invalid={problems.name ? true : undefined}
          aria-describedby={`${ids.hint} ${ids.count}${problems.name ? ` ${ids.name}-problem` : ''}`}
          className={inputClass(Boolean(problems.name))}
        />
      </Field>

      {profile && (
        <>
          <Field
            id={ids.handle}
            label={t('handleLabel')}
            hint={
              <span id={ids.handleHint}>
                {locked ? t('handleLocked', { date: format.dateTime(new Date(locked), { dateStyle: 'long' }) }) : t('handleOnce')}
              </span>
            }
            problem={problems.handle}
          >
            <div
              className={`flex h-11 items-center overflow-hidden rounded-thumb border bg-surface focus-within:border-ink-4 ${problems.handle ? 'border-down' : 'border-surface-2'}`}
            >
              <span aria-hidden="true" className="flex-none pr-0.5 pl-3.5 text-body text-ink-4">
                {siteHost}/u/
              </span>
              <input
                id={ids.handle}
                name="handle"
                value={handle}
                readOnly={locked !== null}
                maxLength={profileRules.maxHandle}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                onChange={(event) => {
                  setHandle(event.target.value.toLowerCase().replace(/\s+/g, ''))
                  edited()
                }}
                aria-invalid={problems.handle ? true : undefined}
                aria-describedby={`${ids.handleHint}${problems.handle ? ` ${ids.handle}-problem` : ''}`}
                className={`h-full min-w-0 flex-1 bg-transparent pr-3.5 text-body outline-none ${locked ? 'text-ink-4' : 'text-ink'}`}
              />
            </div>
          </Field>

          <Field
            id={ids.bio}
            label={t('bioLabel')}
            count={
              <span id={ids.bioCount} className={bioLength > profileRules.maxBio ? 'text-down' : undefined}>
                {t('nameCount', { count: bioLength, max: profileRules.maxBio })}
              </span>
            }
            problem={problems.bio}
          >
            <textarea
              id={ids.bio}
              name="bio"
              value={bio}
              rows={2}
              onChange={(event) => {
                // One line (rule 19): a pasted line break is a space.
                setBio(event.target.value.replace(/[\r\n]+/g, ' '))
                edited()
              }}
              onKeyDown={(event) => {
                if (event.key === 'Enter') event.preventDefault()
              }}
              aria-invalid={problems.bio ? true : undefined}
              aria-describedby={`${ids.bioCount}${problems.bio ? ` ${ids.bio}-problem` : ''}`}
              className={`${inputClass(Boolean(problems.bio))} h-auto resize-none py-2.5 leading-relaxed`}
            />
          </Field>

          <Field id={ids.website} label={t('websiteLabel')} problem={problems.website}>
            <input
              id={ids.website}
              name="website"
              value={website}
              inputMode="url"
              autoComplete="url"
              autoCapitalize="none"
              spellCheck={false}
              placeholder="example.com"
              onChange={(event) => {
                setWebsite(event.target.value)
                edited()
              }}
              aria-invalid={problems.website ? true : undefined}
              aria-describedby={problems.website ? `${ids.website}-problem` : undefined}
              className={inputClass(Boolean(problems.website))}
            />
          </Field>
        </>
      )}

      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" disabled={status === 'saving'} className="disabled:opacity-60">
          {status === 'saving' ? t('saving') : t('save')}
        </Button>
        {status === 'saved' && (
          <span role="status" className="flex items-center gap-1.5 text-meta text-up">
            <Icon name="check" size={16} strokeWidth={2.2} />
            {t('saved')}
          </span>
        )}
        {status === 'failed' && (
          <span role="alert" className="text-small text-down">
            {t('saveFailed')}
          </span>
        )}
        {profile && (
          <Link href={profilePath(profile.handle)} className="ml-auto text-meta text-link hover:underline">
            {t('viewProfile')}
          </Link>
        )}
      </div>
    </form>
  )
}

const inputClass = (invalid: boolean) =>
  `h-11 w-full rounded-thumb border bg-surface px-3.5 text-body text-ink outline-none focus:border-ink-4 ${invalid ? 'border-down' : 'border-surface-2'}`

type FieldProps = {
  id: string
  label: string
  /** Top right:「12 / 80」. */
  count?: ReactNode
  hint?: ReactNode
  problem?: string
  children: ReactNode
}

/** A label, the input, a hint and what is wrong, in the form's order. */
function Field({ id, label, count, hint, problem, children }: FieldProps) {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="text-ui font-medium">
          {label}
        </label>
        {count && <span className="text-small text-ink-4">{count}</span>}
      </div>
      {children}
      {hint && <span className="text-meta text-ink-4">{hint}</span>}
      {problem && (
        <span id={`${id}-problem`} role="alert" className="text-small text-down">
          {problem}
        </span>
      )}
    </div>
  )
}
