import { cn } from '@/lib/utils'

interface LogoMarkProps {
  src: string
  alt?: string
  className?: string
}

/** Displays the square mark derived from the bundled horizontal SynthAPI artwork. */
export function LogoMark({ src, alt = 'logo', className }: LogoMarkProps) {
  const isBundledLogo = /(?:^|\/)logo(?:\.png|-light\.png)(?:\?|$)/.test(src)

  if (!isBundledLogo) {
    return <img src={src} alt={alt} className={cn('object-contain', className)} />
  }

  const markSrc = '/logo-mark.png?v=synthapi-logo-crop-v1-20260828'

  return (
    <span
      className={cn(
        'relative inline-block h-6 w-6 shrink-0 overflow-hidden',
        className
      )}
      aria-label={alt}
      role='img'
    >
      <img
        src={markSrc}
        alt=''
        aria-hidden='true'
        className='absolute inset-y-0 left-0 h-full w-auto max-w-none object-contain object-left'
      />
    </span>
  )
}

interface LogoFullProps {
  src: string
  alt?: string
  className?: string
}

/** Displays the complete bundled artwork, including the SynthAPI wordmark. */
export function LogoFull({ src, alt = 'logo', className }: LogoFullProps) {
  const isBundledLogo = /(?:^|\/)logo\.png(?:\?|$)/.test(src)

  if (!isBundledLogo) {
    return (
      <img
        src={src}
        alt={alt}
        className={cn('object-contain object-left', className)}
      />
    )
  }

  const logoSrc = '/logo-light.png?v=synthapi-logo-crop-v1-20260828'
  const darkLogoSrc = '/logo-dark.png?v=synthapi-logo-dark-crop-v1-20260828'

  return (
    <span
      className={cn('relative inline-block shrink-0', className)}
      aria-label={alt}
      role='img'
    >
      <img src={logoSrc} alt='' aria-hidden='true' className='h-full w-full object-contain object-left dark:hidden' />
      <img src={darkLogoSrc} alt='' aria-hidden='true' className='hidden h-full w-full object-contain object-left dark:block' />
    </span>
  )
}
