'use client'

import { useSyncExternalStore, type ReactNode } from 'react'

import { Icon } from '@/components/icon'

type View = 'list' | 'grid'

const storageKey = 'ifai:skills-view'
const listeners = new Set<() => void>()

function readView(): View {
  try {
    return window.localStorage.getItem(storageKey) === 'grid' ? 'grid' : 'list'
  } catch {
    return 'list'
  }
}

function saveView(view: View) {
  try {
    window.localStorage.setItem(storageKey, view)
  } catch {
    // Private mode or storage turned off: the choice lasts until the page is left.
  }
  for (const listener of listeners) listener()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  window.addEventListener('storage', listener)
  return () => {
    listeners.delete(listener)
    window.removeEventListener('storage', listener)
  }
}

type ViewSwitchProps = {
  labels: { group: string; list: string; grid: string }
  /** The sort tabs and anything else that sits on the toggle's row. */
  toolbar: ReactNode
  children: ReactNode
}

/** List or grid, remembered in this browser (docs/specs/resources.md「页面与路由」). The list is rendered once; CSS lays it out. */
export function ViewSwitch({ labels, toolbar, children }: ViewSwitchProps) {
  const view = useSyncExternalStore(subscribe, readView, () => 'list' as View)
  const button = (value: View, label: string) => (
    <button
      type="button"
      aria-pressed={view === value}
      aria-label={label}
      onClick={() => saveView(value)}
      className={`flex size-8 items-center justify-center rounded-btn transition-colors ${view === value ? 'bg-bg text-ink shadow-divider' : 'text-ink-4 hover:text-ink'}`}
    >
      <Icon name={value} size={16} />
    </button>
  )

  return (
    <div data-view={view} className="group/view flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3">
        {toolbar}
        <div role="group" aria-label={labels.group} className="hidden flex-none gap-0.5 rounded-thumb bg-surface p-0.5 md:flex">
          {button('list', labels.list)}
          {button('grid', labels.grid)}
        </div>
      </div>
      {children}
    </div>
  )
}
