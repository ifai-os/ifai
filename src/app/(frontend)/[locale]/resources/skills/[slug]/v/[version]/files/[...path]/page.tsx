import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { getTranslations, setRequestLocale } from 'next-intl/server'

import { isLocale } from '@/i18n/config'
import { Link } from '@/i18n/navigation'
import { isValidVersion } from '@/modules/resources/normalize'
import { getSkill, getVersionFilename } from '@/modules/resources/public/data'
import { guessLang, isTextPath } from '@/modules/resources/public/files'
import { skillHref, versionHref } from '@/modules/resources/public/list-params'
import { readPackageFile } from '@/modules/resources/public/package-file'

type Props = { params: Promise<{ locale: string; slug: string; version: string; path: string[] }> }

export function generateStaticParams() {
  return []
}

function decodeSegment(part: string): string {
  try {
    return decodeURIComponent(part)
  } catch {
    return part
  }
}

async function load({ params }: Props) {
  const { locale, slug, version, path } = await params
  if (!isLocale(locale) || !isValidVersion(version)) return null
  const filePath = path.map(decodeSegment).join('/')
  const skill = await getSkill(slug, locale, version)
  const file = skill?.shown?.files.find((item) => item.path === filePath)
  if (!skill?.shown || !file) return null
  return { locale, skill, shown: skill.shown, file }
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const found = await load(props)
  if (!found) return {}
  return { title: `${found.file.path} · ${found.skill.name.value} v${found.shown.version}`, robots: { index: false, follow: false } }
}

/**
 * One file of a version, as the author wrote it (「文件」tab). Shown as escaped text inside
 * <pre>; nothing in it is run or rendered as markup (rule 4). Images and other binary files
 * are only named.
 */
export default async function SkillFilePage(props: Props) {
  const found = await load(props)
  if (!found) notFound()
  const { locale, skill, shown, file } = found
  setRequestLocale(locale)
  const t = await getTranslations('resources')

  const filename = shown.sha256 ? await getVersionFilename(shown.id) : null
  const content =
    filename && shown.sha256 && isTextPath(file.path)
      ? await readPackageFile(filename, shown.sha256, file.path).catch((error: unknown) => {
          console.warn('Could not read a Skill file', error)
          return null
        })
      : null

  return (
    <main id="main" className="mx-auto flex w-full max-w-content flex-col gap-5 px-4 pt-5 pb-16 md:pb-24">
      <nav aria-label={t('breadcrumb')} className="text-meta text-ink-4">
        <ol className="flex flex-wrap items-center gap-2">
          <li className="flex items-center gap-2">
            <Link href={skillHref(skill.slug)} lang={skill.name.lang} className="hover:text-ink">
              {skill.name.value}
            </Link>
            <span aria-hidden="true">/</span>
          </li>
          <li className="flex items-center gap-2">
            <Link href={`${versionHref(skill.slug, shown.version)}#files`} className="hover:text-ink">
              v{shown.version}
            </Link>
            <span aria-hidden="true">/</span>
          </li>
          <li aria-current="page" className="min-w-0 font-mono wrap-anywhere text-ink">
            {file.path}
          </li>
        </ol>
      </nav>
      <h1 className="font-mono text-title font-semibold wrap-anywhere">{file.path}</h1>
      <p className="text-meta text-ink-4">{t('files.viewerNote', { size: `${(file.size / 1024).toFixed(1)} KB` })}</p>
      {content?.kind === 'text' ? (
        <pre lang={guessLang(content.text)} className="overflow-auto rounded-card border border-surface-2 bg-surface px-4 py-3 font-mono text-meta whitespace-pre-wrap wrap-anywhere text-ink">
          {content.text}
        </pre>
      ) : (
        <p className="rounded-card border border-surface-2 px-4 py-6 text-center text-ui text-ink-3">{t('files.notShown')}</p>
      )}
    </main>
  )
}
