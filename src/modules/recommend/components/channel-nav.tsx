import { useTranslations } from 'next-intl'

import { ListLink } from '@/components/states/list-navigation'

import { articleChannels, listHref, type ArticleChannel, type ArticleTab } from '../rules'

/**
 * 综合 plus the seven channels (docs/specs/recommend.md 规则 3): a column beside the list with a
 * red dot by the current one, as the daily's categories; on phones a row of chips that scrolls
 * sideways. Changing channel keeps the tab and drops the tag and page.
 */
export function ChannelNav({ current, tab }: { current: ArticleChannel | null; tab: ArticleTab }) {
  const t = useTranslations('recommend')
  const names = useTranslations('recommend.channels')
  const items: { key: ArticleChannel | null; name: string }[] = [
    { key: null, name: t('allChannels') },
    ...articleChannels.map((key) => ({ key, name: names(key) })),
  ]

  return (
    <nav aria-label={t('channelsLabel')} className="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
      <ul className="flex gap-2 md:flex-col md:gap-0.5">
        {items.map((item) => {
          const active = item.key === current
          return (
            <li key={item.key ?? 'all'} className="flex-none">
              <ListLink
                href={listHref({ tab, channel: item.key })}
                aria-current={active ? 'page' : undefined}
                className={`flex h-8.5 items-center gap-2.5 rounded-pill border px-3.5 text-meta whitespace-nowrap transition-colors md:h-auto md:min-h-11 md:rounded-none md:border-0 md:bg-transparent md:px-0 md:text-title md:whitespace-normal ${
                  active ? 'border-ink bg-ink text-bg md:text-ink' : 'border-line bg-bg text-ink-2 hover:border-ink-4 md:text-ink-4 md:hover:text-ink'
                }`}
              >
                <span aria-hidden="true" className={`hidden size-1.5 flex-none rounded-pill md:block ${active ? 'bg-accent' : ''}`} />
                {item.name}
              </ListLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
