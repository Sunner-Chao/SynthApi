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
import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { useNotificationStore } from '@/stores/notification-store'
import { getNotice } from '@/lib/api'
import { applyFaviconToDom } from '@/lib/dom-utils'
import { useStatus } from '@/hooks/use-status'
import { getLogoMark } from '@/lib/constants'

export type DesktopNotificationPermission =
  | NotificationPermission
  | 'unsupported'

function getDesktopNotificationPermission(): DesktopNotificationPermission {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported'
  }
  return window.Notification.permission
}

function getAnnouncementPlainText(item: Record<string, unknown>): string {
  const content = String(item.content || item.extra || '')
  return content
    .replace(/<[^>]*>/g, ' ')
    .replace(/[#*_`>[\]()~-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180)
}

function createUnreadFavicon(): string {
  const canvas = document.createElement('canvas')
  canvas.width = 64
  canvas.height = 64
  const context = canvas.getContext('2d')
  if (!context) return '/favicon.ico'

  context.fillStyle = '#dc2626'
  context.beginPath()
  context.arc(32, 32, 30, 0, Math.PI * 2)
  context.fill()
  context.fillStyle = '#ffffff'
  context.font = '700 42px sans-serif'
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillText('!', 32, 34)
  return canvas.toDataURL('image/png')
}

type BadgeNavigator = Navigator & {
  setAppBadge?: (contents?: number) => Promise<void>
  clearAppBadge?: () => Promise<void>
}

function setUnreadAppBadge(count: number): void {
  if (typeof navigator === 'undefined') return
  const badgeNavigator = navigator as BadgeNavigator
  void badgeNavigator.setAppBadge?.(count).catch(() => undefined)
}

function clearUnreadAppBadge(): void {
  if (typeof navigator === 'undefined') return
  const badgeNavigator = navigator as BadgeNavigator
  void badgeNavigator.clearAppBadge?.().catch(() => undefined)
}

function hashString(input: string): string {
  let hash = 0
  if (!input) return '0'

  for (let i = 0; i < input.length; i += 1) {
    const chr = input.charCodeAt(i)
    hash = (hash << 5) - hash + chr
    hash |= 0
  }

  return hash.toString(36)
}

/**
 * Generate a unique key for an announcement
 * Prefer backend id, fall back to a content hash so edits register
 */
function getAnnouncementKey(item: Record<string, unknown>): string {
  if (!item) return ''

  if (item.id !== undefined && item.id !== null) {
    return `id:${item.id}`
  }

  const fingerprint = JSON.stringify({
    publishDate: (item?.publishDate as string) || '',
    content: ((item?.content as string) || '').trim(),
    extra: ((item?.extra as string) || '').trim(),
    type: (item?.type as string) || '',
    title: ((item?.title as string) || '').trim(),
    link: ((item?.link as string) || '').trim(),
  })
  return `hash:${hashString(fingerprint)}`
}

/**
 * Hook to manage notifications (Notice + Announcements)
 * Provides unread counts and read status management
 */
export function useNotifications() {
  const { t } = useTranslation()
  const [popoverOpen, setPopoverOpen] = useState(false)
  const [activeTab, setActiveTab] = useState<'notice' | 'announcements'>(
    'notice'
  )

  // Fetch Notice from API
  const {
    data: noticeResponse,
    isLoading: noticeLoading,
    refetch: refetchNotice,
  } = useQuery({
    queryKey: ['notice'],
    queryFn: getNotice,
    staleTime: 1000 * 60 * 5, // 5 minutes
  })

  // Fetch Announcements from status
  const { status, loading: statusLoading } = useStatus({
    refetchInterval: 60 * 1000,
    refetchIntervalInBackground: true,
  })
  const announcementsEnabled = status?.announcements_enabled ?? false
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const announcements: Record<string, unknown>[] = announcementsEnabled
    ? ((status?.announcements || []) as Record<string, unknown>[]).slice(0, 20)
    : []

  // Notification store
  const {
    lastReadNotice,
    markNoticeRead,
    markAnnouncementsRead,
    markAnnouncementsNotified,
    isAnnouncementRead,
    isAnnouncementNotified,
  } = useNotificationStore()

  // Extract notice content
  const noticeContent = noticeResponse?.success
    ? (noticeResponse.data || '').trim()
    : ''

  // Calculate unread counts
  const unreadCounts = useMemo(() => {
    const noticeUnread =
      noticeContent && noticeContent !== lastReadNotice ? 1 : 0

    const announcementsUnread = announcements.filter(
      (item: Record<string, unknown>) => {
        const key = getAnnouncementKey(item)
        return !isAnnouncementRead(key)
      }
    ).length

    return {
      notice: noticeUnread,
      announcements: announcementsUnread,
      total: noticeUnread + announcementsUnread,
    }
  }, [noticeContent, lastReadNotice, announcements, isAnnouncementRead])

  const unreadAnnouncements = useMemo(
    () =>
      announcements.filter((item: Record<string, unknown>) => {
        const key = getAnnouncementKey(item)
        return !isAnnouncementRead(key)
      }),
    [announcements, isAnnouncementRead]
  )

  const [dismissedAnnouncementDialogKey, setDismissedAnnouncementDialogKey] =
    useState<string | null>(null)
  const [desktopNotificationPermission, setDesktopNotificationPermission] =
    useState<DesktopNotificationPermission>(getDesktopNotificationPermission)
  const announcementDialogKey = useMemo(
    () =>
      unreadAnnouncements
        .map((item) => getAnnouncementKey(item))
        .filter(Boolean)
        .join('|'),
    [unreadAnnouncements]
  )
  const announcementDialogOpen =
    !statusLoading &&
    announcementDialogKey.length > 0 &&
    dismissedAnnouncementDialogKey !== announcementDialogKey

  useEffect(() => {
    if (typeof window === 'undefined') return
    const syncPermission = () => {
      setDesktopNotificationPermission(getDesktopNotificationPermission())
    }
    let permissionStatus: PermissionStatus | null = null
    let active = true

    window.addEventListener('focus', syncPermission)
    if (navigator.permissions) {
      void navigator.permissions
        .query({ name: 'notifications' })
        .then((status) => {
          if (!active) return
          permissionStatus = status
          permissionStatus.addEventListener('change', syncPermission)
        })
        .catch(() => undefined)
    }

    return () => {
      active = false
      window.removeEventListener('focus', syncPermission)
      permissionStatus?.removeEventListener('change', syncPermission)
    }
  }, [])

  useEffect(() => {
    if (
      statusLoading ||
      unreadAnnouncements.length === 0 ||
      typeof document === 'undefined'
    ) {
      return
    }

    const systemName = String(status?.system_name || '').trim()
    const baseTitle = systemName || document.title
    const originalFavicon =
      document.querySelector<HTMLLinkElement>('link[rel~="icon"]')?.href ||
      '/favicon.ico'
    const unreadFavicon = createUnreadFavicon()
    let showAlertState = true

    const updateAttentionSignal = () => {
      document.title = showAlertState
        ? `【${t('{{count}} new system announcements', {
            count: unreadAnnouncements.length,
          })}】 ${baseTitle}`
        : baseTitle
      applyFaviconToDom(showAlertState ? unreadFavicon : originalFavicon)
      showAlertState = !showAlertState
    }

    setUnreadAppBadge(unreadAnnouncements.length)
    updateAttentionSignal()
    const interval = window.setInterval(updateAttentionSignal, 800)

    return () => {
      window.clearInterval(interval)
      document.title = baseTitle
      applyFaviconToDom(originalFavicon)
      clearUnreadAppBadge()
    }
  }, [status?.system_name, statusLoading, t, unreadAnnouncements.length])

  useEffect(() => {
    if (
      statusLoading ||
      desktopNotificationPermission !== 'granted' ||
      typeof window === 'undefined'
    ) {
      return
    }

    const pendingAnnouncements = unreadAnnouncements.filter((item) => {
      const key = getAnnouncementKey(item)
      return !isAnnouncementNotified(key)
    })
    if (pendingAnnouncements.length === 0) return

    const latest = pendingAnnouncements[0]
    const keys = pendingAnnouncements.map((item) => getAnnouncementKey(item))
    const title =
      pendingAnnouncements.length === 1
        ? t('New system announcement')
        : t('{{count}} new system announcements', {
            count: pendingAnnouncements.length,
          })

    try {
      const notification = new window.Notification(title, {
        body: getAnnouncementPlainText(latest),
        icon: getLogoMark(String(status?.logo || '/logo.png')),
        badge: '/favicon.ico',
        tag: 'synthapi-system-announcements',
        requireInteraction: true,
        silent: false,
      })
      notification.onclick = () => {
        window.focus()
        setDismissedAnnouncementDialogKey(null)
        notification.close()
      }
      markAnnouncementsNotified(keys)
    } catch {
      // The in-page dialog and red tab indicator remain available as fallback.
    }
  }, [
    desktopNotificationPermission,
    isAnnouncementNotified,
    markAnnouncementsNotified,
    status?.logo,
    statusLoading,
    t,
    unreadAnnouncements,
  ])

  const requestDesktopNotifications = async () => {
    const currentPermission = getDesktopNotificationPermission()
    if (currentPermission === 'unsupported') return
    if (currentPermission === 'denied') {
      setDesktopNotificationPermission(currentPermission)
      return
    }
    const permission = await window.Notification.requestPermission()
    setDesktopNotificationPermission(permission)
  }

  const markAnnouncementsAsRead = () => {
    if (announcements.length > 0) {
      const allKeys = announcements.map((item: Record<string, unknown>) =>
        getAnnouncementKey(item)
      )
      markAnnouncementsRead(allKeys)
    }
  }

  const closeAnnouncementDialog = () => {
    setDismissedAnnouncementDialogKey(announcementDialogKey)
    if (unreadAnnouncements.length > 0) {
      const unreadKeys = unreadAnnouncements.map(
        (item: Record<string, unknown>) => getAnnouncementKey(item)
      )
      markAnnouncementsRead(unreadKeys)
    }
  }

  // Handle popover open
  const handleOpenPopover = (tab?: 'notice' | 'announcements') => {
    const nextTab = tab || activeTab

    // Mark currently visible content as read when opening the notification center
    if (noticeContent) {
      markNoticeRead(noticeContent)
    }
    if (nextTab === 'announcements') {
      markAnnouncementsAsRead()
    }

    setActiveTab(nextTab)
    setPopoverOpen(true)
  }

  const handlePopoverOpenChange = (open: boolean) => {
    if (open) {
      handleOpenPopover(activeTab)
      return
    }

    setPopoverOpen(false)
  }

  // Handle tab change - mark announcements as read when switching to that tab
  const handleTabChange = (tab: 'notice' | 'announcements') => {
    setActiveTab(tab)

    if (tab === 'announcements') {
      markAnnouncementsAsRead()
    }
  }

  return {
    // Data
    notice: noticeContent,
    announcements,
    unreadAnnouncements,
    loading: noticeLoading || statusLoading,

    // Unread counts
    unreadCount: unreadCounts.total,
    unreadNoticeCount: unreadCounts.notice,
    unreadAnnouncementsCount: unreadCounts.announcements,

    // Popover state
    popoverOpen,
    setPopoverOpen: handlePopoverOpenChange,
    activeTab,
    setActiveTab: handleTabChange,
    announcementDialogOpen,
    desktopNotificationPermission,
    desktopNotificationsSupported:
      desktopNotificationPermission !== 'unsupported',
    requestDesktopNotifications,
    setAnnouncementDialogOpen: (open: boolean) => {
      if (open) {
        setDismissedAnnouncementDialogKey(null)
      } else {
        closeAnnouncementDialog()
      }
    },

    // Actions
    openPopover: handleOpenPopover,
    closePopover: () => setPopoverOpen(false),
    closeAnnouncementDialog,
    refetchNotice,
  }
}
