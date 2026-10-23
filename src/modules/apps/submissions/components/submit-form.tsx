'use client'

import { useFormatter, useLocale, useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState, type FormEvent } from 'react'

import { Button } from '@/components/button'
import { toneFor } from '@/components/cards/initial-tile'
import { useReaderTimeZone } from '@/components/local-time'
import { Submitted } from '@/components/states/submitted'
import type { Locale } from '@/i18n/config'
import { Link, useRouter } from '@/i18n/navigation'

import { initialOf } from '../../localized'
import { textLength } from '../../reviews/rules'
import { parseAppSubmissionInput, reviewDeadline, submissionRules, type AppSubmissionField } from '../rules'

export type CategoryOption = { id: number; name: string }

type FormError = 'tooMany' | 'signIn' | 'failed'

type Sent = { code: string; email: string; name: string; domain: string; category: number | null; submittedAt: Date }

type ListedApp = { slug: string; name: string }

type SubmitReply = {
  code?: string
  email?: string
  submittedAt?: string
  name?: string
  category?: number | null
  fields?: AppSubmissionField[]
  app?: ListedApp
}

const field =
  'w-full rounded-thumb border bg-surface px-4 text-ui text-ink outline-none placeholder:text-ink-4 focus:border-ink-4 aria-[invalid]:border-down'

const fieldOrder = ['website', 'name', 'note', 'email'] as const

type SubmitFormProps = {
  /** The account's email: where the result goes unless the member changes it. */
  email: string
  categories: CategoryOption[]
  /** The name to start with, from `?name=`. */
  name: string
  titleId: string
}

/**
 * The submission form: the website and the name, a category and a sentence on what the app does
 * if the member likes, and where the result goes. Checked here with the API's own rules first. An
 * app that is already listed is pointed at instead of being sent; once sent,「提交成功」 from the
 * states board takes the form's place and「我的提交」 below is read again.
 */
export function SubmitForm({ email: accountEmail, categories, name: prefill, titleId }: SubmitFormProps) {
  const t = useTranslations('appSubmissions')
  const format = useFormatter()
  const locale = useLocale() as Locale
  const router = useRouter()
  const timeZone = useReaderTimeZone()
  const [website, setWebsite] = useState('')
  const [name, setName] = useState(prefill)
  const [category, setCategory] = useState('')
  const [note, setNote] = useState('')
  const [email, setEmail] = useState(accountEmail)
  const [invalid, setInvalid] = useState<AppSubmissionField[]>([])
  const [error, setError] = useState<FormError | null>(null)
  const [listed, setListed] = useState<ListedApp | null>(null)
  const [sending, setSending] = useState(false)
  const [done, setDone] = useState<Sent | null>(null)
  const ids = { website: useId(), name: useId(), category: useId(), note: useId(), email: useId() }
  const websiteRef = useRef<HTMLInputElement>(null)
  const nameRef = useRef<HTMLInputElement>(null)
  const noteRef = useRef<HTMLTextAreaElement>(null)
  const emailRef = useRef<HTMLInputElement>(null)
  const doneHeading = useRef<HTMLHeadingElement>(null)

  useEffect(() => {
    if (done) doneHeading.current?.focus()
  }, [done])

  const nameTooLong = textLength(name.trim()) > submissionRules.maxName
  const noteLength = textLength(note.trim())
  const noteTooLong = noteLength > submissionRules.maxNote

  function showInvalid(fields: AppSubmissionField[]) {
    setInvalid(fields)
    const first = fieldOrder.find((item) => fields.includes(item))
    if (first) ({ website: websiteRef, name: nameRef, note: noteRef, email: emailRef })[first].current?.focus()
  }

  function edited(item: AppSubmissionField) {
    if (invalid.includes(item)) setInvalid(invalid.filter((other) => other !== item))
    if (item === 'website') setListed(null)
    setError(null)
  }

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const parsed = parseAppSubmissionInput({ website, name, category, note, email, locale })
    if (!parsed.ok) {
      showInvalid(parsed.fields)
      return
    }
    setSending(true)
    setError(null)
    setListed(null)
    try {
      const response = await fetch('/api/app-submissions/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.value),
      })
      const body = (await response.json().catch(() => ({}))) as SubmitReply
      if (response.ok && body.code) {
        const submittedAt = new Date(body.submittedAt ?? Date.now())
        // The same website sent again while it waits gives back the earlier submission, as it was sent.
        setDone({
          code: body.code,
          email: body.email ?? parsed.value.email,
          name: body.name ?? parsed.value.name,
          domain: parsed.value.domain,
          category: body.category === undefined ? parsed.value.category : body.category,
          submittedAt: Number.isNaN(submittedAt.getTime()) ? new Date() : submittedAt,
        })
        // 「我的提交」 is rendered on the server: read it again with this one in it.
        router.refresh()
      } else if (response.status === 409 && body.app) setListed(body.app)
      else if (response.status === 400 && body.fields?.length) showInvalid(body.fields)
      else setError(response.status === 429 ? 'tooMany' : response.status === 401 ? 'signIn' : 'failed')
    } catch {
      setError('failed')
    } finally {
      setSending(false)
    }
  }

  function showMine() {
    document.getElementById('mine')?.scrollIntoView({ block: 'start' })
    document.getElementById('mine-title')?.focus({ preventScroll: true })
  }

  function again() {
    setWebsite('')
    setName('')
    setCategory('')
    setNote('')
    setDone(null)
    requestAnimationFrame(() => websiteRef.current?.focus())
  }

  if (done) {
    const categoryName = categories.find((item) => item.id === done.category)?.name
    // When it was sent on the reader's own clock; the review date is a Shanghai working day.
    const sentAt = format.dateTime(done.submittedAt, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', timeZone })
    const reviewBy = format.dateTime(reviewDeadline(done.submittedAt), { month: 'short', day: 'numeric', timeZone: 'Asia/Shanghai' })
    return (
      <Submitted
        headingId={titleId}
        headingRef={doneHeading}
        title={t('done.title')}
        body={t('done.body', { email: done.email })}
        item={{
          initial: initialOf(done.name),
          tone: toneFor(done.domain),
          name: done.name,
          meta: [categoryName, t('done.number', { code: done.code })].filter(Boolean).join(' · '),
        }}
        steps={[
          { label: t('done.steps.sent'), detail: sentAt },
          { label: t('done.steps.review'), detail: t('done.steps.reviewBy', { date: reviewBy }) },
          { label: t('done.steps.live'), detail: t('done.steps.liveBody') },
        ]}
      >
        <Button onClick={showMine}>{t('done.mine')}</Button>
        <Button variant="secondary" onClick={again}>
          {t('done.again')}
        </Button>
      </Submitted>
    )
  }

  const nameWrong = invalid.includes('name') || nameTooLong
  const noteWrong = invalid.includes('note') || noteTooLong
  const describedBy = (item: AppSubmissionField, hint: string | null, wrong = invalid.includes(item)) =>
    [hint, wrong ? `${ids[item]}-error` : null].filter(Boolean).join(' ') || undefined

  return (
    <>
      <h2 id={titleId} className="text-h3 font-semibold">
        {t('form.title')}
      </h2>
      <form onSubmit={send} noValidate className="flex flex-col gap-5">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.website} className="text-meta font-medium text-ink-2">
            {t('form.website')}
          </label>
          <input
            ref={websiteRef}
            id={ids.website}
            type="url"
            name="website"
            inputMode="url"
            autoComplete="url"
            spellCheck={false}
            value={website}
            onChange={(event) => {
              setWebsite(event.target.value)
              edited('website')
            }}
            placeholder={t('form.websitePlaceholder')}
            aria-invalid={invalid.includes('website') || undefined}
            aria-describedby={describedBy('website', `${ids.website}-hint`)}
            className={`${field} h-11 border-surface-2`}
          />
          <span id={`${ids.website}-hint`} className="text-small text-ink-4">
            {t('form.websiteHint')}
          </span>
          {invalid.includes('website') && (
            <span id={`${ids.website}-error`} className="text-small text-down">
              {t('form.errors.website')}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.name} className="text-meta font-medium text-ink-2">
            {t('form.name')}
          </label>
          <input
            ref={nameRef}
            id={ids.name}
            type="text"
            name="name"
            autoComplete="off"
            value={name}
            onChange={(event) => {
              setName(event.target.value)
              edited('name')
            }}
            aria-invalid={nameWrong || undefined}
            aria-describedby={describedBy('name', null, nameWrong)}
            className={`${field} h-11 border-surface-2`}
          />
          {nameWrong && (
            <span id={`${ids.name}-error`} className="text-small text-down">
              {t('form.errors.name', { max: submissionRules.maxName })}
            </span>
          )}
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.category} className="text-meta font-medium text-ink-2">
            {t('form.category')}
          </label>
          <select
            id={ids.category}
            name="category"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            className={`${field} h-11 border-surface-2`}
          >
            <option value="">{t('form.categoryNone')}</option>
            {categories.map((item) => (
              <option key={item.id} value={String(item.id)}>
                {item.name}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.note} className="text-meta font-medium text-ink-2">
            {t('form.note')}
          </label>
          <textarea
            ref={noteRef}
            id={ids.note}
            name="note"
            rows={2}
            value={note}
            onChange={(event) => {
              setNote(event.target.value)
              edited('note')
            }}
            placeholder={t('form.notePlaceholder')}
            aria-invalid={noteWrong || undefined}
            aria-describedby={describedBy('note', `${ids.note}-count`, noteWrong)}
            className={`${field} min-h-20 resize-y border-surface-2 py-3`}
          />
          <div className="flex items-start justify-between gap-3">
            <span id={`${ids.note}-error`} className="text-small text-down">
              {noteWrong && t('form.errors.note', { max: submissionRules.maxNote })}
            </span>
            <span id={`${ids.note}-count`} className={`flex-none text-small tabular-nums ${noteTooLong ? 'text-down' : 'text-ink-4'}`}>
              {t('form.count', { count: noteLength, max: submissionRules.maxNote })}
            </span>
          </div>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor={ids.email} className="text-meta font-medium text-ink-2">
            {t('form.email')}
          </label>
          <input
            ref={emailRef}
            id={ids.email}
            type="email"
            name="email"
            autoComplete="email"
            inputMode="email"
            value={email}
            onChange={(event) => {
              setEmail(event.target.value)
              edited('email')
            }}
            aria-invalid={invalid.includes('email') || undefined}
            aria-describedby={describedBy('email', `${ids.email}-hint`)}
            className={`${field} h-11 border-surface-2`}
          />
          <span id={`${ids.email}-hint`} className="text-small text-ink-4">
            {t('form.emailHint')}
          </span>
          {invalid.includes('email') && (
            <span id={`${ids.email}-error`} className="text-small text-down">
              {t('form.errors.email')}
            </span>
          )}
        </div>

        {listed && (
          <p role="alert" className="rounded-thumb bg-surface px-4 py-3 text-ui text-ink-2">
            {t.rich('form.listed', {
              name: listed.name,
              link: (chunks) => (
                <Link href={`/apps/${listed.slug}`} className="font-medium text-link hover:underline">
                  {chunks}
                </Link>
              ),
            })}
          </p>
        )}

        {error && (
          <p role="alert" className="text-small text-down">
            {error === 'tooMany' ? t('form.errors.tooMany', { max: submissionRules.dailyLimit }) : t(`form.errors.${error}`)}
          </p>
        )}

        <Button type="submit" disabled={sending} className="self-start disabled:opacity-60">
          {sending ? t('form.sending') : t('form.send')}
        </Button>
      </form>
    </>
  )
}
