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
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Pause, Play } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { setDesktopPause } from '../api'
import { useHandoffQueue } from '../queue'

// WeChat desktop automation. Pausing takes one more click, so it is never
// switched off (or back on) by accident.
export function ConsoleDesktop() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const queue = useHandoffQueue()
  const workflow = queue.data?.workflow
  const [confirming, setConfirming] = useState(false)
  const pause = useMutation({
    mutationFn: setDesktopPause,
    onSuccess: (result) => {
      setConfirming(false)
      toast.success(
        result.paused ? t('Desktop tasks paused.') : t('Desktop tasks resumed.')
      )
      void qc.invalidateQueries({ queryKey: ['support-handoffs'] })
    },
    onError: () => toast.error(t('Unable to change the desktop state.')),
  })
  if (queue.isError)
    return (
      <p role='alert' className='sc-muted'>
        {t('Unable to load queue')}
      </p>
    )
  if (!workflow) return <p className='sc-muted'>{t('Loading…')}</p>
  const counts = Object.entries(workflow.counts).filter(([, value]) => value)
  return (
    <div className='sc-desktop'>
      <section
        className='sc-card sc-desktop-state'
        data-paused={workflow.paused}
      >
        <div>
          <strong>
            {workflow.paused
              ? t('Desktop tasks are paused')
              : t('Desktop tasks are running')}
          </strong>
          <p className='sc-muted'>
            {workflow.paused
              ? t('No WeChat messages are read or sent until you resume.')
              : t(
                  'The desktop reads WeChat questions and sends checked replies. Pause it before changing the desktop.'
                )}
          </p>
        </div>
        {confirming ? (
          <div className='sc-actions'>
            <span className='sc-muted'>
              {workflow.paused ? t('Resume now?') : t('Pause now?')}
            </span>
            <Button
              size='sm'
              variant={workflow.paused ? 'default' : 'destructive'}
              disabled={pause.isPending}
              onClick={() => pause.mutate(!workflow.paused)}
            >
              {t('Confirm')}
            </Button>
            <Button
              size='sm'
              variant='ghost'
              onClick={() => setConfirming(false)}
            >
              {t('Cancel')}
            </Button>
          </div>
        ) : (
          <Button
            size='sm'
            variant='outline'
            onClick={() => setConfirming(true)}
          >
            {workflow.paused ? (
              <Play className='size-3.5' />
            ) : (
              <Pause className='size-3.5' />
            )}
            {workflow.paused ? t('Resume observation') : t('Pause desktop')}
          </Button>
        )}
      </section>
      {counts.length > 0 && (
        <dl className='sc-desktop-counts'>
          {counts.map(([status, value]) => (
            <div key={status}>
              <dt>{t('support.job.' + status)}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      )}
      <div className='sc-table-scroll'>
        <table className='sc-table'>
          <thead>
            <tr>
              <th>{t('Contact')}</th>
              <th>{t('Status')}</th>
              <th>{t('Attempts')}</th>
              <th>{t('Updated')}</th>
              <th>{t('Note')}</th>
            </tr>
          </thead>
          <tbody>
            {workflow.jobs.slice(0, 50).map((job) => (
              <tr key={job.id}>
                <td>{job.contact || '—'}</td>
                <td>{t('support.job.' + job.status)}</td>
                <td>{job.attempt}</td>
                <td>{new Date(job.updated * 1000).toLocaleString()}</td>
                <td className='sc-muted'>{job.error || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!workflow.jobs.length && (
          <p className='sc-empty'>{t('No desktop tasks yet.')}</p>
        )}
      </div>
    </div>
  )
}
