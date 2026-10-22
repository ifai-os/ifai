import { NextIntlClientProvider } from 'next-intl'
import type { ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { EmptyState } from '@/components/states/empty-state'
import { CardSkeleton, ListSkeleton } from '@/components/states/skeleton'

import en from '../../messages/en.json'

const render = (element: ReactElement) =>
  renderToStaticMarkup(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      {element}
    </NextIntlClientProvider>,
  )

describe('ListSkeleton', () => {
  it('is one status region with as many rows as asked for, and no text', () => {
    const html = render(<ListSkeleton rows={3} />)
    expect(html).toContain(`role="status" aria-label="${en.states.loadingList}"`)
    expect(html.match(/grid-cols-\[44px_minmax\(0,1fr\)_36px\]/g)).toHaveLength(3)
    expect(html.match(/class="skeleton/g)).toHaveLength(3 * 4)
    expect(html.replace(/<[^>]+>/g, '')).toBe('')
  })
})

describe('CardSkeleton', () => {
  it('draws a 16:9 image block per card', () => {
    const html = render(<CardSkeleton count={2} />)
    expect(html).toContain(`aria-label="${en.states.loadingCards}"`)
    expect(html.match(/aspect-video/g)).toHaveLength(2)
  })
})

describe('EmptyState', () => {
  it('falls back to the shared title and keeps the icon out of the accessibility tree', () => {
    const html = render(<EmptyState body="Save something first" />)
    expect(html).toContain(en.states.emptyTitle)
    expect(html).toContain('Save something first')
    expect(html).toContain('aria-hidden="true"')
    expect(html).not.toContain('role="alert"')
  })

  it('renders the actions it is given', () => {
    const html = render(
      <EmptyState title="No saved items">
        <button type="button">Read the Daily</button>
      </EmptyState>,
    )
    expect(html).toContain('No saved items')
    expect(html).toContain('<button type="button">Read the Daily</button>')
  })
})
