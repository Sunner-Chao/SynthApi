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
// ============================================================================
// Affiliate Functions
// ============================================================================

/**
 * Resolve the public site origin used in links shared with end users.
 * The admin dashboard is hosted on a separate subdomain, but invitations
 * must always land on the public registration page.
 */
export function getPublicSiteOrigin(): string {
  if (typeof window === 'undefined') return ''

  try {
    const url = new URL(window.location.origin)
    if (url.hostname.toLowerCase().startsWith('admin.')) {
      url.hostname = url.hostname.slice('admin.'.length)
    }
    return url.origin
  } catch {
    return window.location.origin
  }
}

/**
 * Generate affiliate registration link
 */
export function generateAffiliateLink(affCode: string): string {
  const origin = getPublicSiteOrigin()
  if (!origin) return ''
  return `${origin}/sign-up?aff=${encodeURIComponent(affCode)}`
}
