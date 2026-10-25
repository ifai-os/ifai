import { LoadingState } from '@/components/states/loading-state'
import { StoryDetailSkeleton } from '@/modules/daily/public/components/daily-skeletons'

// A story's pages are static, so an unknown story still answers 404 with this in place.
export default function StoryLoading() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-content flex-col px-4 pt-5 pb-16 md:pt-8 md:pb-24">
      <LoadingState skeleton={<StoryDetailSkeleton />} />
    </main>
  )
}
