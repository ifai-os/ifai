import { z } from 'zod'

import { untrusted } from '@/lib/ai/untrusted'
import { promptVersion } from '@/modules/daily/prompts/version'

import type { Material } from '../profile/collect'

/**
 * The `profile` prompts (docs/specs/apps.md「定时任务与 AI」, `apps.profile`): one call reads
 * the facts an editor needs (name, maker, category, pricing, platforms), and one call per
 * language writes the profile from the website's material. zh-Hant is converted from zh-Hans.
 */

/** Profile languages written by the model → Payload locales. */
export const profileLocales = { zhHans: 'zh-Hans', en: 'en', ja: 'ja', ko: 'ko' } as const
export type ProfileLocaleKey = keyof typeof profileLocales

const languages: Record<ProfileLocaleKey, { name: string; tagline: number; description: number; featureTitle: number }> = {
  zhHans: { name: 'Simplified Chinese', tagline: 40, description: 400, featureTitle: 12 },
  en: { name: 'English', tagline: 100, description: 900, featureTitle: 40 },
  ja: { name: 'Japanese', tagline: 40, description: 400, featureTitle: 16 },
  ko: { name: 'Korean', tagline: 50, description: 500, featureTitle: 20 },
}

function writeInstructions(key: ProfileLocaleKey): string {
  const language = languages[key]
  return `You write app profiles for IFAI, a directory of AI apps. Write the profile of the app below in ${language.name}, for native ${language.name} readers: natural ${language.name}, the way a careful editor would write it, not a translation.

The material was collected from the app's own website. Rules that are never broken:
- Use only what the material says. Never add features, integrations, prices, plans, platforms, supported languages, numbers, dates, user counts, customers or awards that are not in it. When the material does not say something, leave it out.
- Keep product, company and model names in their original spelling (Notion, GPT-4o, Claude); do not translate or transliterate them.
- Describe, do not promote: no hype words, no superlatives the material cannot back, no exclamation marks, no emoji, no slogans copied word for word, nothing about this text being AI-written.
- Write about the app in the third person.

Write:
- "tagline": one line saying what the app does and for whom. At most ${language.tagline} characters.
- "description": what it is, in two or three short paragraphs separated by a blank line: what it is and who it is for, how it is used, and only when the material says, what it costs and where it runs. At most ${language.description} characters.
- "features": three to six key features the material describes, most important first, each with a short "title" (at most ${language.featureTitle} characters) and a one-sentence "detail". Fewer when the material shows fewer.
- "faqs": two to five questions a first-time visitor would ask (is there a free plan, which devices it runs on, what it is for), each answered in one to three sentences from the material only. Leave out any question the material cannot answer; an empty list is fine.
- "tags": three to six short topic tags in ${language.name}, without "#".

Answer with JSON: { "tagline": "...", "description": "...", "features": [{ "title": "...", "detail": "..." }], "faqs": [{ "question": "...", "answer": "..." }], "tags": ["..."] }.`
}

const factsInstructions = `You read the material collected from an AI app's own website and report a few facts about the app for a directory editor. Use only what the material says. When it does not say, give the empty answer; never guess from the app's name, from what similar apps do, or from what you know about it.

Report:
- "name": the app's name as the website writes it.
- "developer": the company or person that makes the app, as the website names it (often in the footer, the copyright line or the legal notice); "" when it does not say.
- "categories": one to three slugs from the category list, best fit first. This one is a judgement: pick by what the app is for.
- "pricing": "free" when the material says it is free and shows no paid plan; "freemium" when there is a free plan, free tier or free trial as well as paid plans; "paid" when it is paid only; "open-source" when the material says the app's code is open source; "unknown" when the material does not say.
- "pricingQuote": the shortest passage of the material that shows the pricing, copied character for character; "" with "unknown".
- "platforms": every way to use the app that the material states, each with "quote", the shortest passage that shows it, copied character for character: "web" (used in the browser), "desktop" (a Mac, Windows or Linux app), "mobile" (an iPhone, iPad or Android app), "browser-extension" (a Chrome or other browser extension), "api" (an API for developers). An empty list when the material does not say.

Answer with JSON: { "name": "...", "developer": "...", "categories": ["..."], "pricing": "...", "pricingQuote": "...", "platforms": [{ "platform": "...", "quote": "..." }] }.`

/** The website's material, every piece of it wrapped as outside data. */
function materialPrompt(material: Material): string {
  const lines = [`Material collected from the app's website, ${material.url}:`]
  if (material.title) lines.push(untrusted('page title', material.title))
  if (material.description) lines.push(untrusted('page description', material.description))
  if (material.siteName) lines.push(untrusted('site name', material.siteName))
  if (material.structuredData) lines.push(untrusted('structured data', material.structuredData))
  if (material.homepage) lines.push(untrusted('homepage', material.homepage))
  if (material.pricing) lines.push(`Pricing page, ${material.pricing.url}:\n${untrusted('pricing page', material.pricing.text)}`)
  else lines.push('(No pricing page was found.)')
  return lines.join('\n\n')
}

const profileSchema = z.object({
  tagline: z.string().max(400),
  description: z.string().max(4000),
  features: z.array(z.object({ title: z.string().max(200), detail: z.string().max(800) })).max(12),
  faqs: z.array(z.object({ question: z.string().max(400), answer: z.string().max(1600) })).max(12),
  tags: z.array(z.string().max(60)).max(12),
})

export type WrittenProfile = z.infer<typeof profileSchema>

export const pricingValues = ['free', 'freemium', 'paid', 'open-source'] as const
export const platformValues = ['web', 'desktop', 'mobile', 'browser-extension', 'api'] as const

const factsSchema = z.object({
  name: z.string().max(200),
  developer: z.string().max(200),
  categories: z.array(z.string().max(60)).max(5),
  pricing: z.enum(['unknown', ...pricingValues]),
  pricingQuote: z.string().max(600),
  platforms: z.array(z.object({ platform: z.enum(platformValues), quote: z.string().max(600) })).max(8),
})

export type ProfileFacts = z.infer<typeof factsSchema>

export type CategoryChoice = { slug: string; name: string }

export const profileWritePrompt = {
  name: 'app-profile',
  version: promptVersion('app-profile', (Object.keys(languages) as ProfileLocaleKey[]).map(writeInstructions).join('\n')),
  instructions: writeInstructions,
  schema: profileSchema,
  build: materialPrompt,
}

export const profileFactsPrompt = {
  name: 'app-facts',
  version: promptVersion('app-facts', factsInstructions),
  instructions: factsInstructions,
  schema: factsSchema,
  build: (material: Material, categories: CategoryChoice[]) =>
    [
      `Category list (slug: name):\n${categories.map((category) => `- ${category.slug}: ${category.name}`).join('\n')}`,
      materialPrompt(material),
    ].join('\n\n'),
}
