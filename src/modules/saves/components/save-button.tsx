'use client'

import { useFormatter, useTranslations } from 'next-intl'

import { Icon } from '@/components/icon'

import { useSave } from './save-provider'

type SaveButtonProps = {
  /** Size, shape and border; the text is black, or red once saved. */
  className: string
  /** The phone bar's button: a bookmark before the label and the count after it. */
  withCount?: boolean
  /** Only the bookmark; the label is for screen readers (the Skill page's phone bar). */
  iconOnly?: boolean
}

/** 收藏 / 已收藏 for the thing in the SaveProvider around it. */
export function SaveButton({ className, withCount = false, iconOnly = false }: SaveButtonProps) {
  const t = useTranslations('saves')
  const format = useFormatter()
  const { saved, count, toggle } = useSave()

  if (iconOnly) {
    return (
      <button type="button" aria-pressed={saved} onClick={toggle} className={`${className} ${saved ? 'text-accent-ink' : 'text-ink'}`}>
        <Icon name="bookmark" size={20} fill={saved ? 'currentColor' : 'none'} />
        <span className="sr-only">{saved ? t('saved') : t('save')}</span>
      </button>
    )
  }

  return (
    <button type="button" aria-pressed={saved} onClick={toggle} className={`${className} ${saved ? 'text-accent-ink' : 'text-ink'}`}>
      {withCount && <Icon name="bookmark" size={18} fill={saved ? 'currentColor' : 'none'} />}
      {saved ? t('saved') : t('save')}
      {withCount && count !== null && count > 0 && (
        <>
          <span aria-hidden="true" className="font-normal text-ink-4 tabular-nums">
            {format.number(count)}
          </span>
          <span className="sr-only">{t('count', { count })}</span>
        </>
      )}
    </button>
  )
}

/** 「· 1,284 人收藏」 after a page's other facts; nothing until someone has saved it. */
export function SaveCount({ className }: { className?: string }) {
  const t = useTranslations('saves')
  const { count } = useSave()
  if (!count) return null
  return <span className={className}> · {t('count', { count })}</span>
}
