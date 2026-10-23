import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'

import { DetailTabs, type DetailPart, type DetailTab } from '@/modules/apps/components/detail-tabs'

const tabs: DetailTab[] = [
  { id: 'overview', label: 'Overview', anchors: ['about', 'features', 'faqs'] },
  { id: 'heat', label: 'Heat', anchors: ['heat', 'mentions'] },
  { id: 'reviews', label: 'Reviews', anchors: ['reviews'] },
]

// As on an app's page: the FAQ is overview, but comes after the heat on phones.
const parts: DetailPart[] = [
  { tab: 'overview', content: <p>What it is</p> },
  { tab: 'heat', content: <p>The heat line</p> },
  { tab: 'overview', content: <p>Questions</p> },
  { tab: 'reviews', content: <p>What readers say</p> },
]

const html = renderToStaticMarkup(<DetailTabs label="About this app" tabs={tabs} parts={parts} />)

/** The opening tag of the element with this id. */
const tagOf = (id: string) => html.match(new RegExp(`<[a-z]+ [^>]*id="${id}"[^>]*>`))?.[0] ?? ''

describe('DetailTabs', () => {
  it('opens on the first tab, before the page knows its address', () => {
    expect(tagOf('app-tab-overview')).toContain('aria-selected="true"')
    expect(tagOf('app-tab-overview')).toContain('tabindex="0"')
    for (const id of ['heat', 'reviews']) {
      expect(tagOf(`app-tab-${id}`)).toContain('aria-selected="false"')
      expect(tagOf(`app-tab-${id}`)).toContain('tabindex="-1"')
    }
  })

  it('keeps every part in the page, in order, hiding the closed tabs only on wider screens', () => {
    expect(html.indexOf('What it is')).toBeLessThan(html.indexOf('The heat line'))
    expect(html.indexOf('The heat line')).toBeLessThan(html.indexOf('Questions'))
    expect(html.indexOf('Questions')).toBeLessThan(html.indexOf('What readers say'))
    expect(tagOf('app-panel-overview')).not.toContain('md:hidden')
    expect(tagOf('app-panel-overview-2')).not.toContain('md:hidden')
    expect(tagOf('app-panel-heat')).toContain('md:hidden')
    expect(tagOf('app-panel-reviews')).toContain('md:hidden')
    expect(html).not.toContain(' hidden=')
  })

  it("ties a tab to both of its parts, and each part to its tab", () => {
    expect(tagOf('app-tab-overview')).toContain('aria-controls="app-panel-overview app-panel-overview-2"')
    expect(tagOf('app-tab-heat')).toContain('aria-controls="app-panel-heat"')
    expect(tagOf('app-panel-overview-2')).toContain('role="tabpanel"')
    expect(tagOf('app-panel-overview-2')).toContain('aria-labelledby="app-tab-overview"')
  })

  it('shows the tabs only on wider screens', () => {
    expect(html).toMatch(/<div role="tablist" aria-label="About this app" class="hidden [^"]*md:flex/)
  })
})
