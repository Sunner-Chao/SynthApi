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
import type { TFunction } from 'i18next'
import {
  Bell,
  ChevronRight,
  Inbox,
  Megaphone,
  ShieldCheck,
  Sparkles,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatDateTimeObject } from '@/lib/time'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty'
import { Markdown } from '@/components/ui/markdown'
import {
  Popover,
  PopoverContent,
  PopoverHeader,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'

interface AnnouncementItem {
  type?: string
  content?: string
  extra?: string
  publishDate?: string | Date
}

interface NotificationPopoverProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  unreadCount: number
  activeTab: 'notice' | 'announcements'
  onTabChange: (tab: 'notice' | 'announcements') => void
  notice: string
  announcements: AnnouncementItem[]
  popupAnnouncements?: AnnouncementItem[]
  announcementDialogOpen?: boolean
  onAnnouncementDialogOpenChange?: (open: boolean) => void
  loading: boolean
  className?: string
}

function getRelativeTime(publishDate: string | Date, t: TFunction): string {
  if (!publishDate) return ''

  const now = new Date()
  const pubDate = new Date(publishDate)

  if (isNaN(pubDate.getTime()))
    return typeof publishDate === 'string' ? publishDate : ''

  const diffMs = now.getTime() - pubDate.getTime()
  const diffSeconds = Math.floor(diffMs / 1000)
  const diffMinutes = Math.floor(diffSeconds / 60)
  const diffHours = Math.floor(diffMinutes / 60)
  const diffDays = Math.floor(diffHours / 24)
  const diffWeeks = Math.floor(diffDays / 7)
  const diffMonths = Math.floor(diffDays / 30)
  const diffYears = Math.floor(diffDays / 365)

  if (diffMs < 0) return formatDateTimeObject(pubDate)

  if (diffSeconds < 60) return t('Just now')
  if (diffMinutes < 60)
    return diffMinutes === 1
      ? t('1 minute ago')
      : t('{{count}} minutes ago', { count: diffMinutes })
  if (diffHours < 24)
    return diffHours === 1
      ? t('1 hour ago')
      : t('{{count}} hours ago', { count: diffHours })
  if (diffDays < 7)
    return diffDays === 1
      ? t('1 day ago')
      : t('{{count}} days ago', { count: diffDays })
  if (diffWeeks < 4)
    return diffWeeks === 1
      ? t('1 week ago')
      : t('{{count}} weeks ago', { count: diffWeeks })
  if (diffMonths < 12)
    return diffMonths === 1
      ? t('1 month ago')
      : t('{{count}} months ago', { count: diffMonths })
  if (diffYears < 2) return t('1 year ago')

  return formatDateTimeObject(pubDate)
}

function getAnnouncementTone(type?: string) {
  switch (type) {
    case 'success':
      return {
        shell: 'border-success/20 bg-success/5 hover:bg-success/10',
        badge: 'border-success/30 bg-success/10 text-success',
        icon: 'bg-success/10 text-success',
        dot: 'bg-success',
      }
    case 'warning':
      return {
        shell: 'border-warning/20 bg-warning/5 hover:bg-warning/10',
        badge: 'border-warning/30 bg-warning/10 text-warning',
        icon: 'bg-warning/10 text-warning',
        dot: 'bg-warning',
      }
    case 'error':
      return {
        shell: 'border-destructive/20 bg-destructive/5 hover:bg-destructive/10',
        badge: 'border-destructive/30 bg-destructive/10 text-destructive',
        icon: 'bg-destructive/10 text-destructive',
        dot: 'bg-destructive',
      }
    case 'ongoing':
      return {
        shell: 'border-info/20 bg-info/5 hover:bg-info/10',
        badge: 'border-info/30 bg-info/10 text-info',
        icon: 'bg-info/10 text-info',
        dot: 'bg-info',
      }
    default:
      return {
        shell: 'border-border/40 bg-muted/20 hover:bg-muted/30',
        badge: 'border-border bg-muted/30 text-muted-foreground',
        icon: 'bg-muted/30 text-muted-foreground',
        dot: 'bg-muted-foreground',
      }
  }
}

/**
 * Elegant time badge showing relative + absolute time
 * Used in both Notice and Timeline tabs
 */
function TimeBadge({
  relativeTime,
  absoluteTime,
  tone = 'default',
}: {
  relativeTime: string
  absoluteTime: string
  tone?: 'success' | 'warning' | 'error' | 'ongoing' | 'default'
}) {
  if (!absoluteTime) return null

  const parts = absoluteTime.match(/^(\d{4})-(\d{2})-(\d{2})\s+(\d{2}):(\d{2}):?(\d{2})?$/)
  if (!parts) {
    return (
      <time
        dateTime={absoluteTime}
        className='inline-flex items-center rounded-md border border-border/30 bg-muted/30 px-2 py-0.5 text-[11px] tabular-nums text-muted-foreground'
      >
        {relativeTime || absoluteTime}
      </time>
    )
  }

  const [, year, month, day, hour, minute] = parts

  const accentColors: Record<string, string> = {
    success: 'border-success/20 bg-success/5 text-success',
    warning: 'border-warning/20 bg-warning/5 text-warning',
    error: 'border-destructive/20 bg-destructive/5 text-destructive',
    ongoing: 'border-info/20 bg-info/5 text-info',
    default: '',
  }
  const accent = accentColors[tone] || ''
  const timeHighlight = tone !== 'default' ? accent : 'bg-primary/10 text-primary'

  return (
    <time
      dateTime={absoluteTime}
      className={cn(
        'inline-flex items-stretch overflow-hidden rounded-lg border border-border/30 bg-muted/20 text-[11px] shadow-sm transition-all duration-200 hover:border-border/50 hover:shadow-md',
        tone !== 'default' && accent
      )}
    >
      {/* Relative time section */}
      <span className='flex items-center px-2 py-1 text-[11px] font-semibold tabular-nums text-foreground/80'>
        {relativeTime}
      </span>

      {/* Date chips section */}
      <span className='flex items-stretch border-l border-border/20 bg-background/50'>
        <span className='flex items-center px-1.5 py-1 text-[10px] tabular-nums text-muted-foreground'>
          {year}
        </span>
        <span className='flex items-center px-1 py-1 text-[10px] font-medium tabular-nums text-muted-foreground'>
          {month}/{day}
        </span>
        <span className={cn(
          'flex items-center rounded-r-lg px-1.5 py-1 text-[10px] font-bold tabular-nums',
          timeHighlight
        )}>
          {hour}:{minute}
        </span>
      </span>
    </time>
  )
}

/**
 * Timeline item with clean vertical connector
 */
function TimelineItem({
  item,
  t,
  isLast,
}: {
  item: AnnouncementItem
  t: TFunction
  isLast: boolean
}) {
  const publishDate = item.publishDate ? new Date(item.publishDate) : null
  const relativeTime = publishDate ? getRelativeTime(publishDate, t) : ''
  const absoluteTime = publishDate ? formatDateTimeObject(publishDate) : ''
  const tone = getAnnouncementTone(item.type)

  return (
    <div className='flex gap-3'>
      {/* Timeline connector column */}
      <div className='flex w-5 flex-col items-center'>
        {/* Glowing dot */}
        <div
          className={cn(
            'mt-1.5 flex size-2 shrink-0 items-center justify-center rounded-full ring-2 ring-background',
            tone.dot
          )}
        />
        {/* Vertical line */}
        {!isLast && (
          <div className='bg-border/30 my-1 w-px flex-1' />
        )}
      </div>

      {/* Content card */}
      <div
        className={cn(
          'mb-2.5 flex-1 rounded-lg border p-3 transition-colors duration-200',
          tone.shell
        )}
      >
        <div className='flex items-start gap-2.5'>
          {/* Icon */}
          <div
            className={cn(
              'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md',
              tone.icon
            )}
          >
            <ShieldCheck className='size-3.5' />
          </div>

          {/* Content */}
          <div className='min-w-0 flex-1 space-y-1.5'>
            {/* Header row */}
            <div className='flex flex-wrap items-center gap-2'>
              <Badge
                variant='outline'
                className={cn('h-5 px-1.5 text-[10px] font-medium', tone.badge)}
              >
                {t(item.type || 'Notice')}
              </Badge>
              {absoluteTime && (
                <TimeBadge
                  relativeTime={relativeTime}
                  absoluteTime={absoluteTime}
                  tone={item.type as 'success' | 'warning' | 'error' | 'ongoing' | 'default'}
                />
              )}
            </div>

            {/* Main content */}
            <div className='text-foreground text-[13px] leading-relaxed'>
              <Markdown>{item.content || ''}</Markdown>
            </div>

            {/* Extra info */}
            {item.extra && (
              <div className='rounded-md border border-border/30 bg-background/50 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground'>
                <Markdown>{item.extra}</Markdown>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Notice card with gradient accent
 */
function NoticeCard({ notice, t }: { notice: string; t: TFunction }) {
  const now = new Date()
  const activeTime = formatDateTimeObject(now)

  return (
    <div className='group relative overflow-hidden rounded-xl border border-info/20 bg-info/5'>
      {/* Top gradient accent */}
      <div className='absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-info/40 via-info/20 to-transparent' />

      <div className='p-4'>
        <div className='flex items-start gap-3'>
          {/* Icon container */}
          <div className='bg-info/10 text-info flex size-10 shrink-0 items-center justify-center rounded-xl'>
            <Bell className='size-5' />
          </div>

         <div className='min-w-0 flex-1 space-y-2.5'>
            {/* Header */}
            <div className='flex flex-wrap items-center gap-2'>
              <Badge
                variant='outline'
                className='border-info/30 bg-info/10 text-info h-5.5 px-2 text-[11px] font-medium'
              >
                <Sparkles className='mr-1 size-2.5' />
                {t('Platform Notice')}
              </Badge>
              <TimeBadge
                relativeTime={t('Active now')}
                absoluteTime={activeTime}
                tone='ongoing'
              />
            </div>

            {/* Content */}
            <div className='rounded-lg border border-info/10 bg-background/60 px-4 py-3'>
              <div className='text-foreground text-sm leading-relaxed'>
                <Markdown>{notice}</Markdown>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/**
 * Loading skeleton with pulse animation
 */
function LoadingSkeleton({ icon: Icon }: { icon: React.ElementType }) {
  return (
    <div className='space-y-3 p-2'>
      <div className='flex items-center gap-3'>
        <div className='bg-muted/50 flex size-10 animate-pulse items-center justify-center rounded-xl'>
          <Icon className='size-5 text-muted-foreground/40' />
        </div>
        <div className='space-y-1.5'>
          <div className='bg-muted/50 h-4 w-24 animate-pulse rounded-md' />
          <div className='bg-muted/30 h-3 w-32 animate-pulse rounded-md' />
        </div>
      </div>
      <div className='space-y-1.5'>
        <div className='bg-muted/30 h-3 w-full animate-pulse rounded-md' />
        <div className='bg-muted/20 h-3 w-3/4 animate-pulse rounded-md' />
      </div>
    </div>
  )
}

/**
 * Empty state component
 */
function EmptyState({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ElementType
  title: string
  description?: string
}) {
  return (
    <Empty className='min-h-36 border-0 p-4'>
      <EmptyHeader>
        <EmptyMedia variant='icon'>
          <div className='bg-muted/40 flex size-12 items-center justify-center rounded-xl'>
            <Icon className='size-6 text-muted-foreground/50' />
          </div>
        </EmptyMedia>
        <EmptyTitle className='text-sm'>{title}</EmptyTitle>
        {description && (
          <EmptyDescription className='text-xs'>{description}</EmptyDescription>
        )}
      </EmptyHeader>
    </Empty>
  )
}

/**
 * Notice tab content
 */
function NoticeContent({
  notice,
  loading,
  t,
}: {
  notice: string
  loading: boolean
  t: TFunction
}) {
  if (loading) {
    return (
      <div className='py-2'>
        <LoadingSkeleton icon={Bell} />
      </div>
    )
  }

  if (!notice) {
    return (
      <EmptyState
        icon={Inbox}
        title={t('No notice published')}
        description={t('The platform notice is currently empty')}
      />
    )
  }

  return (
    <ScrollArea className='h-[min(40vh,20rem)]'>
      <div className='py-1 pr-3'>
        <NoticeCard notice={notice} t={t} />
      </div>
    </ScrollArea>
  )
}

/**
 * Announcements tab content with timeline
 */
function AnnouncementsContent({
  announcements,
  loading,
  t,
}: {
  announcements: AnnouncementItem[]
  loading: boolean
  t: TFunction
}) {
  if (loading) {
    return (
      <div className='space-y-3 py-2'>
        {[1, 2, 3].map((i) => (
          <div key={i} className='flex gap-3'>
            <div className='flex w-5 flex-col items-center'>
              <div className='bg-muted/50 size-2 animate-pulse rounded-full' />
              {i < 3 && <div className='bg-muted/30 my-1 w-px flex-1 animate-pulse' />}
            </div>
            <div className='flex-1 space-y-2 rounded-lg border border-border/30 bg-muted/10 p-3'>
              <div className='bg-muted/40 h-3 w-20 animate-pulse rounded-md' />
              <div className='bg-muted/30 h-8 animate-pulse rounded-md' />
            </div>
          </div>
        ))}
      </div>
    )
  }

  if (announcements.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title={t('No system announcements')}
        description={t('All caught up! No new notifications')}
      />
    )
  }

  return (
    <ScrollArea className='h-[min(40vh,20rem)]'>
      <div className='py-1 pr-3'>
        {announcements.map((item, idx) => (
          <TimelineItem
            key={idx}
            item={item}
            t={t}
            isLast={idx === announcements.length - 1}
          />
        ))}
      </div>
    </ScrollArea>
  )
}

/**
 * Announcement dialog
 */
function AnnouncementDialog({
  open,
  onOpenChange,
  announcements,
  t,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  announcements: AnnouncementItem[]
  t: TFunction
}) {
  if (announcements.length === 0) return null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='overflow-hidden p-0 sm:max-w-xl'>
        <DialogHeader className='border-b px-5 pt-5 pb-4'>
          <div className='flex items-center gap-3'>
            <div className='bg-warning/10 text-warning flex size-10 items-center justify-center rounded-lg'>
              <Megaphone className='size-5' />
            </div>
            <div className='min-w-0'>
              <DialogTitle className='text-lg'>
                {t('System Announcements')}
              </DialogTitle>
              <DialogDescription className='mt-1'>
                {t('Latest platform updates and notices')}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className='max-h-[min(62vh,34rem)] px-5 py-4'>
          <div className='space-y-3'>
            {announcements.map((item, idx) => (
              <div
                key={idx}
                className='rounded-lg border border-border/40 bg-card p-3'
              >
                <AnnouncementCard item={item} t={t} />
              </div>
            ))}
          </div>
        </ScrollArea>

        <DialogFooter className='border-t bg-muted/20 px-5 pb-4'>
          <Button onClick={() => onOpenChange(false)}>{t('Close')}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Compact announcement card for dialog
 */
function AnnouncementCard({
  item,
  t,
}: {
  item: AnnouncementItem
  t: TFunction
}) {
  const publishDate = item.publishDate ? new Date(item.publishDate) : null
  const relativeTime = publishDate ? getRelativeTime(publishDate, t) : ''
  const absoluteTime = publishDate ? formatDateTimeObject(publishDate) : ''
  const tone = getAnnouncementTone(item.type)

  return (
    <div className='flex items-start gap-2.5'>
      <div
        className={cn(
          'mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-md',
          tone.icon
        )}
      >
        <ShieldCheck className='size-3.5' />
      </div>
      <div className='min-w-0 flex-1 space-y-1.5'>
        <div className='flex flex-wrap items-center gap-2'>
          <Badge
            variant='outline'
            className={cn('h-5 px-1.5 text-[10px]', tone.badge)}
          >
            {t(item.type || 'Notice')}
          </Badge>
          {absoluteTime && (
            <TimeBadge
              relativeTime={relativeTime}
              absoluteTime={absoluteTime}
              tone={item.type as 'success' | 'warning' | 'error' | 'ongoing' | 'default'}
            />
          )}
        </div>
        <div className='text-foreground text-[13px] leading-relaxed'>
          <Markdown>{item.content || ''}</Markdown>
        </div>
        {item.extra && (
          <div className='rounded-md border border-border/30 bg-background/50 px-2.5 py-1.5 text-[11px] leading-relaxed text-muted-foreground'>
            <Markdown>{item.extra}</Markdown>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Main notification popover component
 */
export function NotificationPopover({
  open,
  onOpenChange,
  unreadCount,
  activeTab,
  onTabChange,
  notice,
  announcements,
  popupAnnouncements = [],
  announcementDialogOpen = false,
  onAnnouncementDialogOpenChange,
  loading,
  className,
}: NotificationPopoverProps) {
  const { t } = useTranslation()

  return (
    <>
      <AnnouncementDialog
        open={announcementDialogOpen}
        onOpenChange={onAnnouncementDialogOpenChange ?? (() => {})}
        announcements={popupAnnouncements}
        t={t}
      />

      <Popover open={open} onOpenChange={onOpenChange}>
        <PopoverTrigger
          render={
            <Button
              variant='ghost'
              size='icon'
              className={cn(
                'relative size-9 transition-all duration-200 hover:bg-muted/50',
                className
              )}
              aria-label={t('Notifications')}
            />
          }
        >
          <Bell className='size-[1.15rem]' />
          {unreadCount > 0 ? (
            <span className='absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground'>
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          ) : null}
        </PopoverTrigger>

        <PopoverContent
          align='end'
          sideOffset={8}
          className='w-[min(26rem,calc(100vw-1rem))] overflow-hidden p-0'
        >
          {/* Container */}
          <div className='rounded-xl border border-border/60 bg-background shadow-xl'>
            {/* Header */}
            <div className='border-b border-border/40 px-4 pt-4 pb-3'>
              <div className='flex items-start justify-between'>
                <div className='space-y-1'>
                  <PopoverTitle className='text-base font-semibold'>
                    {t('System Announcements')}
                  </PopoverTitle>
                  <p className='text-muted-foreground text-xs'>
                    {t('Stay updated with the latest platform news')}
                  </p>
                </div>
                <button
                  type='button'
                  onClick={(e) => {
                    e.stopPropagation()
                    onOpenChange(false)
                  }}
                  className='inline-flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors'
                >
                  <X className='size-4' />
                </button>
              </div>
            </div>

            {/* Tab navigation */}
            <div className='px-3 pb-3 pt-2'>
              <div className='bg-muted/40 relative flex rounded-lg p-1'>
                {/* Sliding indicator */}
                <div
                  className={cn(
                    'absolute inset-y-1 rounded-md bg-background shadow-sm transition-all duration-200 ease-out',
                    activeTab === 'notice'
                      ? 'left-1 right-1/2'
                      : 'left-1/2 right-1'
                  )}
                />
                <button
                  type='button'
                  onClick={() => onTabChange('notice')}
                  className={cn(
                    'relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200',
                    activeTab === 'notice'
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground/80'
                  )}
                >
                  <Bell
                    className={cn(
                      'size-3.5 transition-all duration-200',
                      activeTab === 'notice'
                        ? 'text-foreground'
                        : 'text-muted-foreground/70'
                    )}
                  />
                  {t('Notice')}
                </button>
                <button
                  type='button'
                  onClick={() => onTabChange('announcements')}
                  className={cn(
                    'relative z-10 flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200',
                    activeTab === 'announcements'
                      ? 'text-foreground'
                      : 'text-muted-foreground hover:text-foreground/80'
                  )}
                >
                  <Megaphone
                    className={cn(
                      'size-3.5 transition-all duration-200',
                      activeTab === 'announcements'
                        ? 'text-foreground'
                        : 'text-muted-foreground/70'
                    )}
                  />
                  {t('Announcements')}
                </button>
              </div>
            </div>

            {/* Tab content */}
            <div className='px-3 pb-3'>
              {activeTab === 'notice' ? (
                <NoticeContent notice={notice} loading={loading} t={t} />
              ) : (
                <AnnouncementsContent
                  announcements={announcements}
                  loading={loading}
                  t={t}
                />
              )}
            </div>

            {/* Footer */}
            <div className='flex items-center justify-between border-t border-border/40 bg-muted/20 px-4 py-2'>
              <span className='text-muted-foreground text-[11px]'>
                {activeTab === 'notice'
                  ? t('Platform notice')
                  : `${announcements.length} ${t('events')}`}
              </span>
              <button
                type='button'
                onClick={(e) => {
                  e.stopPropagation()
                  onOpenChange(false)
                }}
                className='inline-flex h-6 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-muted hover:text-foreground transition-colors'
              >
                {t('Close')}
                <ChevronRight className='size-3' />
              </button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </>
  )
}
