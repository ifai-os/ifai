import { Icon, type IconName } from '@/components/icon'

type ComingSoonCardProps = {
  icon: IconName
  title: string
  description: string
}

/** Dashed card for modules that launch in a later phase. */
export function ComingSoonCard({ icon, title, description }: ComingSoonCardProps) {
  return (
    <div className="flex flex-col gap-2 rounded-card border border-dashed border-disabled p-4.5 text-ink-2">
      <span className="flex items-center gap-2 text-body font-semibold text-ink">
        <Icon name={icon} size={18} />
        {title}
      </span>
      <span className="text-meta">{description}</span>
    </div>
  )
}
