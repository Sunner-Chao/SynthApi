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

const FRONTEND_CACHE_VERSION = 'default-v2-admin-sidebar-reset'
const FRONTEND_CACHE_VERSION_KEY = 'newapi:default:cache-version'
const ADMIN_CACHE_MIGRATION_KEY = 'synthapi:admin:cache-migration'
const PRESERVED_LOCAL_STORAGE_KEYS = new Set([
  FRONTEND_CACHE_VERSION_KEY,
  ADMIN_CACHE_MIGRATION_KEY,
  'user',
  'uid',
  'aff',
  'oauth:binding:result',
])

export function initializeFrontendCache(): void {
  if (typeof window === 'undefined') return

  try {
    migrateAdminPortalCache()

    const currentVersion = window.localStorage.getItem(
      FRONTEND_CACHE_VERSION_KEY
    )
    if (currentVersion === FRONTEND_CACHE_VERSION) return

    clearLocalUiCache()
    window.localStorage.setItem(
      FRONTEND_CACHE_VERSION_KEY,
      FRONTEND_CACHE_VERSION
    )
  } catch {
    // Storage can be unavailable in private mode; the app should still boot.
  }
}

function migrateAdminPortalCache(): void {
  if (window.location.hostname.toLowerCase() !== 'admin.synthapi.asia') return
  if (
    window.localStorage.getItem(ADMIN_CACHE_MIGRATION_KEY) ===
    FRONTEND_CACHE_VERSION
  ) {
    return
  }

  // Preserve authentication while removing stale server-status and sidebar
  // snapshots that can keep long-lived admin browsers on an obsolete menu.
  window.localStorage.removeItem('status')
  window.localStorage.removeItem('app:rev')
  document.cookie =
    'sidebar_state=; Path=/; Max-Age=0; SameSite=Lax; Secure'
  document.cookie =
    'sidebar_state=; Path=/; Domain=.synthapi.asia; Max-Age=0; SameSite=Lax; Secure'

  try {
    window.sessionStorage.clear()
  } catch {
    // Session storage can be disabled independently from local storage.
  }

  window.localStorage.setItem(
    ADMIN_CACHE_MIGRATION_KEY,
    FRONTEND_CACHE_VERSION
  )
}

function clearLocalUiCache(): void {
  const keysToRemove: string[] = []
  for (let index = 0; index < window.localStorage.length; index += 1) {
    const key = window.localStorage.key(index)
    if (key && !PRESERVED_LOCAL_STORAGE_KEYS.has(key)) {
      keysToRemove.push(key)
    }
  }

  keysToRemove.forEach((key) => window.localStorage.removeItem(key))
}
