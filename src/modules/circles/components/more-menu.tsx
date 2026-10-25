'use client'

import { useTranslations } from 'next-intl'
import { useEffect, useId, useRef, useState } from 'react'

import { Icon } from '@/components/icon'

type MoreMenuProps = {
  /** Names the button for screen readers: whose post or comment it is. */
  label: string
  mine: boolean
  reported: boolean
  onReport: () => void
  /** Deletes it; false when that did not work. */
  onDelete: () => Promise<boolean>
  /** Asked before deleting:「删除这条动态？」. */
  confirm: string
  /** Under the question when deleting takes more with it: the replies under a comment. */
  confirmNote?: string
  /** A comment's menu is a size smaller than a post's. */
  small?: boolean
}

/** 「更多」on a post or a comment: delete one's own (asked twice), or report someone else's. */
export function MoreMenu({ label, mine, reported, onReport, onDelete, confirm, confirmNote, small = false }: MoreMenuProps) {
  const t = useTranslations('circles')
  const [open, setOpen] = useState(false)
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const menuId = useId()

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      if (!box.current?.contains(event.target as Node)) {
        setOpen(false)
        setConfirming(false)
      }
    }
    document.addEventListener('pointerdown', onPointer)
    return () => document.removeEventListener('pointerdown', onPointer)
  }, [open])

  async function confirmDelete() {
    setBusy(true)
    setFailed(false)
    const ok = await onDelete()
    setBusy(false)
    if (!ok) setFailed(true)
  }

  const item = 'flex min-h-10 w-full items-center rounded-thumb px-3 text-left text-ui hover:bg-surface disabled:opacity-60'
  return (
    <div
      ref={box}
      className="relative flex-none"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && open) {
          event.stopPropagation()
          setOpen(false)
          setConfirming(false)
        }
      }}
    >
      <button
        type="button"
        onClick={() => {
          setOpen(!open)
          setConfirming(false)
        }}
        aria-expanded={open}
        aria-controls={menuId}
        aria-label={label}
        className={`flex items-center justify-center rounded-pill text-ink-4 hover:bg-surface hover:text-ink ${small ? 'size-8' : 'size-9'}`}
      >
        <Icon name="more" size={small ? 16 : 18} />
      </button>
      {open && (
        <div
          id={menuId}
          className={`absolute right-0 z-10 flex w-max min-w-36 flex-col rounded-tile border border-hairline bg-overlay p-1 shadow-float ${small ? 'top-9' : 'top-10'}`}
        >
          {mine ? (
            confirming ? (
              <div role="group" aria-label={confirm} className="flex max-w-64 flex-col gap-1 p-2">
                <span className="text-meta text-ink-2">{confirm}</span>
                {confirmNote && <span className="text-small text-ink-4">{confirmNote}</span>}
                <div className="flex gap-3">
                  <button type="button" onClick={confirmDelete} disabled={busy} className="h-8 text-meta font-medium text-down hover:underline disabled:opacity-60">
                    {t('deleteYes')}
                  </button>
                  <button type="button" onClick={() => setConfirming(false)} disabled={busy} className="h-8 text-meta text-link hover:underline disabled:opacity-60">
                    {t('cancel')}
                  </button>
                </div>
                {failed && (
                  <span role="alert" className="text-small text-down">
                    {t('errors.failed')}
                  </span>
                )}
              </div>
            ) : (
              <button type="button" onClick={() => setConfirming(true)} className={item}>
                {t('delete')}
              </button>
            )
          ) : (
            <button
              type="button"
              disabled={reported}
              onClick={() => {
                setOpen(false)
                onReport()
              }}
              className={item}
            >
              {reported ? t('reported') : t('report')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
