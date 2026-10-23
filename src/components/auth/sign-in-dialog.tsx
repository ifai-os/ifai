'use client'

import { useTranslations } from 'next-intl'
import { Suspense, useEffect, useId, useRef } from 'react'

import { SignInForm } from '@/components/auth/sign-in-form'
import { Icon } from '@/components/icon'
import type { AuthProviders } from '@/lib/auth/providers'

type SignInDialogProps = {
  open: boolean
  onClose: () => void
  /** What signing in is for, such as「登录后就能收藏」. */
  title: string
  providers: AuthProviders
  /** Where signing in comes back to: this page, with what to finish there. */
  callbackURL: string
  /** Shown once the email is sent, such as that the save will finish by itself. */
  sentNote?: string
}

/**
 * The「需要登录」dialog: it only opens for something that needs an account, never to browse.
 * A native modal dialog, so focus stays inside and Escape closes it.
 */
export function SignInDialog({ open, onClose, title, providers, callbackURL, sentNote }: SignInDialogProps) {
  const t = useTranslations('auth')
  const states = useTranslations('states')
  const ref = useRef<HTMLDialogElement>(null)
  const titleId = useId()

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[calc(100%-32px)] max-w-80 overflow-visible rounded-dialog bg-bg p-0 text-ink shadow-float backdrop:bg-scrim"
    >
      {open && (
        <div className="relative flex flex-col gap-3 p-5">
          <div className="flex flex-col gap-1 pr-8">
            <h2 id={titleId} className="text-title font-semibold">
              {title}
            </h2>
            {providers.email && <p className="text-meta text-ink-4">{t('dialogSubtitle')}</p>}
          </div>
          <Suspense>
            <SignInForm providers={providers} callbackURL={callbackURL} sentNote={sentNote} compact />
          </Suspense>
          {/* Last in the DOM, so opening the dialog focuses the email field rather than this. */}
          <button
            type="button"
            onClick={onClose}
            aria-label={states('dismiss')}
            className="absolute top-3.5 right-3.5 flex size-8 items-center justify-center rounded-pill text-ink-4 hover:text-ink"
          >
            <Icon name="close" size={16} strokeWidth={2} />
          </button>
        </div>
      )}
    </dialog>
  )
}
