'use client'

import { useSyncExternalStore, type ReactNode } from 'react'

type Tab = { id: string; label: string; count?: string }

function subscribe(listener: () => void) {
  window.addEventListener('hashchange', listener)
  return () => window.removeEventListener('hashchange', listener)
}

/**
 * 概述 / 文件 / 版本记录 / 安全检测. The open tab is in the address (#files …) so it can be
 * shared; every panel is in the page from the start, only hidden, so find-in-page and
 * crawlers see all of it.
 */
export function DetailTabs({ label, tabs, children }: { label: string; tabs: Tab[]; children: ReactNode[] }) {
  const ids = tabs.map((tab) => tab.id)
  const current = useSyncExternalStore(
    subscribe,
    () => {
      const hash = window.location.hash.slice(1)
      return ids.includes(hash) ? hash : ids[0]
    },
    () => ids[0],
  )

  function open(id: string) {
    window.history.replaceState(null, '', id === ids[0] ? window.location.pathname + window.location.search : `#${id}`)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  }

  function onKeyDown(event: React.KeyboardEvent, index: number) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0
    if (!step) return
    event.preventDefault()
    const next = ids[(index + step + ids.length) % ids.length]
    open(next)
    document.getElementById(`tab-${next}`)?.focus()
  }

  return (
    <div className="flex flex-col gap-5">
      <div role="tablist" aria-label={label} className="-mx-4 flex gap-6 overflow-x-auto border-b border-surface-2 px-4 md:mx-0 md:px-0">
        {tabs.map((tab, index) => {
          const selected = tab.id === current
          return (
            <button
              key={tab.id}
              id={`tab-${tab.id}`}
              type="button"
              role="tab"
              aria-selected={selected}
              aria-controls={`panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => open(tab.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`-mb-px flex h-11 flex-none items-center gap-1.5 border-b-2 text-ui whitespace-nowrap ${selected ? 'border-ink font-medium text-ink' : 'border-transparent text-ink-4 hover:text-ink'}`}
            >
              {tab.label}
              {tab.count && <span className="text-small text-ink-4 tabular-nums">{tab.count}</span>}
            </button>
          )
        })}
      </div>
      {tabs.map((tab, index) => (
        <div key={tab.id} id={`panel-${tab.id}`} role="tabpanel" aria-labelledby={`tab-${tab.id}`} hidden={tab.id !== current}>
          {children[index]}
        </div>
      ))}
    </div>
  )
}
