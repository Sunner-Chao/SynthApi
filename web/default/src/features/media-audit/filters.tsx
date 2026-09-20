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
import type { Dispatch, FormEvent, SetStateAction } from 'react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { MediaFilters, MediaView } from './types'

export function MediaFiltersForm(props: {
  filters: MediaFilters
  setFilters: Dispatch<SetStateAction<MediaFilters>>
  view: MediaView
  isAdmin: boolean
  onSubmit: (event: FormEvent) => void
  onReset: () => void
  statusLabel: (status: string) => string
}) {
  const { t } = useTranslation()
  const field = (key: keyof MediaFilters, label: string, type = 'text') => (
    <label className='min-w-0 space-y-1 text-xs' key={key}>
      <span>{label}</span>
      <Input
        type={type}
        aria-label={label}
        value={props.filters[key]}
        onChange={(event) =>
          props.setFilters((current) => ({
            ...current,
            [key]: event.target.value,
          }))
        }
      />
    </label>
  )
  const statuses =
    props.view === 'requests'
      ? ['CONSUME', 'REFUND', 'ERROR']
      : [
          'NOT_START',
          'SUBMITTED',
          'QUEUED',
          'IN_PROGRESS',
          'SUCCESS',
          'FAILURE',
          'UNKNOWN',
        ]
  return (
    <form
      onSubmit={props.onSubmit}
      className='bg-muted/20 grid grid-cols-1 gap-3 rounded-lg border p-3 sm:grid-cols-2 xl:grid-cols-4'
    >
      {field('start', t('Start Time'), 'datetime-local')}
      {field('end', t('End Time'), 'datetime-local')}
      {field('model', t('Model (exact match)'))}
      {field('identifier', t('Task / request ID'))}
      <label className='space-y-1 text-xs'>
        <span>{t('Status')}</span>
        <select
          aria-label={t('Status')}
          className='bg-background h-9 w-full rounded-md border px-3 text-sm'
          value={props.filters.status}
          onChange={(event) =>
            props.setFilters((current) => ({
              ...current,
              status: event.target.value,
            }))
          }
        >
          <option value=''>{t('All statuses')}</option>
          {statuses.map((status) => (
            <option key={status} value={status}>
              {props.statusLabel(status)}
            </option>
          ))}
        </select>
      </label>
      {props.isAdmin && (
        <>
          {field('user_id', t('User ID'), 'number')}
          {field('channel_id', t('Channel ID'), 'number')}
        </>
      )}
      <div className='flex items-end gap-2'>
        <Button type='submit'>{t('Search')}</Button>
        <Button type='button' variant='outline' onClick={props.onReset}>
          {t('Reset')}
        </Button>
      </div>
    </form>
  )
}
