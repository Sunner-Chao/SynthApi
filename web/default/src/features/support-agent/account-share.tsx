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
import { ShieldCheck, UserRound, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { CONTEXT_KINDS, contextLabel } from './account-context'
import type { AccountContextKind } from './types'
import type { AccountShare } from './use-account-share'

export function ShareMenu(props: { share: AccountShare; disabled: boolean }) {
  const { t } = useTranslation()
  const taken = new Set(props.share.attached.map((item) => item.kind))
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <button
            type='button'
            className='agent-share-trigger'
            disabled={props.disabled}
          />
        }
      >
        <UserRound className='size-3 shrink-0' />
        <span className='truncate'>{t('Share account info')}</span>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='start' className='w-64'>
        <DropdownMenuGroup>
          <DropdownMenuLabel className='agent-share-menu-note'>
            {t('You see exactly what is shared before it is sent.')}
          </DropdownMenuLabel>
          {CONTEXT_KINDS.map((kind) => (
            <DropdownMenuItem
              key={kind}
              disabled={taken.has(kind)}
              onClick={() => props.share.open(kind)}
            >
              {contextLabel(kind, t)}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export function SharedChips(props: { share: AccountShare }) {
  const { t } = useTranslation()
  return props.share.attached.map((item) => (
    <span key={item.kind} className='agent-shared-chip'>
      <ShieldCheck className='size-3 shrink-0' />
      <span className='truncate'>{contextLabel(item.kind, t)}</span>
      <button
        type='button'
        aria-label={t('Stop sharing {{kind}}', {
          kind: contextLabel(item.kind, t),
        })}
        title={t('Stop sharing {{kind}}', {
          kind: contextLabel(item.kind, t),
        })}
        onClick={() => props.share.remove(item.kind)}
      >
        <X className='size-3' />
      </button>
    </span>
  ))
}

// The consent step: the exact text, then attach or cancel. The text (or why
// it could not be read) takes the focus once it is there; closing hands the
// focus back through onClose.
export function SharePreview(props: {
  share: AccountShare
  onClose?: () => void
}) {
  const { t } = useTranslation()
  const { preview } = props.share
  const section = useRef<HTMLElement>(null)
  const settled = preview.isSuccess || preview.isError
  useEffect(() => {
    if (settled)
      section.current
        ?.querySelector<HTMLElement>('pre, [role="alert"]')
        ?.focus()
  }, [settled, preview.submittedAt])
  if (preview.isIdle) return null
  const kind = preview.variables
  const close = (action: () => void) => () => {
    action()
    props.onClose?.()
  }
  return (
    <section
      ref={section}
      className='agent-share-preview'
      aria-label={t('Share account info')}
      aria-busy={preview.isPending}
    >
      <header>
        <strong>
          {kind
            ? t('Share with the assistant: {{kind}}', {
                kind: contextLabel(kind, t),
              })
            : t('Share account info')}
        </strong>
        <span>{t('For your next question only; not kept afterwards.')}</span>
      </header>
      {preview.isPending && <p>{t('Reading your account…')}</p>}
      {preview.isError && (
        <p role='alert' tabIndex={-1}>
          {t('Could not read this from your account. Please try again.')}
        </p>
      )}
      {preview.data && <pre tabIndex={0}>{preview.data.text}</pre>}
      <footer>
        <Button
          type='button'
          size='sm'
          variant='ghost'
          onClick={close(props.share.cancel)}
        >
          {t('Cancel')}
        </Button>
        <Button
          type='button'
          size='sm'
          disabled={!preview.data}
          onClick={close(props.share.confirm)}
        >
          {t('Attach')}
        </Button>
      </footer>
    </section>
  )
}

// Shown under an answer that needs the user's own data to be accurate; the
// answer itself says why.
export function ShareRequest(props: {
  kind: AccountContextKind
  disabled?: boolean
  onShare: () => void
}) {
  const { t } = useTranslation()
  return (
    <div className='agent-share-request'>
      <ShieldCheck className='size-4 shrink-0' />
      <p>
        {t('{{kind}} · for this question only', {
          kind: contextLabel(props.kind, t),
        })}
      </p>
      <Button
        type='button'
        size='sm'
        variant='outline'
        disabled={props.disabled}
        onClick={props.onShare}
      >
        {t('Review and share')}
      </Button>
    </div>
  )
}
