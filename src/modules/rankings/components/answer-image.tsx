import Image from 'next/image'

import type { BattleImage } from '../battles'

/**
 * A picture in a vote (「图像生成赛道」): in its own proportions, as wide as the column allows and
 * at most 600px high, its box sized before it loads. It opens the file the model returned in a
 * new tab.
 */
export function AnswerImage({ image, alt, newTab }: { image: BattleImage; alt: string; newTab: string }) {
  const ratio = image.width / image.height
  return (
    <div className="flex justify-center">
      <a
        href={image.original}
        target="_blank"
        rel="noopener"
        className="block min-w-0 rounded-thumb"
        style={{ width: `min(100%, calc(var(--spacing) * 150 * ${ratio.toFixed(4)}))` }}
      >
        <Image src={image.src} width={image.width} height={image.height} alt={alt} unoptimized className="block h-auto w-full rounded-thumb bg-surface" />
        <span className="sr-only">{newTab}</span>
      </a>
    </div>
  )
}
