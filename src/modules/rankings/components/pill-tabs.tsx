import { Link } from '@/i18n/navigation'

export type PillTab = { key: string; name: string; href: `/${string}` }

type PillTabsProps = {
  /** What the row picks, for screen readers:「赛道」「榜单」. */
  label: string
  items: PillTab[]
  current: string
}

/**
 * A row of pill links, the current one black: the arenas of the blind test, the boards of an
 * outside source. Links, so every tab has its own address; scrolls sideways when it does not fit.
 */
export function PillTabs({ label, items, current }: PillTabsProps) {
  if (items.length < 2) return null

  return (
    <nav aria-label={label} className="-mx-4 overflow-x-auto px-4 pb-1">
      <ul className="flex gap-2">
        {items.map((item) => {
          const active = item.key === current
          return (
            <li key={item.key} className="flex-none">
              <Link
                href={item.href}
                aria-current={active ? 'page' : undefined}
                scroll={false}
                className={`flex h-10 items-center rounded-pill border px-4 text-ui font-medium transition-colors ${
                  active ? 'border-ink bg-ink text-bg' : 'border-line bg-bg text-ink hover:border-ink-4'
                }`}
              >
                {item.name}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
