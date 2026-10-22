import Form from 'next/form'
import { useTranslations } from 'next-intl'

import { Icon } from '@/components/icon'
import type { Locale } from '@/i18n/config'
import { getPathname, Link } from '@/i18n/navigation'

import { listHref } from '../list-params'

type SearchFormProps = {
  locale: Locale
  /** Searching inside a category keeps to that category. */
  category: string | null
  q: string
}

/** Search box above the categories; a plain GET form, so it also works before JavaScript loads. */
export function SearchForm({ locale, category, q }: SearchFormProps) {
  const t = useTranslations('apps')
  const action = getPathname({ href: listHref({ category }), locale })

  return (
    <Form
      action={action}
      role="search"
      className="flex h-11 items-center gap-1 rounded-pill border border-surface-2 bg-surface pr-1.5 pl-1 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-link md:max-w-120"
    >
      <button
        type="submit"
        aria-label={t('searchSubmit')}
        className="flex size-9 flex-none items-center justify-center rounded-pill text-ink-2 hover:text-ink"
      >
        <Icon name="search" size={18} />
      </button>
      <input
        type="search"
        name="q"
        defaultValue={q}
        maxLength={64}
        enterKeyHint="search"
        aria-label={t('searchLabel')}
        placeholder={t('searchPlaceholder')}
        className="min-w-0 flex-1 bg-transparent text-body outline-none placeholder:text-ink-4 [&::-webkit-search-cancel-button]:appearance-none"
      />
      {q && (
        <Link
          href={listHref({ category })}
          aria-label={t('clearSearch')}
          className="flex size-8 flex-none items-center justify-center rounded-pill bg-line text-ink-2 hover:text-ink"
        >
          <Icon name="close" size={14} strokeWidth={2} />
        </Link>
      )}
    </Form>
  )
}
