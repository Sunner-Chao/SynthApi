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
import { useLayoutEffect, type RefObject } from 'react'
import { ArrowUp, FileText, Plus, Square, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'

const MAX_LENGTH = 4000
const COUNTER_FROM = 3500
const MAX_INPUT_HEIGHT = 148 // six lines of text

export function Composer(props: {
  inputRef: RefObject<HTMLTextAreaElement | null>
  value: string
  onChange: (value: string) => void
  onSubmit: () => void
  onStop: () => void
  pending: boolean
  stopping: boolean
  pageLabel: string
  includePage: boolean
  onIncludePageChange: (include: boolean) => void
  notice: string
}) {
  const { t } = useTranslation()
  const { inputRef, value } = props
  useLayoutEffect(() => {
    const input = inputRef.current
    if (!input) return
    input.style.height = 'auto'
    input.style.height = `${Math.min(input.scrollHeight, MAX_INPUT_HEIGHT)}px`
  }, [inputRef, value])
  return (
    <form
      className='agent-composer'
      onSubmit={(event) => {
        event.preventDefault()
        props.onSubmit()
      }}
    >
      <div className='agent-composer-box'>
        {props.pageLabel && (
          <div className='agent-context-row'>
            {props.includePage ? (
              <span className='agent-context-chip'>
                <FileText className='size-3 shrink-0' />
                <span className='truncate'>{props.pageLabel}</span>
                <button
                  type='button'
                  aria-label={t('Do not send the current page')}
                  title={t('Do not send the current page')}
                  onClick={() => props.onIncludePageChange(false)}
                >
                  <X className='size-3' />
                </button>
              </span>
            ) : (
              <button
                type='button'
                className='agent-context-chip is-off'
                onClick={() => props.onIncludePageChange(true)}
              >
                <Plus className='size-3 shrink-0' />
                <span className='truncate'>
                  {t('Add page: {{page}}', { page: props.pageLabel })}
                </span>
              </button>
            )}
          </div>
        )}
        <label htmlFor='support-question' className='sr-only'>
          {t('Ask the assistant')}
        </label>
        <div className='agent-composer-row'>
          <textarea
            id='support-question'
            ref={inputRef}
            value={value}
            rows={1}
            maxLength={MAX_LENGTH}
            placeholder={t('Ask the assistant')}
            onChange={(event) => props.onChange(event.target.value)}
            onKeyDown={(event) => {
              // keyCode 229 covers IME confirmations in browsers without isComposing.
              if (
                event.key === 'Enter' &&
                !event.shiftKey &&
                !event.nativeEvent.isComposing &&
                event.keyCode !== 229
              ) {
                event.preventDefault()
                props.onSubmit()
              }
            }}
          />
          <div className='agent-composer-actions'>
            {value.length > COUNTER_FROM && (
              <span className='agent-counter' aria-live='polite'>
                {value.length}/{MAX_LENGTH}
              </span>
            )}
            {props.pending ? (
              <Button
                type='button'
                size='icon-sm'
                variant='secondary'
                className='agent-send'
                aria-label={t('Stop')}
                title={t('Stop')}
                disabled={props.stopping}
                onClick={props.onStop}
              >
                <Square className='size-3 fill-current' />
              </Button>
            ) : (
              <Button
                type='submit'
                size='icon-sm'
                className='agent-send'
                aria-label={t('Send')}
                title={t('Send')}
                disabled={!value.trim()}
              >
                <ArrowUp className='size-4' />
              </Button>
            )}
          </div>
        </div>
      </div>
      {props.notice && (
        <p className='agent-composer-notice' role='alert'>
          {props.notice}
        </p>
      )}
      <p className='agent-composer-hint'>
        <span className='agent-hint-keys'>
          {t('Enter to send, Shift+Enter for a new line')}
          {' · '}
        </span>
        {t('AI answers can be wrong. Never share keys or passwords.')}
      </p>
    </form>
  )
}
