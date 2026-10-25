'use client'

import { useTranslations } from 'next-intl'
import { useId, useState, type FormEvent } from 'react'

import { Button } from '@/components/button'
import { Icon } from '@/components/icon'
import { useRouter } from '@/i18n/navigation'
import { authClient } from '@/lib/auth/client'
import { cleanName, reviewRules } from '@/modules/apps/reviews/rules'

import { MemberAvatar } from './member-avatar'

type Status = 'idle' | 'saving' | 'saved' | 'empty' | 'failed'

/**
 * 「个人资料」(docs/specs/account.md): the avatar and the nickname. The nickname is the name on
 * reviews, so it has the reviews' limit; the server cleans and checks it again (src/lib/auth/auth.ts).
 */
export function ProfileForm({ userId, name: savedName, email }: { userId: string; name: string; email: string }) {
  const t = useTranslations('account')
  const router = useRouter()
  const [name, setName] = useState(savedName)
  const [status, setStatus] = useState<Status>('idle')
  const ids = { name: useId(), count: useId(), hint: useId(), error: useId() }
  const length = [...name].length

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const clean = cleanName(name)
    if (!clean) {
      setStatus('empty')
      return
    }
    setStatus('saving')
    const { error } = await authClient.updateUser({ name: clean }).catch(() => ({ error: { code: 'NETWORK' } }))
    if (error) {
      setStatus(error.code === 'INVALID_NAME' ? 'empty' : 'failed')
      return
    }
    setName(clean)
    setStatus('saved')
    router.refresh()
  }

  const problem = status === 'empty' ? t('nameEmpty') : status === 'failed' ? t('saveFailed') : null

  return (
    <form onSubmit={save} noValidate className="flex flex-col gap-5.5 rounded-card border border-surface-2 p-4 md:p-7">
      <div className="flex items-center gap-4.5">
        <MemberAvatar userId={userId} name={cleanName(name) || email} size="lg" />
        <p className="text-meta text-ink-4">{t('avatarNote')}</p>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex items-baseline justify-between gap-3">
          <label htmlFor={ids.name} className="text-ui font-medium">
            {t('nameLabel')}
          </label>
          <span id={ids.count} className="text-small text-ink-4">
            {t('nameCount', { count: length, max: reviewRules.maxName })}
          </span>
        </div>
        <input
          id={ids.name}
          name="name"
          value={name}
          maxLength={reviewRules.maxName}
          autoComplete="nickname"
          onChange={(event) => {
            setName(event.target.value)
            if (status !== 'saving') setStatus('idle')
          }}
          aria-invalid={status === 'empty' || undefined}
          aria-describedby={[ids.hint, ids.count, problem ? ids.error : null].filter(Boolean).join(' ')}
          className={`h-11 w-full rounded-thumb border bg-surface px-3.5 text-body text-ink outline-none focus:border-ink-4 ${status === 'empty' ? 'border-down' : 'border-surface-2'}`}
        />
        <span id={ids.hint} className="text-meta text-ink-4">
          {t('nameHint')}
        </span>
        {problem && (
          <span id={ids.error} role="alert" className="text-small text-down">
            {problem}
          </span>
        )}
      </div>

      <div className="flex items-center gap-4">
        <Button type="submit" disabled={status === 'saving'} className="disabled:opacity-60">
          {status === 'saving' ? t('saving') : t('save')}
        </Button>
        {status === 'saved' && (
          <span role="status" className="flex items-center gap-1.5 text-meta text-up">
            <Icon name="check" size={16} strokeWidth={2.2} />
            {t('saved')}
          </span>
        )}
      </div>
    </form>
  )
}
