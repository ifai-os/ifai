'use client'

import { useEffect, useRef, useSyncExternalStore, type KeyboardEvent, type ReactNode } from 'react'

export type DetailTabId = 'overview' | 'heat' | 'reviews' | 'alternatives'

export type DetailTab = {
  id: DetailTabId
  label: string
  /** Ids in the tab: an address with one of them (#faqs, #heat) opens it. */
  anchors: string[]
}

/** A part of the page and the tab it goes in. A tab can have two: on phones 概览's FAQ comes after 热度. */
export type DetailPart = { tab: DetailTabId; content: ReactNode }

/** Tailwind's `md`, where the tabs start. */
const wide = '(min-width: 48rem)'
/** Pressing a tab changes the address without a hashchange; this has the tabs read it again. */
const tabChange = 'app-detail-tab'

function subscribeAddress(listener: () => void) {
  window.addEventListener('hashchange', listener)
  window.addEventListener(tabChange, listener)
  return () => {
    window.removeEventListener('hashchange', listener)
    window.removeEventListener(tabChange, listener)
  }
}

function subscribeWidth(listener: () => void) {
  const query = window.matchMedia(wide)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}

const anchorNow = () => window.location.hash.slice(1)
const isWide = () => window.matchMedia(wide).matches

/**
 * An app's page under the header (docs/specs/apps.md「第 6 步」). On wider screens the parts are
 * in tabs, 概览 / 热度 / 评价 / 替代品, with the open one in the address (#heat …); on phones
 * they stay one long page, without tabs. Every part is in the page from the start, only hidden,
 * so the page stays static and crawlers see all of it.
 */
export function DetailTabs({ label, tabs, parts }: { label: string; tabs: DetailTab[]; parts: DetailPart[] }) {
  const tablist = useRef<HTMLDivElement>(null)
  const anchor = useSyncExternalStore(subscribeAddress, anchorNow, () => '')
  // The page is rendered as on wider screens; on phones the tab roles go once it runs.
  const tabbed = useSyncExternalStore(subscribeWidth, isWide, () => true)
  const first = tabs[0].id
  const current = tabs.find((tab) => tab.anchors.includes(anchor))?.id ?? first

  // app-panel-overview, then app-panel-overview-2 for a tab's second part.
  const counts = new Map<DetailTabId, number>()
  const partIds = parts.map(({ tab }) => {
    const count = (counts.get(tab) ?? 0) + 1
    counts.set(tab, count)
    return count === 1 ? `app-panel-${tab}` : `app-panel-${tab}-${count}`
  })

  // An address from opening the page or from a link: its tab is open by now, so go there. A
  // tab's own address goes to the tabs on wider screens, a place inside one to its heading.
  useEffect(() => {
    function reveal() {
      const id = anchorNow()
      if (!id) return
      requestAnimationFrame(() => {
        const target = document.getElementById(id)
        if (!target?.closest('[data-detail-part]')) return
        const toTabs = isWide() && document.getElementById(`app-tab-${id}`)
        ;(toTabs ? tablist.current : target)?.scrollIntoView()
      })
    }
    reveal()
    window.addEventListener('hashchange', reveal)
    return () => window.removeEventListener('hashchange', reveal)
  }, [])

  function open(id: DetailTabId) {
    const { pathname, search } = window.location
    window.history.replaceState(null, '', id === first ? pathname + search : `#${id}`)
    window.dispatchEvent(new Event(tabChange))
  }

  function onKeyDown(event: KeyboardEvent, index: number) {
    const moves: Record<string, number> = { ArrowLeft: index - 1, ArrowRight: index + 1, Home: 0, End: tabs.length - 1 }
    if (!(event.key in moves)) return
    event.preventDefault()
    const next = tabs[(moves[event.key] + tabs.length) % tabs.length].id
    open(next)
    document.getElementById(`app-tab-${next}`)?.focus()
  }

  return (
    <div className="flex flex-col">
      <div
        ref={tablist}
        role="tablist"
        aria-label={label}
        className="hidden scroll-mt-20 flex-wrap gap-x-7 border-b border-line md:flex"
      >
        {tabs.map((tab, index) => {
          const selected = tab.id === current
          return (
            <button
              key={tab.id}
              id={`app-tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={partIds.filter((_, part) => parts[part].tab === tab.id).join(' ')}
              tabIndex={selected ? 0 : -1}
              onClick={() => open(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`-mb-px min-h-12 border-b-2 text-title whitespace-nowrap transition-colors ${
                selected ? 'border-ink text-ink' : 'border-transparent text-ink-4 hover:text-ink'
              }`}
            >
              {tab.label}
            </button>
          )
        })}
      </div>
      <div className="flex flex-col gap-8 md:gap-7 md:pt-7">
        {parts.map((part, index) => (
          <div
            key={partIds[index]}
            id={partIds[index]}
            data-detail-part=""
            role={tabbed ? 'tabpanel' : undefined}
            aria-labelledby={tabbed ? `app-tab-${part.tab}` : undefined}
            className={`flex flex-col gap-8 md:gap-7 ${part.tab === current ? '' : 'md:hidden'}`}
          >
            {part.content}
          </div>
        ))}
      </div>
    </div>
  )
}
