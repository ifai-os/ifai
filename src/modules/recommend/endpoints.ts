import type { Endpoint } from 'payload'

import { articleAuthor, openArticleReports, reportsOn, resolveReports, type AdminArticleReport, type ArticleAuthor, type OpenArticleReport } from './admin'
import { parseId } from './writing'

export type OpenArticleReportsResponse = { total: number; items: OpenArticleReport[] }
export type ArticleModerationResponse = { author: ArticleAuthor; reports: AdminArticleReport[] }

const unauthorized = () => Response.json({ error: 'Unauthorized' }, { status: 401 })

/** Back-office endpoints for readers' articles on `articles`, for admins only. */
export const articleEndpoints: Endpoint[] = [
  {
    // GET /api/articles/open-reports — reported articles nobody has dealt with, for the notice above the list.
    path: '/open-reports',
    method: 'get',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      const response: OpenArticleReportsResponse = await openArticleReports(req.payload)
      return Response.json(response)
    },
  },
  {
    // GET /api/articles/:id/moderation — the member who wrote it and the reports on it, for its edit page.
    path: '/:id/moderation',
    method: 'get',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      const id = parseId(req.routeParams?.id)
      if (!id) return Response.json({ error: 'Bad id' }, { status: 400 })
      const article = await req.payload.findByID({ collection: 'articles', id, depth: 0, select: { author: true }, disableErrors: true, overrideAccess: true })
      if (!article) return Response.json({ error: 'Not found' }, { status: 404 })
      const response: ArticleModerationResponse = {
        author: article.author ? await articleAuthor(req.payload, article.author) : null,
        reports: await reportsOn(req.payload, id),
      }
      return Response.json(response)
    },
  },
  {
    // POST /api/articles/:id/keep — the reports were wrong: they are closed and the article stays.
    path: '/:id/keep',
    method: 'post',
    handler: async (req) => {
      if (!req.user) return unauthorized()
      const id = parseId(req.routeParams?.id)
      if (!id) return Response.json({ error: 'Bad id' }, { status: 400 })
      await resolveReports(req.payload, id)
      return Response.json({ ok: true })
    },
  },
]
