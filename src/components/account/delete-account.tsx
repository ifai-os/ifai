'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState } from 'react'

import { Button, buttonBase } from '@/components/button'
import { Icon } from '@/components/icon'
import { localizePath, type Locale } from '@/i18n/config'
import { useRouter } from '@/i18n/navigation'
import { authClient } from '@/lib/auth/client'

type State = 'idle' | 'deleting' | 'failed' | 'stale'

/**
 * 「删除账号」and its confirm dialog. Better Auth deletes only for a sign-in from the last day
 * (`freshAge`); an older one gets SESSION_EXPIRED, and the dialog offers to sign out so the page
 * shows the sign-in form, which comes back here.
 */
export function DeleteAccount() {
  const t = useTranslations('account')
  const states = useTranslations('states')
  const locale = useLocale() as Locale
  const router = useRouter()
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()
  const [open, setOpen] = useState(false)
  const [state, setState] = useState<State>('idle')

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  function close() {
    if (state === 'deleting') return
    setOpen(false)
    setState('idle')
  }

  async function remove() {
    setState('deleting')
    const { error } = await authClient.deleteUser().catch(() => ({ error: { code: 'NETWORK' } }))
    if (!error) {
      // A full load, so the header and every cached session read start over signed out.
      window.location.replace(`${localizePath(locale, '/me/account')}?deleted=1`)
      return
    }
    setState(error.code === 'SESSION_EXPIRED' ? 'stale' : 'failed')
  }

  async function signInAgain() {
    await authClient.signOut()
    setOpen(false)
    router.refresh()
  }

  const danger = `${buttonBase} bg-down text-white hover:opacity-90 disabled:opacity-60`

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${buttonBase} border border-line bg-bg text-down hover:border-down`}>
        {t('deleteButton')}
      </button>
      <dialog
        ref={ref}
        aria-labelledby={titleId}
        onClose={close}
        onCancel={(event) => state === 'deleting' && event.preventDefault()}
        className="m-auto w-[calc(100%-32px)] max-w-100 overflow-visible rounded-dialog bg-bg p-0 text-ink shadow-float backdrop:bg-scrim"
      >
        <div className="relative flex flex-col gap-3 p-5">
          <h2 id={titleId} className="pr-8 text-title font-semibold">
            {t('confirmTitle')}
          </h2>
          {state === 'stale' ? (
            <>
              <p role="alert" className="text-meta text-ink-3">
                {t('signInAgain')}
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" onClick={close}>
                  {t('cancel')}
                </Button>
                <Button onClick={signInAgain}>{t('signInAgainButton')}</Button>
              </div>
            </>
          ) : (
            <>
              <p className="text-meta text-ink-3">{t('confirmBody')}</p>
              {state === 'failed' && (
                <p role="alert" className="text-small text-down">
                  {t('failed')}
                </p>
              )}
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" onClick={close} disabled={state === 'deleting'}>
                  {t('cancel')}
                </Button>
                <button type="button" onClick={remove} disabled={state === 'deleting'} className={danger}>
                  {state === 'deleting' ? t('deleting') : t('confirm')}
                </button>
              </div>
            </>
          )}
          <button
            type="button"
            onClick={close}
            aria-label={states('dismiss')}
            className="absolute top-3.5 right-3.5 flex size-8 items-center justify-center rounded-pill text-ink-4 hover:text-ink"
          >
            <Icon name="close" size={16} strokeWidth={2} />
          </button>
        </div>
      </dialog>
    </>
  )
}
