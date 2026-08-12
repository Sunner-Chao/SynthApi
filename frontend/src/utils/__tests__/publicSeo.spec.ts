import { describe, expect, it } from 'vitest'
import { resolvePublicSeo } from '@/utils/publicSeo'

describe('public SEO metadata', () => {
  it('canonicalizes the root route to the public home page', () => {
    expect(resolvePublicSeo({ path: '/', params: {} })).toMatchObject({
      canonical: 'https://synthapi.ecobim.club/home',
      robots: expect.stringContaining('index,follow')
    })
  })

  it('returns a focused guide description', () => {
    expect(resolvePublicSeo({ path: '/guide/troubleshooting', params: { section: 'troubleshooting' } })).toMatchObject({
      title: expect.stringContaining('503'),
      canonical: 'https://synthapi.ecobim.club/guide/troubleshooting',
      robots: expect.stringContaining('index,follow')
    })
  })

  it('marks authenticated and unknown pages noindex', () => {
    expect(resolvePublicSeo({ path: '/dashboard', params: {} }).robots).toContain('noindex')
    expect(resolvePublicSeo({ path: '/unknown', params: {} }).robots).toContain('noindex')
  })
})
