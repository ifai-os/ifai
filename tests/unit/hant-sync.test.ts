import { describe, expect, it } from 'vitest'

import { syncHantFromHans, toHantDeep } from '@/lib/i18n/hant-sync'

describe('toHantDeep', () => {
  it('converts text, hasMany text and array rows', () => {
    expect(toHantDeep('一句话生成演示文稿')).toBe('一句話生成簡報')
    expect(toHantDeep(['演示文稿', '办公软件'])).toEqual(['簡報', '辦公軟體'])
    expect(toHantDeep([{ id: 'abc', title: '视频剪辑', detail: null }])).toEqual([{ title: '影片剪輯', detail: null }])
  })

  it('drops array row ids so zh-Hant gets rows of its own', () => {
    const rows = toHantDeep([{ id: '1', question: '支持中文吗？', answer: '支持。' }]) as Record<string, unknown>[]
    expect(rows[0]).not.toHaveProperty('id')
  })

  it('keeps empty values empty, so zh-Hant falls back to English like zh-Hans', () => {
    expect(toHantDeep(null)).toBeNull()
    expect(toHantDeep(undefined)).toBeUndefined()
    expect(toHantDeep(3)).toBe(3)
  })
})

describe('syncHantFromHans', () => {
  type FakeReq = {
    locale: string
    fallbackLocale: string | false
    context: Record<string, unknown>
    query: { depth?: unknown }
    payload: Record<string, (args: Record<string, unknown>) => Promise<unknown>>
  }

  /** A request whose Local API calls change it the way Payload's createLocalReq does. */
  function fakeRequest(hans: Record<string, unknown>) {
    const updates: Record<string, unknown>[] = []
    const req: FakeReq = {
      locale: 'zh-Hans',
      fallbackLocale: 'en',
      context: { marker: 1 },
      query: { depth: '2' },
      payload: {},
    }
    const touch = (args: Record<string, unknown>) => {
      req.locale = args.locale as string
      req.fallbackLocale = (args.fallbackLocale as string | false | undefined) ?? 'en'
      req.context = { ...req.context, ...(args.context as Record<string, unknown> | undefined) }
      req.query.depth = args.depth
    }
    req.payload.findByID = async (args) => {
      touch(args)
      return hans
    }
    req.payload.update = async (args) => {
      touch(args)
      updates.push(args.data as Record<string, unknown>)
      return {}
    }
    return { req, updates }
  }

  const run = (req: FakeReq, context: Record<string, unknown> = {}) =>
    syncHantFromHans(['name', 'tags'])({ collection: { slug: 'apps' }, context, doc: { id: 7 }, req } as never)

  it('writes zh-Hant from zh-Hans and leaves the request as it found it', async () => {
    const { req, updates } = fakeRequest({ name: '视频剪辑', tags: ['演示文稿'] })
    await run(req)
    expect(updates).toEqual([{ name: '影片剪輯', tags: ['簡報'] }])
    expect(req.locale).toBe('zh-Hans')
    expect(req.fallbackLocale).toBe('en')
    expect(req.context).toEqual({ marker: 1 })
    expect(req.query.depth).toBe('2')
  })

  it('leaves saves in other languages, and its own zh-Hant write, alone', async () => {
    const english = fakeRequest({ name: 'Video editing' })
    english.req.locale = 'en'
    await run(english.req)
    expect(english.updates).toEqual([])

    const own = fakeRequest({ name: '视频剪辑' })
    await run(own.req, { skipHantSync: true })
    expect(own.updates).toEqual([])
  })
})
