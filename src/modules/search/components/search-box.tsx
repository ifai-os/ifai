import Form from 'next/form'
import { useTranslations } from 'next-intl'

import { Icon } from '@/components/icon'
import type { Locale } from '@/i18n/config'
import { getPathname, Link } from '@/i18n/navigation'

import { maxQueryLength, searchHref, type SearchType } from '../params'

type SearchBoxProps = {
  locale: Locale
  q?: string
  /** A new search keeps to the tab shown. */
  type?: SearchType
  /** Only on the search page with nothing searched yet: the reader came here to type. */
  autoFocus?: boolean
  className?: string
}

/**
 * The pill-shaped box from the「空状态与加载状态」board (搜索无结果, 页面不存在). A plain GET
 * form to the search page, so it also works before JavaScript loads.
 */
export function SearchBox({ locale, q = '', type = 'all', autoFocus = false, className = '' }: SearchBoxProps) {
  const t = useTranslations('search')

  return (
    <Form
      action={getPathname({ href: '/search', locale })}
      role="search"
      className={`flex h-11 w-full items-center gap-1 rounded-pill border border-surface-2 bg-bg pr-1.5 pl-1 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-link ${className}`}
    >
      <button
        type="submit"
        aria-label={t('submit')}
        className="flex size-9 flex-none items-center justify-center rounded-pill text-ink-2 hover:text-ink"
      >
        <Icon name="search" size={18} />
      </button>
      <input
        type="search"
        name="q"
        defaultValue={q}
        maxLength={maxQueryLength}
        enterKeyHint="search"
        autoFocus={autoFocus}
        aria-label={t('label')}
        placeholder={t('placeholder')}
        className="min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-ink-4 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {type !== 'all' && <input type="hidden" name="type" value={type} />}
      {q && (
        <Link
          href={searchHref({ type })}
          aria-label={t('clear')}
          className="flex size-8 flex-none items-center justify-center rounded-pill bg-line text-ink-2 hover:text-ink"
        >
          <Icon name="close" size={14} strokeWidth={2} />
        </Link>
      )}
    </Form>
  )
}
