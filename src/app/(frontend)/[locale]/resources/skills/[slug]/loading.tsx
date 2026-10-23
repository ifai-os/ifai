import { LoadingState } from '@/components/states/loading-state'
import { SkillDetailSkeleton } from '@/modules/resources/public/components/skill-detail-skeleton'

// A Skill's pages are static, so an unknown Skill still answers 404 with this in place.
export default function SkillLoading() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-content flex-col px-4 pt-5 pb-16 md:pb-24">
      <LoadingState skeleton={<SkillDetailSkeleton />} />
    </main>
  )
}
