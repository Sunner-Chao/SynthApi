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
import { useEffect, useRef, useState } from 'react'
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'

const TURNSTILE_SCRIPT_ID = 'cf-turnstile'
const TURNSTILE_SCRIPT_TIMEOUT_MS = 10_000

let turnstileScriptPromise: Promise<void> | null = null

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string
      remove?: (widgetId: string) => void
    }
  }
}

interface TurnstileProps {
  siteKey: string
  onVerify: (token: string) => void
  onExpire?: () => void
  className?: string
}

type TurnstileStatus = 'loading' | 'ready' | 'error' | 'expired'

function discardFailedScript() {
  document.getElementById(TURNSTILE_SCRIPT_ID)?.remove()
  turnstileScriptPromise = null
}

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve()
  if (turnstileScriptPromise) return turnstileScriptPromise

  turnstileScriptPromise = new Promise<void>((resolve, reject) => {
    let script = document.getElementById(
      TURNSTILE_SCRIPT_ID
    ) as HTMLScriptElement | null
    const timeoutId = window.setTimeout(() => {
      reject(new Error('Turnstile script load timed out'))
    }, TURNSTILE_SCRIPT_TIMEOUT_MS)

    const cleanup = () => {
      window.clearTimeout(timeoutId)
      script?.removeEventListener('load', handleLoad)
      script?.removeEventListener('error', handleError)
    }
    const handleLoad = () => {
      cleanup()
      if (!window.turnstile) {
        reject(new Error('Turnstile API is unavailable after script load'))
        return
      }
      if (script) script.dataset.loaded = 'true'
      resolve()
    }
    const handleError = () => {
      cleanup()
      reject(new Error('Turnstile script failed to load'))
    }

    if (!script) {
      script = document.createElement('script')
      script.id = TURNSTILE_SCRIPT_ID
      script.src =
        'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      script.async = true
      script.defer = true
      document.head.appendChild(script)
    }

    if (script.dataset.loaded === 'true') {
      handleLoad()
      return
    }
    script.addEventListener('load', handleLoad, { once: true })
    script.addEventListener('error', handleError, { once: true })
  }).catch((error: unknown) => {
    discardFailedScript()
    throw error
  })

  return turnstileScriptPromise
}

export function Turnstile(props: TurnstileProps) {
  const { t } = useTranslation()
  const ref = useRef<HTMLDivElement | null>(null)
  const onVerifyRef = useRef(props.onVerify)
  const onExpireRef = useRef(props.onExpire)
  const [status, setStatus] = useState<TurnstileStatus>('loading')
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    onVerifyRef.current = props.onVerify
    onExpireRef.current = props.onExpire
  }, [props.onExpire, props.onVerify])

  useEffect(() => {
    let active = true
    let widgetId: string | null = null

    const fail = () => {
      if (!active) return
      setStatus('error')
      onExpireRef.current?.()
    }

    void loadTurnstileScript().then(() => {
      if (!active || !ref.current || !window.turnstile) return
      try {
        widgetId = window.turnstile.render(ref.current, {
          sitekey: props.siteKey,
          callback: (token: string) => {
            if (!active) return
            setStatus('ready')
            onVerifyRef.current(token)
          },
          'error-callback': fail,
          'expired-callback': () => {
            if (!active) return
            setStatus('expired')
            onExpireRef.current?.()
          },
          'timeout-callback': fail,
        })
        setStatus('ready')
      } catch (_error) {
        fail()
      }
    }, fail)

    return () => {
      active = false
      if (widgetId && window.turnstile?.remove) {
        window.turnstile.remove(widgetId)
      }
    }
  }, [attempt, props.siteKey])

  const retry = () => {
    onExpireRef.current?.()
    setStatus('loading')
    setAttempt((value) => value + 1)
  }

  const failed = status === 'error' || status === 'expired'
  const statusMessage =
    status === 'expired'
      ? t('Human verification expired. Please retry.')
      : t('Unable to load human verification. Check your network and retry.')

  return (
    <div className={cn('space-y-2', props.className)}>
      <div ref={ref} className={cn(status === 'loading' && 'min-h-[65px]')} />
      {status === 'loading' && (
        <div
          className='text-muted-foreground flex items-center justify-center gap-2 text-xs'
          aria-live='polite'
        >
          <Loader2 className='size-3.5 animate-spin' aria-hidden='true' />
          <span>{t('Human verification is loading...')}</span>
        </div>
      )}
      {failed && (
        <div
          className='border-destructive/30 bg-destructive/5 text-destructive flex items-center gap-2 rounded-md border px-3 py-2 text-xs'
          role='alert'
        >
          <AlertCircle className='size-4 shrink-0' aria-hidden='true' />
          <span className='min-w-0 flex-1'>{statusMessage}</span>
          <Button
            type='button'
            variant='outline'
            size='sm'
            className='h-7 shrink-0 gap-1.5 px-2 text-xs'
            onClick={retry}
          >
            <RefreshCw className='size-3.5' aria-hidden='true' />
            {t('Retry')}
          </Button>
        </div>
      )}
    </div>
  )
}
