import { readFileSync } from 'node:fs'

import { expect, test } from '@playwright/test'

import type enMessages from '../../messages/en.json'
import { createMember } from './member'

type Messages = typeof enMessages

const load = (name: string): Messages =>
  JSON.parse(readFileSync(new URL(`../../messages/${name}.json`, import.meta.url), 'utf8')) as Messages

const en = load('en')

test('the Skills list opens', async ({ page }) => {
  const response = await page.goto('/en/resources')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1, name: en.resources.title })).toBeVisible()
  await expect(page.getByRole('search')).toBeVisible()
  await expect(page.getByRole('navigation', { name: en.resources.categoriesLabel })).toBeVisible()
})

test('unknown Skills, versions and pages answer 404', async ({ page, request }) => {
  for (const path of ['/en/resources?page=0', '/en/resources?page=x', '/en/resources/skills/not-a-skill', '/en/resources/skills/not-a-skill/v/1.0.0']) {
    const response = await page.goto(path)
    expect(response?.status(), path).toBe(404)
  }
  for (const path of ['/api/skills/not-a-skill/install.md', '/api/skills/not-a-skill/1.0.0.zip']) {
    const response = await request.get(path, { maxRedirects: 0 })
    expect(response.status(), path).toBe(404)
  }
})

test('the install guide gives the steps, the directories and how to check a download', async ({ page }) => {
  const response = await page.goto('/en/resources/guide')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1, name: en.resources.guide.title })).toBeVisible()
  const hosts = page.getByRole('region', { name: en.resources.guide.hosts.title })
  await expect(hosts.getByRole('heading', { level: 3, name: 'Claude Code' })).toBeVisible()
  await expect(hosts.getByText('~/.claude/skills/')).toBeVisible()
  const verify = page.getByRole('region', { name: en.resources.guide.verify.title })
  await expect(verify.getByText(`shasum -a 256 ${en.resources.guide.verify.file}`)).toBeVisible()
})

test('the submissions API takes members from IFAI’s own pages only', async ({ request }) => {
  const submission = { repository: 'https://github.com/acme/smoke-skill', note: 'Writes release notes', email: 'dev@example.com', locale: 'en' }
  const visitor = await request.post('/api/resources/submissions', { data: submission })
  expect(visitor.status()).toBe(401)
  expect(visitor.headers()['cache-control']).toBe('private, no-store')
  const fromElsewhere = await request.post('/api/resources/submissions', { data: submission, headers: { 'sec-fetch-site': 'cross-site' } })
  expect(fromElsewhere.status()).toBe(403)
  const wrong = await request.post('/api/resources/submissions', { data: { ...submission, repository: 'https://gitlab.com/acme/x', email: 'nope' } })
  expect(wrong.status()).toBe(400)
  expect(await wrong.json()).toEqual({ error: 'invalid', fields: ['repository', 'email'] })
})

test('the publishing guide asks a visitor to sign in before sending a Skill', async ({ page }) => {
  const response = await page.goto('/en/resources/submit')
  expect(response?.status()).toBe(200)
  await expect(page.getByRole('heading', { level: 1, name: en.resources.submit.title })).toBeVisible()
  await expect(page.getByRole('region', { name: en.resources.submit.before.title })).toBeVisible()
  const form = page.getByRole('region', { name: en.resources.submit.form.title })
  await expect(form.getByText(en.resources.submit.form.signIn)).toBeVisible()
  await expect(form.getByLabel(en.resources.submit.form.repository)).toHaveCount(0)
})

test('a member sends a Skill and gets its number', async ({ page, context, baseURL }) => {
  test.skip(
    !process.env.DATABASE_URI || !process.env.BETTER_AUTH_SECRET,
    'Signs members in through the database: needs DATABASE_URI and BETTER_AUTH_SECRET, as in CI.',
  )
  const f = en.resources.submit.form
  const member = await createMember(baseURL ?? 'http://localhost:3000')
  try {
    await context.addCookies([member.cookie])
    await page.goto('/en/resources/submit')
    const form = page.getByRole('region', { name: f.title })
    await expect(form.getByLabel(f.email)).toHaveValue(/^smoke-.+@example\.com$/)

    // Checked before sending: the first wrong field gets the focus.
    await form.getByRole('button', { name: f.send }).click()
    await expect(form.getByText(f.errors.repository)).toBeVisible()
    await expect(form.getByLabel(f.repository)).toBeFocused()

    // Pasted from the address bar, as people do.
    await form.getByLabel(f.repository).fill('github.com/acme/smoke-skill?tab=readme-ov-file')
    await form.getByLabel(f.note).fill('Writes release notes from merged pull requests')
    await form.getByRole('button', { name: f.send }).click()

    // 「提交成功」 takes the form's place and names the section.
    const sent = page.getByRole('region', { name: en.resources.submit.done.title })
    await expect(sent.getByRole('heading', { name: en.resources.submit.done.title })).toBeFocused()
    await expect(sent.getByText('acme/smoke-skill', { exact: true })).toBeVisible()
    await expect(sent.getByRole('listitem').filter({ hasText: en.resources.submit.done.steps.review })).toHaveAttribute('aria-current', 'step')
    const number = (await sent.getByText(/^Submission number S-\d{4}-\d{2,}$/).textContent())?.replace('Submission number ', '')

    // The same repository again while it waits: the same submission.
    const again = await page.request.post('/api/resources/submissions', {
      data: { repository: 'https://github.com/acme/smoke-skill', note: 'Again', email: 'dev@example.com', locale: 'en' },
    })
    expect(again.status()).toBe(200)
    expect((await again.json()).code).toBe(number)

    await sent.getByRole('button', { name: en.resources.submit.done.again }).click()
    await expect(form.getByLabel(f.repository)).toHaveValue('')
    await expect(form.getByLabel(f.repository)).toBeFocused()
  } finally {
    await member.remove()
  }
})

test('the list leads to the publishing guide from the top and the side', async ({ page }) => {
  await page.goto('/en/resources')
  await expect(page.getByRole('main').getByRole('link', { name: en.resources.submit.button })).toHaveAttribute('href', '/en/resources/submit')
  const card = page.getByRole('region', { name: en.resources.submit.card.title })
  await expect(card.getByRole('link', { name: `${en.resources.submit.card.link} ›` })).toHaveAttribute('href', '/en/resources/submit')
})

// Needs the sample Skills from scripts/seed-skills.ts: CI adds them; preview databases don't have them.
test.describe('with the sample Skills', () => {
  test.skip(!process.env.E2E_SAMPLE_SKILLS, 'Run `pnpm payload run scripts/seed-skills.ts` and set E2E_SAMPLE_SKILLS=1.')

  const names = /^(Release Notes Writer|SQL Helper|Draft Sample Skill|Delisted Sample Skill)$/

  test('lists published Skills, certified first, and leaves drafts and delisted ones out', async ({ page }) => {
    await page.goto('/en/resources')
    const main = page.getByRole('main')
    await expect(main.getByRole('article').getByRole('link', { name: names })).toHaveText(['Release Notes Writer', 'SQL Helper'])
    await expect(main.getByText('Draft Sample Skill')).toHaveCount(0)
    await expect(main.getByText('Delisted Sample Skill')).toHaveCount(0)

    await main.getByRole('navigation', { name: en.resources.sortLabel }).getByRole('link', { name: en.resources.sorts.rising }).click()
    await expect(page).toHaveURL(/\/en\/resources\?sort=rising$/)
    await expect(main.getByRole('article').getByRole('link', { name: names })).toHaveText(['SQL Helper', 'Release Notes Writer'])
  })

  test('the list ranks the most installed, and shows 本周飙升 only with three rising Skills', async ({ page }) => {
    await page.goto('/en/resources')
    // Only SQL Helper is rising (40 installs, then 140); Release Notes Writer fell from 120 to 96.
    await expect(page.getByRole('heading', { name: en.resources.steps.title })).toBeVisible()
    await expect(page.getByRole('region', { name: en.resources.risers.title })).toHaveCount(0)

    const ranking = page.getByRole('region', { name: en.resources.ranking.title })
    await expect(ranking.getByRole('list').getByRole('link')).toHaveText([/Release Notes Writer/, /SQL Helper/])
    await expect(ranking.getByRole('link', { name: en.resources.ranking.all })).toHaveAttribute('href', '/en/resources?sort=installs')
  })

  test('search and filters narrow the list through the address', async ({ page }) => {
    await page.goto('/en/resources')
    const main = page.getByRole('main')
    await main.getByRole('searchbox', { name: en.resources.searchLabel }).fill('sql')
    await main.getByRole('searchbox', { name: en.resources.searchLabel }).press('Enter')
    await expect(page).toHaveURL(/\/en\/resources\?q=sql$/)
    await expect(main.getByRole('article').getByRole('link', { name: names })).toHaveText(['SQL Helper'])

    await page.goto('/en/resources')
    await main.getByRole('list', { name: en.resources.filtersLabel }).getByRole('link', { name: en.resources.filters.noKey }).click()
    await expect(page).toHaveURL(/\/en\/resources\?nokey=1$/)
    await expect(main.getByRole('article').getByRole('link', { name: names })).toHaveText(['Release Notes Writer'])

    await page.goto('/en/resources?q=zzzz')
    await expect(main.getByText(en.resources.noMatchTitle.replace('{q}', 'zzzz'))).toBeVisible()
  })

  test('a slow list keeps the page and puts a skeleton, then a retry, where the results were', async ({ page }) => {
    await page.clock.install()
    // Once the page's scripts have run, a filter changes the list inside the page.
    await page.goto('/en/resources', { waitUntil: 'networkidle' })
    const main = page.getByRole('main')

    // Hold the next view of the list back, as a slow connection would.
    let release = (): void => undefined
    const held = new Promise<void>((resolve) => (release = resolve))
    await page.route(
      (url) => url.pathname === '/en/resources' && url.searchParams.has('_rsc'),
      async (route) => {
        await held
        await route.continue()
      },
    )

    await main.getByRole('list', { name: en.resources.filtersLabel }).getByRole('link', { name: en.resources.filters.noKey }).click()
    const skeleton = main.getByRole('status', { name: en.states.loadingList })
    await expect(skeleton).toBeVisible()
    await expect(main.getByRole('article')).toHaveCount(0)
    await expect(main.getByRole('navigation', { name: en.resources.categoriesLabel })).toBeVisible()
    await expect(main.getByRole('search')).toBeVisible()

    // After 10 s the skeleton gives way to a retry, and retrying brings it straight back.
    await page.clock.fastForward(10_000)
    await expect(main.getByRole('alert')).toContainText(en.states.failedTitle)
    await main.getByRole('button', { name: en.states.retry }).click()
    await expect(skeleton).toBeVisible()

    release()
    await expect(page).toHaveURL(/\/en\/resources\?nokey=1$/)
    await expect(main.getByRole('article').getByRole('link', { name: names })).toHaveText(['Release Notes Writer'])
    await expect(skeleton).toHaveCount(0)
  })

  test('a Skill’s page shows its skeleton while it comes in over a slow connection', async ({ page, context }) => {
    // As when the reader clicks before the list has prefetched the Skill.
    await page.route(/\/en\/resources\/skills\/[^/?]+\?_rsc=/, (route) => (route.request().headers()['next-router-prefetch'] ? route.abort() : route.fallback()))
    await page.goto('/en/resources', { waitUntil: 'networkidle' })
    const cdp = await context.newCDPSession(page)
    await cdp.send('Network.enable')
    await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 400, downloadThroughput: 12 * 1024, uploadThroughput: 12 * 1024 })

    await page.getByRole('main').getByRole('article').getByRole('link', { name: 'Release Notes Writer' }).first().click()
    const skeleton = page.getByRole('status', { name: en.states.loadingPage })
    await expect(skeleton).toBeVisible()
    await expect(page.getByRole('heading', { level: 1, name: 'Release Notes Writer' })).toBeVisible({ timeout: 20_000 })
    await expect(skeleton).toHaveCount(0)
  })

  test('the Skills the list shows are prefetched, so they open without waiting on the server', async ({ page }) => {
    await page.goto('/en/resources', { waitUntil: 'networkidle' })
    const fetched: string[] = []
    page.on('request', (request) => {
      if (request.url().includes('_rsc=') && !request.headers()['next-router-prefetch']) fetched.push(new URL(request.url()).pathname)
    })
    await page.getByRole('main').getByRole('article').getByRole('link', { name: 'Release Notes Writer' }).first().click()
    await expect(page.getByRole('heading', { level: 1, name: 'Release Notes Writer' })).toBeVisible()
    expect(fetched).toEqual([])
  })

  test('the detail page installs the current version', async ({ page }) => {
    const response = await page.goto('/en/resources/skills/sample-release-notes')
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('heading', { level: 1, name: 'Release Notes Writer' })).toBeVisible()

    const install = page.getByRole('region', { name: en.resources.install.title })
    const hosts = install.getByRole('radiogroup', { name: en.resources.install.hosts })
    await expect(hosts.getByRole('radio', { name: 'Claude Code' })).toHaveAttribute('aria-checked', 'true')
    await expect(install.getByText(/install\.md\?host=claude-code/)).toBeVisible()
    await hosts.getByRole('radio', { name: 'Codex' }).click()
    await expect(install.getByText(/install\.md\?host=codex/)).toBeVisible()
    await expect(install.getByRole('link', { name: en.resources.install.download })).toHaveAttribute(
      'href',
      '/api/skills/sample-release-notes/1.1.0.zip?host=codex',
    )

    const tabs = page.getByRole('tablist', { name: en.resources.tabs.label })
    await tabs.getByRole('tab', { name: new RegExp(`^${en.resources.tabs.files}`) }).click()
    await expect(page).toHaveURL(/#files$/)
    await expect(page.getByRole('tabpanel').getByRole('link', { name: 'style.md' })).toBeVisible()
    await tabs.getByRole('tab', { name: new RegExp(`^${en.resources.tabs.versions}`) }).click()
    await expect(page.getByRole('tabpanel').getByText('Wrote to the wrong file.')).toBeVisible()
  })

  test('a withdrawn version keeps its page but cannot be installed', async ({ page, request }) => {
    const response = await page.goto('/en/resources/skills/sample-release-notes/v/0.9.0')
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('note').filter({ hasText: en.resources.withdrawn.replace('{version}', '0.9.0') })).toBeVisible()
    await expect(page.getByRole('button', { name: en.resources.install.copy })).toBeDisabled()

    for (const path of ['/api/skills/sample-release-notes/0.9.0.zip', '/api/skills/sample-release-notes/install.md?v=0.9.0']) {
      expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(404)
    }
    expect((await request.get('/api/skill-versions/file/sample-release-notes-0.9.0.zip')).status()).toBe(403)
  })

  test('a delisted Skill keeps its page with the reason, and nothing of it installs', async ({ page, request }) => {
    const response = await page.goto('/en/resources/skills/sample-delisted-skill')
    expect(response?.status()).toBe(200)
    await expect(page.getByRole('note').filter({ hasText: en.resources.delisted })).toContainText('Taken down at the author’s request.')
    await expect(page.getByRole('region', { name: en.resources.install.title })).toHaveCount(0)

    // The last one is the stored file's own address, which only the Zip route redirects to.
    const answers = {
      '/api/skills/sample-delisted-skill/install.md': 404,
      '/api/skills/sample-delisted-skill/1.0.0.zip': 404,
      '/api/skill-versions/file/sample-delisted-skill-1.0.0.zip': 403,
    }
    for (const [path, status] of Object.entries(answers)) {
      expect((await request.get(path, { maxRedirects: 0 })).status(), path).toBe(status)
    }
    expect((await request.post('/api/skills/sample-delisted-skill/installs', { data: { version: '1.0.0' } })).status()).toBe(404)
  })

  test('install.md gives the Zip and its fingerprint, and the Zip matches it', async ({ request }) => {
    const md = await request.get('/api/skills/sample-release-notes/install.md?host=codex')
    expect(md.status()).toBe(200)
    expect(md.headers()['content-type']).toContain('text/markdown')
    const text = await md.text()
    expect(text).toContain('(sample-release-notes v1.1.0)')
    expect(text).toContain('/api/skills/sample-release-notes/1.1.0.zip?via=install')
    expect(text.indexOf('### Codex')).toBeLessThan(text.indexOf('### Claude Code'))
    const sha256 = /- sha256: ([0-9a-f]{64})/.exec(text)?.[1]
    expect(sha256).toBeTruthy()

    const redirect = await request.get('/api/skills/sample-release-notes/1.1.0.zip', { maxRedirects: 0 })
    expect(redirect.status()).toBe(302)
    const zip = await request.get('/api/skills/sample-release-notes/1.1.0.zip')
    expect(zip.status()).toBe(200)
    const body = await zip.body()
    expect(body.subarray(0, 2).toString()).toBe('PK')
    const { createHash } = await import('node:crypto')
    expect(createHash('sha256').update(body).digest('hex')).toBe(sha256)
  })

  test('copying the instruction is counted for a version that installs', async ({ request }) => {
    const ok = await request.post('/api/skills/sample-sql-helper/installs', { data: { version: '2.0.0', host: 'codex' } })
    expect(ok.status()).toBe(204)
    const wrong = await request.post('/api/skills/sample-sql-helper/installs', { data: { version: '1.1.0' } })
    expect(wrong.status()).toBe(404)
    const fromElsewhere = await request.post('/api/skills/sample-sql-helper/installs', {
      data: { version: '2.0.0' },
      headers: { 'sec-fetch-site': 'cross-site' },
    })
    expect(fromElsewhere.status()).toBe(403)
  })

  test('the guide shows install notes in the reader’s language, and the pages link to it', async ({ page }) => {
    const zh = load('zh-hans')
    await page.goto('/zh-hans/resources/guide')
    await expect(page.getByText('示例说明：放好文件夹后，新开一个会话。')).toHaveAttribute('lang', 'zh-Hans')
    // Japanese has no note of its own: the English one shows, marked as English.
    await page.goto('/ja/resources/guide')
    await expect(page.getByText('Sample note: start a new session after adding the folder.')).toHaveAttribute('lang', 'en')

    await page.goto('/zh-hans/resources')
    await page.getByRole('link', { name: `${zh.resources.steps.guide} ›` }).click()
    await expect(page).toHaveURL(/\/zh-hans\/resources\/guide$/)
    await page.goto('/en/resources/skills/sample-release-notes')
    await expect(page.getByRole('link', { name: `${en.resources.fingerprint.verify} ›` })).toHaveAttribute('href', '/en/resources/guide#verify')
  })

  test('the home page shows the newest Skills', async ({ page }) => {
    await page.goto('/en')
    const section = page.getByRole('region', { name: en.home.newSkills })
    await expect(section.getByRole('link', { name: /^(Release Notes Writer|SQL Helper)/ })).toHaveCount(2)
  })
})
