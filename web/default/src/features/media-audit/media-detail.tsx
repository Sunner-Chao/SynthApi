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
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { formatLogQuota, formatTimestamp, formatUseTime } from '@/lib/format'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { MediaKind, MediaRow } from './types'

export function MediaDetail(props: {
  row: MediaRow
  kind: MediaKind
  onClose: () => void
  statusLabel: (status: string) => string
}) {
  const { t } = useTranslation()
  const [mediaError, setMediaError] = useState(false)
  const row = props.row
  const fields = [
    [t('Model'), row.model],
    [t('Task ID'), row.task_id],
    [t('Request ID'), row.request_id],
    [t('Status'), props.statusLabel(row.status)],
    [t('Action'), row.action],
    [t('Time'), formatTimestamp(row.created_at)],
    [t('Finish Time'), row.finish_time ? formatTimestamp(row.finish_time) : ''],
    [t('Duration'), formatUseTime(row.duration)],
    [t('Cost'), formatLogQuota(row.quota)],
    [t('User ID'), row.user_id],
    [t('Channel ID'), row.channel_id],
    [t('Token Name'), row.token_name],
    [t('Group'), row.group],
    [t('Request path'), row.request_path],
    [t('Size'), row.size],
    [t('Quality'), row.quality],
    [t('Image count'), row.image_count],
  ]
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) props.onClose()
      }}
    >
      <DialogContent className='max-h-[90vh] overflow-y-auto sm:max-w-3xl'>
        <DialogHeader>
          <DialogTitle>{t('Media log details')}</DialogTitle>
          <DialogDescription>
            {t('Task results and billing entries are separate audit records.')}
          </DialogDescription>
        </DialogHeader>
        <dl className='grid grid-cols-1 gap-3 sm:grid-cols-2'>
          {fields
            .filter(([, value]) => value !== undefined && value !== '')
            .map(([label, value]) => (
              <div key={label}>
                <dt className='text-muted-foreground text-xs'>{label}</dt>
                <dd className='break-all'>{value}</dd>
              </div>
            ))}
        </dl>
        {(row.prompt || row.message) && (
          <div className='bg-muted/50 rounded-lg p-3'>
            <h3 className='mb-2 font-medium'>{t('Prompt / message')}</h3>
            <p className='max-h-72 overflow-auto break-words whitespace-pre-wrap'>
              {[row.prompt, row.message].filter(Boolean).join('\n\n')}
            </p>
          </div>
        )}
        <div className='flex flex-wrap gap-3'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => {
              void navigator.clipboard
                .writeText(row.task_id || row.request_id || row.id)
                .then(() => toast.success(t('Copied')))
                .catch(() => toast.error(t('Copy failed')))
            }}
          >
            {t('Copy ID')}
          </Button>
          {row.content_url && (
            <a
              className='text-primary self-center underline'
              href={`${row.content_url}?download=1`}
            >
              {t('Download result')}
            </a>
          )}
        </div>
        {row.content_url &&
          !mediaError &&
          (props.kind === 'video' ? (
            <video
              className='w-full rounded-lg bg-black'
              src={row.content_url}
              controls
              playsInline
              preload='metadata'
              onError={() => setMediaError(true)}
            />
          ) : (
            <img
              className='max-h-[28rem] w-full rounded-lg object-contain'
              src={row.content_url}
              alt={t('Generated image')}
              onError={() => setMediaError(true)}
            />
          ))}
        {mediaError && (
          <p role='alert' className='text-amber-700 dark:text-amber-400'>
            {t(
              'Result could not be loaded. The upstream resource may have expired; the audit record remains available.'
            )}
          </p>
        )}
      </DialogContent>
    </Dialog>
  )
}
