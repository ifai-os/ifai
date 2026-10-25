import { LoadingState } from '@/components/states/loading-state'
import { AppDetailSkeleton } from '@/modules/apps/components/app-detail-skeleton'

// An app's pages are static, so an unknown app still answers 404 with this in place.
export default function AppLoading() {
  return (
    <main id="main" className="mx-auto flex w-full max-w-content flex-col px-4 pt-5 pb-12 md:pb-24">
      <LoadingState skeleton={<AppDetailSkeleton />} />
    </main>
  )
}
