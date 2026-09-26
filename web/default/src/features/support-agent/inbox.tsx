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
import { useEffect, useRef } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Bell, CheckCheck, Mail, ArrowUpRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import {
  getInboxPreferences,
  readInbox,
  saveInboxPreferences,
  useBusinessInbox,
  type InboxItem,
} from './inbox-api'
import { openSupportAgent } from './queue'

export function BusinessInboxAlerts(props: { userId: number }) {
  const { t } = useTranslation()
  const inbox = useBusinessInbox()
  const notified = useRef(new Set<number>())
  const initialized = useRef(false)
  useEffect(() => {
    if (!inbox.data) return
    const key = `business-inbox-notified-${props.userId}`
    if (!initialized.current) {
      initialized.current = true
      try {
        const stored: unknown = JSON.parse(sessionStorage.getItem(key) || '[]')
        if (Array.isArray(stored))
          notified.current = new Set(
            stored.filter((id): id is number => typeof id === 'number')
          )
      } catch {
        /* In-memory deduplication is sufficient when storage is unavailable. */
      }
    }
    const fresh = inbox.data.items.filter(
      (item) =>
        !item.read_at &&
        item.kind !== 'support_handoff' &&
        !notified.current.has(item.id)
    )
    if (!fresh.length) return
    for (const item of fresh) notified.current.add(item.id)
    try {
      sessionStorage.setItem(
        key,
        JSON.stringify([...notified.current].slice(-500))
      )
    } catch {
      /* Optional browser storage. */
    }
    toast.info(
      fresh.length === 1
        ? fresh[0].title
        : t('{{count}} new account notifications', { count: fresh.length }),
      {
        id: `business-inbox-${props.userId}`,
        duration: 10000,
        closeButton: true,
        description: t('Open your inbox to review the latest updates.'),
        action: {
          label: t('View notifications'),
          onClick: () => openSupportAgent('notifications'),
        },
      }
    )
  }, [inbox.data, props.userId, t])
  useEffect(
    () => () => {
      toast.dismiss(`business-inbox-${props.userId}`)
    },
    [props.userId]
  )
  return null
}

export function BusinessInbox() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const userId = useAuthStore((s) => s.auth.user?.id)
  const inbox = useBusinessInbox()
  const qc = useQueryClient()
  const preferences = useQuery({
    queryKey: ['business-inbox-preferences', userId],
    queryFn: getInboxPreferences,
  })
  const markRead = useMutation({
    mutationFn: readInbox,
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ['business-inbox', userId] }),
  })
  const save = useMutation({
    mutationFn: saveInboxPreferences,
    onSuccess: (data) => {
      qc.setQueryData(['business-inbox-preferences', userId], data)
      toast.success(t('Notification preferences saved'))
    },
  })
  const openItem = (item: InboxItem) => {
    markRead.mutate([item.id])
    if (item.kind === 'support_handoff') {
      openSupportAgent('handoffs')
      return
    }
    const target = new URL(item.link, window.location.origin)
    if (target.origin !== window.location.origin) return
    void navigate({
      to: target.pathname,
      search: () => Object.fromEntries(target.searchParams),
    })
  }
  const emailLabels: Record<string, string> = {
    pending: t('Email queued'),
    sent: t('Email sent'),
    failed: t('Email delivery failed'),
    skipped: t('In-app only'),
  }
  return (
    <div className='agent-inbox min-h-0 flex-1 space-y-4 overflow-y-auto p-4'>
      <div className='flex items-center justify-between gap-3'>
        <div>
          <h2 className='text-sm font-semibold'>{t('Your notifications')}</h2>
          <p className='text-muted-foreground mt-1 text-xs'>
            {t('Rewards, reviews and service updates')}
          </p>
        </div>
        <Button
          size='icon-sm'
          variant='ghost'
          aria-label={t('Mark all read')}
          disabled={!inbox.data?.unread || markRead.isPending}
          onClick={() =>
            markRead.mutate(
              inbox.data?.items
                .filter((item) => !item.read_at)
                .map((item) => item.id) || []
            )
          }
        >
          <CheckCheck className='size-4' />
        </Button>
      </div>
      <details className='border-border rounded-xl border p-3 text-xs'>
        <summary className='flex cursor-pointer items-center gap-2 font-medium'>
          <Mail className='size-4' />
          {t('Email preferences')}
        </summary>
        {preferences.data && (
          <div className='mt-4 space-y-4'>
            <label className='flex items-start justify-between gap-4'>
              <span>
                <strong>{t('Account and service emails')}</strong>
                <small className='text-muted-foreground mt-1 block leading-5'>
                  {t(
                    'Receive reward results and important service updates. In-app notifications remain available.'
                  )}
                </small>
              </span>
              <Switch
                checked={preferences.data.email_enabled}
                disabled={save.isPending}
                onCheckedChange={(checked) =>
                  save.mutate({ ...preferences.data!, email_enabled: checked })
                }
              />
            </label>
            <label className='flex items-start justify-between gap-4'>
              <span>
                <strong>{t('Occasional return reminders')}</strong>
                <small className='text-muted-foreground mt-1 block leading-5'>
                  {t('Receive a gentle email when your new account has been inactive for seven days and has not been used.')}
                </small>
              </span>
              <Switch
                checked={preferences.data.marketing_enabled}
                disabled={save.isPending}
                onCheckedChange={(checked) =>
                  save.mutate({ ...preferences.data!, marketing_enabled: checked })
                }
              />
            </label>
            <label className='flex items-start justify-between gap-4'>
              <span>
                <strong>{t('My invitation link in emails')}</strong>
                <small className='text-muted-foreground mt-1 block leading-5'>
                  {t(
                    'Include your personal invitation link and a short reward guide in your account emails.'
                  )}
                </small>
              </span>
              <Switch
                checked={preferences.data.referral_footer_enabled}
                disabled={save.isPending}
                onCheckedChange={(checked) =>
                  save.mutate({
                    ...preferences.data!,
                    referral_footer_enabled: checked,
                  })
                }
              />
            </label>
            {!preferences.data.mail_configured && (
              <p className='text-muted-foreground'>
                {t(
                  'Email delivery is not configured. Your notifications are saved here.'
                )}
              </p>
            )}
          </div>
        )}
      </details>
      {inbox.isLoading && (
        <p className='text-muted-foreground py-8 text-center text-sm'>
          {t('Loading...')}
        </p>
      )}
      {inbox.isError && (
        <div role='alert'>
          <p>{t('Unable to load notifications')}</p>
          <Button
            variant='outline'
            onClick={() => {
              void inbox.refetch()
            }}
          >
            {t('Retry')}
          </Button>
        </div>
      )}
      {inbox.data?.items.length === 0 && (
        <div className='text-muted-foreground py-12 text-center'>
          <Bell className='mx-auto mb-3 size-7' />
          <p className='text-sm'>{t('You are all caught up')}</p>
        </div>
      )}
      {inbox.data?.items.map((item) => (
        <article
          key={item.id}
          className='border-border rounded-xl border p-4'
          data-unread={!item.read_at}
        >
          <div className='flex items-start gap-2'>
            {!item.read_at && (
              <span className='mt-1.5 size-2 shrink-0 rounded-full bg-amber-500' />
            )}
            <h3 className='text-sm font-semibold'>{item.title}</h3>
          </div>
          <p className='text-muted-foreground mt-2 text-xs leading-6 break-words whitespace-pre-wrap'>
            {item.content}
          </p>
          <div className='text-muted-foreground mt-3 flex flex-wrap items-center justify-between gap-2 text-[10px]'>
            <time>{new Date(item.created_at * 1000).toLocaleString()}</time>
            <span>{emailLabels[item.email_status] || t('In-app only')}</span>
          </div>
          <Button
            variant='outline'
            size='sm'
            className='mt-3'
            onClick={() => openItem(item)}
          >
            {t('View details')}
            <ArrowUpRight className='size-3' />
          </Button>
        </article>
      ))}
    </div>
  )
}
