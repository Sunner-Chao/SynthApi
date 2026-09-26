/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import type { MouseEvent } from 'react'
import { useNavigate } from '@tanstack/react-router'
import { SUPPORT_CLOSE_EVENT } from './queue'

// Modified and middle clicks keep the browser's own "open in new tab" behaviour.
export const isPlainClick = (event: MouseEvent) =>
  event.button === 0 &&
  !event.metaKey &&
  !event.ctrlKey &&
  !event.shiftKey &&
  !event.altKey

export type LinkTarget = { kind: 'internal' | 'external'; href: string }

// Links come from model output, so they are resolved against this origin before use:
// '//host' or '/\host' resolve elsewhere and are dropped instead of being treated as paths.
export function resolveLink(href?: string): LinkTarget | null {
  const value = href?.trim() ?? ''
  const absolute = /^https?:\/\//i.test(value)
  if (!absolute && !value.startsWith('/')) return null
  let url: URL
  try {
    url = new URL(value, window.location.origin)
  } catch {
    return null
  }
  if (url.origin === window.location.origin)
    return {
      kind: 'internal',
      href: `${url.pathname}${url.search}${url.hash}`,
    }
  return absolute ? { kind: 'external', href: url.toString() } : null
}

// On phones the panel covers the page, so following a link also closes it.
// Anything that does not resolve to this site is ignored, never navigated to.
export function useOpenInternal() {
  const navigate = useNavigate()
  return (href: string) => {
    const target = resolveLink(href)
    if (target?.kind !== 'internal') return
    if (window.matchMedia('(max-width: 639px)').matches)
      window.dispatchEvent(new Event(SUPPORT_CLOSE_EVENT))
    void navigate({ href: target.href })
  }
}
