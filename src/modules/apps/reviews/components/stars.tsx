const star = 'M12 2.8l2.8 5.8 6.4.9-4.6 4.5 1.1 6.3L12 17.3l-5.7 3 1.1-6.3-4.6-4.5 6.4-.9z'

type StarsProps = {
  /** 0–5; an average shows to the nearest half star. */
  rating: number
  size?: number
  className?: string
}

/** Five stars, filled up to the rating. Decorative: whatever shows them also gives the number in words. */
export function Stars({ rating, size = 14, className }: StarsProps) {
  const halves = Math.round(Math.min(5, Math.max(0, rating)) * 2)
  return (
    <span aria-hidden="true" className={`inline-flex flex-none items-center text-star ${className ?? ''}`}>
      {[0, 1, 2, 3, 4].map((index) => {
        const fill = Math.min(2, Math.max(0, halves - index * 2)) / 2
        return (
          <span key={index} className="relative inline-block" style={{ width: size, height: size }}>
            <StarIcon size={size} filled={false} />
            {fill > 0 && (
              <span className="absolute inset-y-0 left-0 overflow-hidden" style={{ width: `${fill * 100}%` }}>
                <StarIcon size={size} filled />
              </span>
            )}
          </span>
        )
      })}
    </span>
  )
}

/** One star, outlined or filled: the stars in the review form. */
export function StarIcon({ size, filled }: { size: number; filled: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={filled ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinejoin="round"
      className="block max-w-none"
    >
      <path d={star} />
    </svg>
  )
}
