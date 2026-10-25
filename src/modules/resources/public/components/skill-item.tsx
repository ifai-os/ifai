import { useFormatter, useTranslations } from 'next-intl'

import { Icon } from '@/components/icon'
import { Link } from '@/i18n/navigation'

import type { SkillListItem } from '../data'
import { skillHref, skillsHref } from '../list-params'
import { ApiKeyBadge, ScanBadgeView } from './badges'
import { ListLink } from './list-navigation'
import { SkillTile } from './skill-tile'

/**
 * One Skill in the list. The same markup is a row in the list view and a card in the grid view;
 * the surrounding `ViewSwitch` sets which (`data-view` on the `group/view` element).
 */
export function SkillItem({ skill }: { skill: SkillListItem }) {
  const t = useTranslations('resources')
  const categories = useTranslations('skillCategories')
  const card = useTranslations('card')
  const format = useFormatter()
  const href = skillHref(skill.slug)
  const installs = format.number(skill.installs, { notation: 'compact', maximumFractionDigits: 1 })

  return (
    <article className="flex gap-3.5 border-b border-surface-2 py-4 group-data-[view=grid]/view:flex-col group-data-[view=grid]/view:gap-3 group-data-[view=grid]/view:rounded-card group-data-[view=grid]/view:border group-data-[view=grid]/view:bg-surface group-data-[view=grid]/view:p-4.5 md:gap-4">
      <div className="flex gap-3.5 md:gap-4 group-data-[view=grid]/view:items-center group-data-[view=grid]/view:gap-3">
        <SkillTile name={skill.name.value} slug={skill.slug} size="lg" />
        <div className="hidden min-w-0 flex-col gap-0.5 group-data-[view=grid]/view:flex">
          <Link href={href} lang={skill.name.lang} className="truncate text-body font-semibold hover:text-accent-ink">
            {skill.name.value}
          </Link>
          <span className="truncate text-small text-ink-4">
            {categories(skill.category)} · {skill.author.name}
          </span>
        </div>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 group-data-[view=grid]/view:hidden">
          <Link href={href} lang={skill.name.lang} className="text-title font-semibold wrap-anywhere hover:text-accent-ink">
            {skill.name.value}
          </Link>
          {skill.certified && (
            <span title={t('certified')} className="text-link">
              <Icon name="verified" size={16} />
              <span className="sr-only">{t('certified')}</span>
            </span>
          )}
          <ListLink
            href={skillsHref({ category: skill.category })}
            className="flex h-6 items-center rounded-tag bg-surface px-2 text-small text-ink-2 hover:text-ink"
          >
            {categories(skill.category)}
          </ListLink>
          {skill.needsApiKey && <ApiKeyBadge />}
        </div>
        {skill.tagline && (
          <p lang={skill.tagline.lang} className="text-ui text-ink-3 group-data-[view=grid]/view:line-clamp-2 group-data-[view=grid]/view:flex-1">
            {skill.tagline.value}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-4">
          <span>{card('installs', { count: installs })}</span>
          <ListLink href={skillsHref({ author: skill.author.name })} className="hover:text-ink group-data-[view=grid]/view:hidden">
            {skill.author.name}
          </ListLink>
          {skill.updatedAt && (
            <span>{t('updatedOn', { date: format.dateTime(new Date(skill.updatedAt), { year: 'numeric', month: 'short', day: 'numeric' }) })}</span>
          )}
          {skill.scan && <ScanBadgeView scan={skill.scan} />}
        </div>
      </div>

      <Link
        href={`${href}#install`}
        className="flex h-8 flex-none items-center self-start rounded-pill border border-line bg-bg px-3.5 text-meta text-ink transition-colors hover:border-ink-4 group-data-[view=grid]/view:self-end"
      >
        {card('install')}
        <span className="sr-only">{skill.name.value}</span>
      </Link>
    </article>
  )
}
