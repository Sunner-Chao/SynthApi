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
import { Button } from '@/components/ui/button'
import { maskSecrets } from './secrets'

// Small inline form for text that goes to the support team. Secrets are masked
// first, the same way as in the composer, and the user confirms the masked text.
export function TicketForm(props: {
  placeholder: string
  submitLabel: string
  optional?: boolean
  busy: boolean
  onSubmit: (text: string) => void
  onCancel: () => void
}) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [notice, setNotice] = useState('')
  const empty = !text.trim()
  return (
    <form
      className='agent-ticket-form'
      onSubmit={(event) => {
        event.preventDefault()
        if (props.busy || (empty && !props.optional)) return
        const masked = maskSecrets(text.trim(), t('[private key removed]'))
        if (masked.count) {
          setText(masked.text)
          setNotice(
            t(
              'Hid {{count}} secrets in your message. Check it, then send again.',
              { count: masked.count }
            )
          )
          return
        }
        props.onSubmit(masked.text)
      }}
    >
      <textarea
        value={text}
        rows={3}
        maxLength={1000}
        autoFocus
        aria-label={props.placeholder}
        placeholder={props.placeholder}
        onChange={(event) => {
          setText(event.target.value)
          if (notice) setNotice('')
        }}
      />
      {notice && (
        <p className='agent-composer-notice' role='alert'>
          {notice}
        </p>
      )}
      <div className='agent-ticket-form-actions'>
        <Button
          type='submit'
          size='sm'
          disabled={props.busy || (empty && !props.optional)}
        >
          {props.submitLabel}
        </Button>
        <Button
          type='button'
          size='sm'
          variant='ghost'
          onClick={props.onCancel}
        >
          {t('Cancel')}
        </Button>
      </div>
    </form>
  )
}
