import { expect, test, type APIRequestContext } from '@playwright/test'

async function xml(request: APIRequestContext, path: string): Promise<string> {
  const response = await request.get(path)
  expect(response.status()).toBe(200)
  expect(response.headers()['content-type']).toContain('xml')
  return response.text()
}

test('robots.txt blocks only what is not a page and points at the sitemap', async ({ request }) => {
  const response = await request.get('/robots.txt')
  expect(response.status()).toBe(200)
  const text = await response.text()
  expect(text).toContain('Disallow: /admin')
  expect(text).toContain('Disallow: /api/')
  expect(text).toMatch(/Sitemap: https?:\/\/[^\s]+\/sitemap\.xml/)
})

test('the sitemap index lists one file per section', async ({ request }) => {
  const index = await xml(request, '/sitemap.xml')
  for (const section of ['pages', 'daily', 'apps', 'skills']) expect(index).toContain(`/sitemaps/${section}-1.xml</loc>`)
  expect((await request.get('/sitemaps/pages-2.xml')).status()).toBe(404)
  expect((await request.get('/sitemaps/other-1.xml')).status()).toBe(404)
})

test('the pages file lists the home page and the module lists in every language', async ({ request }) => {
  const pages = await xml(request, '/sitemaps/pages-1.xml')
  for (const prefix of ['/en', '/zh-hans', '/zh-hant', '/ja', '/ko']) {
    expect(pages).toMatch(new RegExp(`<loc>[^<]+${prefix}</loc>`))
    expect(pages).toContain(`${prefix}/daily</loc>`)
    expect(pages).toContain(`${prefix}/apps</loc>`)
    expect(pages).toContain(`${prefix}/resources/guide</loc>`)
  }
  expect(pages).toContain('hreflang="x-default"')
})

test.describe('with the sample content', () => {
  test.skip(
    !process.env.E2E_SAMPLE_STORIES || !process.env.E2E_SAMPLE_APPS || !process.env.E2E_SAMPLE_SKILLS,
    'Run the three seed scripts and set E2E_SAMPLE_STORIES, E2E_SAMPLE_APPS and E2E_SAMPLE_SKILLS.',
  )

  test('lists published items only', async ({ request }) => {
    const daily = await xml(request, '/sitemaps/daily-1.xml')
    expect(daily).toContain('/zh-hans/daily/sample-kitecode-opens-its-model-weights</loc>')
    expect(daily).not.toContain('sample-pending-story')
    expect(daily).not.toContain('sample-withdrawn-story')

    const apps = await xml(request, '/sitemaps/apps-1.xml')
    expect(apps).toContain('/ja/apps/lumen-chat</loc>')
    expect(apps).not.toContain('draft-demo')

    const skills = await xml(request, '/sitemaps/skills-1.xml')
    expect(skills).toContain('/ko/resources/skills/sample-sql-helper</loc>')
    expect(skills).not.toContain('sample-delisted-skill')
    expect(skills).not.toContain('sample-draft-skill')
    expect(skills).not.toContain('/v/')
  })
})
