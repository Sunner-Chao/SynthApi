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
import { useEffect, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useLocation, useNavigate } from '@tanstack/react-router'
import { Check, ChevronLeft, ChevronRight, LocateFixed, X } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { reportAction } from './api'
import { GUIDE_EVENT, type GuideRequest } from './guide-events'
import { openSupportAgent } from './queue'
import type { AssistantDraft } from './use-assistant-draft'

type Guide = GuideRequest & { step: number; active: boolean }
// Selectors are maintained with the page components. Model output cannot supply selectors or script.
const CATALOG: Record<
  string,
  { path: string; steps: { selector: string; instruction: string }[] }
> = {
  'open-keys': {
    path: '/keys',
    steps: [
      {
        selector: '[data-assistant="api-key-create"]',
        instruction:
          'Review the key permissions and quota, then create the key yourself.',
      },
    ],
  },
  'open-wallet': {
    path: '/wallet',
    steps: [
      {
        selector: '#topup-amount',
        instruction:
          'Choose the recharge amount. Review the payment details before you confirm.',
      },
    ],
  },
  'open-recharge-benefit': {
    path: '/rewards/recharge',
    steps: [
      {
        selector: '[data-assistant="recharge-benefit"]',
        instruction:
          'Review your recharge progress and the benefit eligibility.',
      },
    ],
  },
  'open-referral': {
    path: '/rewards/referral',
    steps: [
      {
        selector: '[data-assistant="referral-link"]',
        instruction:
          'Copy your invitation link and review the reward rules below.',
      },
    ],
  },
  'open-usage-logs': {
    path: '/usage-logs/common',
    steps: [
      {
        selector: '[data-assistant="usage-log-filter"]',
        instruction:
          'Use the time, model and request filters to locate the relevant usage record.',
      },
    ],
  },
  'open-image-workbench': {
    path: '/image-workbench',
    steps: [
      {
        selector: '[data-assistant="image-model"]',
        instruction: 'Choose the image model that fits your idea.',
      },
      {
        selector: '.iw-advanced-trigger',
        instruction: 'Open the optional settings and review size and quality.',
      },
      {
        selector: '#image-prompt',
        instruction: 'Write the prompt, or let me place the prepared draft here.',
      },
      {
        selector: '[data-assistant="image-generate"]',
        instruction: 'Review the estimate and your settings before generating.',
      },
    ],
  },
  'open-video-workbench': {
    path: '/video-workbench',
    steps: [
      {
        selector: '[data-assistant="video-group"]',
        instruction: 'Choose the group that contains your video model.',
      },
      {
        selector: '[data-assistant="video-model"]',
        instruction: 'Choose the video model for this task.',
      },
      {
        selector: '#video-prompt',
        instruction: 'Describe the subject, movement and camera view.',
      },
      {
        selector: '[data-assistant="video-parameters"]',
        instruction: 'Review duration, resolution and aspect ratio.',
      },
      {
        selector: '[data-assistant="video-options"]',
        instruction: 'Check optional audio and reference image settings.',
      },
      {
        selector: '[data-assistant="video-generate"]',
        instruction: 'Review the request once more, then start the video task.',
      },
    ],
  },
  'open-docs': {
    path: '/docs',
    steps: [
      {
        selector: '#overview',
        instruction:
          'Start with the API endpoint and available models, then follow the SDK example.',
      },
    ],
  },
}
function savedGuide(userId?: number): Guide | null {
  if (!userId) return null
  try {
    const value = JSON.parse(
      sessionStorage.getItem(`assistant-guide-${userId}`) || 'null'
    ) as Guide | null
    if (!value) return null
    const catalog = CATALOG[value.action.id]
    if (
      catalog?.path === value.action.path &&
      Number.isInteger(value.step) &&
      value.step >= 0 &&
      value.step < catalog.steps.length
    )
      return value
  } catch {
    /* Optional session storage. */
  }
  return null
}
export function AssistantActionGuide() {
  const { t } = useTranslation()
  const navigate = useNavigate()
  const page = useLocation({ select: (location) => location.pathname })
  const userId = useAuthStore((s) => s.auth.user?.id)
  const qc = useQueryClient()
  const [guide, setGuide] = useState<Guide | null>(() => savedGuide(userId))
  const [found, setFound] = useState(false)
  const [expired, setExpired] = useState(false)
  const [saving, setSaving] = useState(false)
  const [draftApplied, setDraftApplied] = useState(false)
  useEffect(() => {
    const show = async (event: Event) => {
      if (!(event instanceof CustomEvent)) return
      const request = event.detail as GuideRequest
      const allowed = CATALOG[request?.action?.id]
      if (!allowed || allowed.path !== request.action.path) return
      try {
        await reportAction({
          conversation: request.conversation,
          request_id: request.request_id,
          action_id: request.action.id,
          status: 'running',
        })
        setFound(false)
        setExpired(false)
        setDraftApplied(false)
        const next = { ...request, step: 0, active: true }
        setGuide(next)
        try {
          sessionStorage.setItem(
            `assistant-guide-${userId}`,
            JSON.stringify(next)
          )
        } catch {
          /* Optional session storage. */
        }
        window.dispatchEvent(new Event('synthapi:close-support-agent'))
        await navigate({ to: allowed.path })
      } catch {
        toast.error(t('Unable to start guidance. Please retry.'))
      }
    }
    window.addEventListener(GUIDE_EVENT, show)
    return () => window.removeEventListener(GUIDE_EVENT, show)
  }, [navigate, t, userId])
  const activeGuide =
    guide &&
    CATALOG[guide.action.id]?.path === page &&
    CATALOG[guide.action.id].steps[guide.step]
      ? guide
      : null
  useEffect(() => {
    if (!activeGuide) return
    const step = CATALOG[activeGuide.action.id].steps[activeGuide.step]
    let highlighted: HTMLElement | null = null
    const locate = () => {
      const target = document.querySelector<HTMLElement>(step.selector)
      if (!target || !target.getClientRects().length) return
      highlighted = target
      target.classList.add('assistant-action-target')
      target.scrollIntoView({ block: 'center', behavior: 'smooth' })
      setFound(true)
      observer.disconnect()
    }
    const observer = new MutationObserver(locate)
    observer.observe(document.body, { childList: true, subtree: true })
    const frame = window.requestAnimationFrame(locate)
    const timeout = window.setTimeout(() => {
      observer.disconnect()
      if (!highlighted) setExpired(true)
    }, 10000)
    return () => {
      observer.disconnect()
      window.cancelAnimationFrame(frame)
      window.clearTimeout(timeout)
      highlighted?.classList.remove('assistant-action-target')
    }
  }, [activeGuide])
  if (!activeGuide) return null
  const finish = async (status: 'succeeded' | 'cancelled' | 'failed') => {
    setSaving(true)
    try {
      await reportAction({
        conversation: activeGuide.conversation,
        request_id: activeGuide.request_id,
        action_id: activeGuide.action.id,
        status,
      })
      void qc.invalidateQueries({
        queryKey: ['support-history', userId, activeGuide.conversation],
      })
      setGuide(null)
      try {
        sessionStorage.removeItem(`assistant-guide-${userId}`)
      } catch {
        /* Optional session storage. */
      }
    } catch {
      toast.error(t('Unable to save guidance status. Please retry.'))
    } finally {
      setSaving(false)
    }
  }
  const applyDraft = () => {
    const text = activeGuide.action.draft
    if (!text) return
    const target =
      activeGuide.action.id === 'open-image-workbench' ? 'image' : 'video'
    const detail: AssistantDraft = { target, text, applied: false }
    window.dispatchEvent(
      new CustomEvent('synthapi:assistant-draft', { detail })
    )
    setDraftApplied(detail.applied)
    if (!detail.applied)
      toast.error(
        t(
          'The editor is unavailable or generating. Try again after the current task finishes.'
        )
      )
  }
  const steps = CATALOG[activeGuide.action.id].steps
  const isLastStep = activeGuide.step === steps.length - 1
  const goToStep = (step: number) => {
    const next = { ...activeGuide, step, active: true }
    setFound(false)
    setExpired(false)
    setDraftApplied(false)
    setGuide(next)
    try {
      sessionStorage.setItem(
        `assistant-guide-${userId}`,
        JSON.stringify(next)
      )
    } catch {
      /* Optional session storage. */
    }
  }
  const instruction =
    CATALOG[activeGuide.action.id].steps[activeGuide.step].instruction
  return (
    <aside className='assistant-action-guide' role='status' aria-live='polite'>
      <div className='assistant-action-guide-icon'>
        <LocateFixed className='size-4' />
      </div>
      <div className='min-w-0 flex-1'>
        <strong>
          {t('Assistant guide')}: {activeGuide.action.label}
        </strong>
        <small>
          {t('Step {{current}} of {{total}}', {
            current: activeGuide.step + 1,
            total: steps.length,
          })}
        </small>
        <p>{t(instruction)}</p>
        {!found && (
          <small>
            {expired
              ? t(
                  'The control is unavailable on this page. Ask the assistant for another way.'
                )
              : t('Waiting for the page controls…')}
          </small>
        )}
        {activeGuide.action.draft && (
          <div className='mt-3 rounded-lg border p-2'>
            <strong>{t('Prompt draft')}</strong>
            <p className='max-h-32 overflow-auto whitespace-pre-wrap'>
              {activeGuide.action.draft}
            </p>
            <Button
              size='sm'
              variant='outline'
              className='mt-2'
              disabled={!found || draftApplied}
              onClick={applyDraft}
            >
              {draftApplied
                ? t('Draft applied')
                : t('Replace editor with this draft')}
            </Button>
            <small>
              {t(
                'This only fills the prompt. Review the model, price and parameters before submitting.'
              )}
            </small>
          </div>
        )}
        <div className='assistant-action-guide-actions'>
          <Button
            size='sm'
            variant='secondary'
            onClick={() =>
              openSupportAgent('chat', {
                prompt: t(
                  'Please explain the next step on this page: {{page}}',
                  { page }
                ),
              })
            }
          >
            {t('Ask about this page')}
          </Button>
          {activeGuide.step > 0 && (
            <Button
              size='sm'
              variant='ghost'
              disabled={saving}
              onClick={() => goToStep(activeGuide.step - 1)}
            >
              <ChevronLeft className='size-3.5' />
              {t('Previous step')}
            </Button>
          )}
          <Button
            size='sm'
            variant={isLastStep ? 'ghost' : 'secondary'}
            disabled={saving || !found}
            onClick={() => {
              if (isLastStep) void finish('succeeded')
              else goToStep(activeGuide.step + 1)
            }}
          >
            {isLastStep ? (
              <Check className='size-3.5' />
            ) : (
              <ChevronRight className='size-3.5' />
            )}
            {isLastStep ? t('Finish guidance') : t('Next step')}
          </Button>
        </div>
        <small>
          {t(
            'I will stay with you until the last step. You remain in control of every submission.'
          )}
        </small>
      </div>
      <Button
        size='icon-sm'
        variant='ghost'
        disabled={saving}
        aria-label={t('Close guidance')}
        onClick={() => {
          void finish(expired ? 'failed' : 'cancelled')
        }}
      >
        <X className='size-4' />
      </Button>
    </aside>
  )
}
