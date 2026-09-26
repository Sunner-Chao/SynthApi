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
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { getSupportSettings, saveSupportSettings } from '../api'
import { generalStarters, PAGES } from '../page-context'
import { normalizeSettings, SETTINGS_KEY, serviceHoursText } from '../settings'
import type { ServiceHours, SupportSettings } from '../types'

const QUESTION_LIMIT = 120
const STARTER_SLOTS = [0, 1, 2]
// Every page with its own suggested questions, then everything else.
const STARTER_PAGES = [
  ...PAGES.map((page) => ({
    key: page.prefix,
    label: page.label,
    defaults: page.starters,
  })),
  { key: 'general', label: 'Other pages', defaults: generalStarters },
]

// Blank questions are dropped, and pages left without any.
function cleanStarters(starters: Record<string, string[]>) {
  return Object.fromEntries(
    Object.entries(starters)
      .map(([page, questions]): [string, string[]] => [
        page,
        questions.map((question) => question.trim()).filter(Boolean),
      ])
      .filter(([, questions]) => questions.length > 0)
  )
}

const minutesOf = (clock: string) => {
  const [hours, minutes] = clock.split(':').map(Number)
  return hours * 60 + minutes
}

function hoursProblem(hours: ServiceHours) {
  if (!hours.start || !hours.end || hours.start >= hours.end)
    return 'The closing time must be later than the opening time.'
  // Also keeps the time-left count on tickets within its bounds.
  if (minutesOf(hours.end) - minutesOf(hours.start) < 60)
    return 'The working day must be at least one hour long.'
  if (
    !Number.isInteger(hours.reply_hours) ||
    hours.reply_hours < 1 ||
    hours.reply_hours > 72
  )
    return 'The reply time must be between 1 and 72 hours.'
  return ''
}

function ServiceHoursForm(props: {
  hours: ServiceHours
  onChange: (hours: ServiceHours) => void
}) {
  const { t } = useTranslation()
  const { hours } = props
  const set = (patch: Partial<ServiceHours>) =>
    props.onChange({ ...hours, ...patch })
  const problem = hoursProblem(hours)
  return (
    <section
      className='sc-card sc-editor sc-settings-block'
      aria-labelledby='sc-hours'
    >
      <h3 id='sc-hours'>{t('Service hours')}</h3>
      <p className='sc-muted'>
        {t(
          'Shown on every ticket card and used for the time left on each ticket.'
        )}
      </p>
      <div className='sc-editor-row'>
        <label>
          <span>{t('Opens at')}</span>
          <input
            type='time'
            step={60}
            required
            value={hours.start}
            onChange={(event) => set({ start: event.target.value })}
          />
        </label>
        <label>
          <span>{t('Closes at')}</span>
          <input
            type='time'
            step={60}
            required
            value={hours.end}
            onChange={(event) => set({ end: event.target.value })}
          />
        </label>
        <label>
          <span>{t('Usual reply time (hours)')}</span>
          <input
            type='number'
            min={1}
            max={72}
            step={1}
            required
            value={hours.reply_hours}
            onChange={(event) =>
              set({ reply_hours: Number(event.target.value) })
            }
          />
        </label>
      </div>
      <label className='sc-check'>
        <input
          type='checkbox'
          checked={hours.weekdays_only}
          onChange={(event) => set({ weekdays_only: event.target.checked })}
        />
        <span>{t('Weekdays only (Monday to Friday)')}</span>
      </label>
      {problem ? (
        <p role='alert' className='sc-warning'>
          {t(problem)}
        </p>
      ) : (
        <p className='sc-preview-line'>
          <span className='sc-muted'>{t('Customers see')}: </span>
          {serviceHoursText(hours, true, t)}
        </p>
      )}
    </section>
  )
}

function StartersForm(props: {
  starters: Record<string, string[]>
  onChange: (starters: Record<string, string[]>) => void
}) {
  const { t } = useTranslation()
  const [page, setPage] = useState(STARTER_PAGES[0].key)
  const current =
    STARTER_PAGES.find((item) => item.key === page) ?? STARTER_PAGES[0]
  const custom = props.starters[page] ?? []
  const setQuestion = (slot: number, value: string) => {
    const next = STARTER_SLOTS.map((index) =>
      index === slot ? value : (custom[index] ?? '')
    )
    props.onChange({ ...props.starters, [page]: next })
  }
  const reset = () =>
    props.onChange(
      Object.fromEntries(
        Object.entries(props.starters).filter(([key]) => key !== page)
      )
    )
  const customised = Object.entries(props.starters).filter(([, questions]) =>
    questions.some((question) => question.trim())
  )
  return (
    <section
      className='sc-card sc-editor sc-settings-block'
      aria-labelledby='sc-starters'
    >
      <h3 id='sc-starters'>{t('Suggested questions')}</h3>
      <p className='sc-muted'>
        {t(
          'Up to three per page, shown when a conversation starts. Only ask what the published knowledge can answer. Custom questions appear in the Chinese interface; other languages keep the defaults.'
        )}
      </p>
      <label>
        <span>{t('Page')}</span>
        <select value={page} onChange={(event) => setPage(event.target.value)}>
          {STARTER_PAGES.map((item) => (
            <option key={item.key} value={item.key}>
              {t(item.label)}
              {props.starters[item.key]?.some((q) => q.trim()) ? ' ✓' : ''}
            </option>
          ))}
        </select>
      </label>
      {STARTER_SLOTS.map((slot) => (
        <label key={`${page}-${slot}`}>
          <span>{t('Question {{number}}', { number: slot + 1 })}</span>
          <input
            maxLength={QUESTION_LIMIT}
            value={custom[slot] ?? ''}
            placeholder={
              current.defaults[slot] ? t(current.defaults[slot]) : ''
            }
            onChange={(event) => setQuestion(slot, event.target.value)}
          />
        </label>
      ))}
      <div className='sc-actions'>
        <span className='sc-muted'>
          {customised.length
            ? t('{{count}} pages use custom questions', {
                count: customised.length,
              })
            : t('All pages use the default questions')}
        </span>
        <Button
          type='button'
          size='sm'
          variant='ghost'
          disabled={!custom.length}
          onClick={reset}
        >
          {t('Use the defaults for this page')}
        </Button>
      </div>
    </section>
  )
}

// Service hours and suggested questions, for everyone who opens the assistant.
export function ConsoleSettings() {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const stored = useQuery({
    queryKey: SETTINGS_KEY,
    queryFn: getSupportSettings,
  })
  // Unsaved edits; until the first change the stored settings are shown.
  const [edited, setEdited] = useState<SupportSettings | null>(null)
  const form = edited ?? normalizeSettings(stored.data)
  const save = useMutation({
    mutationFn: () =>
      saveSupportSettings({
        service_hours: form.service_hours,
        starters: cleanStarters(form.starters),
      }),
    onSuccess: (saved) => {
      qc.setQueryData(SETTINGS_KEY, saved)
      setEdited(null)
      toast.success(t('Settings saved.'))
    },
    onError: () => toast.error(t('Unable to save the settings.')),
  })
  if (stored.isLoading) return <p className='sc-muted'>{t('Loading…')}</p>
  if (stored.isError)
    return (
      <p role='alert' className='sc-muted'>
        {t('Unable to load the settings.')}
      </p>
    )
  return (
    <form
      className='sc-settings'
      onSubmit={(event) => {
        event.preventDefault()
        save.mutate()
      }}
    >
      <ServiceHoursForm
        hours={form.service_hours}
        onChange={(service_hours) => setEdited({ ...form, service_hours })}
      />
      <StartersForm
        starters={form.starters}
        onChange={(starters) => setEdited({ ...form, starters })}
      />
      <div className='sc-actions sc-settings-save'>
        {edited && <span className='sc-muted'>{t('Unsaved changes')}</span>}
        {edited && (
          <Button
            type='button'
            size='sm'
            variant='ghost'
            onClick={() => setEdited(null)}
          >
            {t('Discard')}
          </Button>
        )}
        <Button
          type='submit'
          size='sm'
          disabled={
            !edited ||
            save.isPending ||
            Boolean(hoursProblem(form.service_hours))
          }
        >
          {save.isPending ? t('Saving…') : t('Save settings')}
        </Button>
      </div>
    </form>
  )
}
