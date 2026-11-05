import Image from 'next/image'

type Props = {
  picture: { url: string; srcSet?: string }
  alt: string
  /** The `sizes` attribute: how wide the box is at each screen width. */
  sizes: string
  className?: string
  priority?: boolean
}

/**
 * A picture filling its (positioned) box. One on the public R2 bucket (`srcSet` set, see
 * src/lib/media-url.ts) is drawn as a plain <img> over the sizes Payload stored, straight from
 * Cloudflare; anything else (this site's files, public/) goes through next/image as before.
 */
export function MediaPicture({ picture, alt, sizes, className = '', priority = false }: Props) {
  if (picture.srcSet) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- the bucket already holds the sizes; next/image would resize them again on Vercel.
      <img
        src={picture.url}
        srcSet={picture.srcSet}
        sizes={sizes}
        alt={alt}
        loading={priority ? 'eager' : 'lazy'}
        fetchPriority={priority ? 'high' : undefined}
        decoding="async"
        className={`absolute inset-0 size-full ${className}`}
      />
    )
  }
  return <Image src={picture.url} alt={alt} fill sizes={sizes} className={className} priority={priority} />
}
