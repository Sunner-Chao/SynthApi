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
import { ArrowRight, MessageSquareText } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { generalStarters, type PageContext } from './page-context'
import { relativeTime, secondsNow } from './time'
import type { Conversation } from './types'

function greetingKey(hour: number) {
  if (hour >= 5 && hour < 11) return 'Good morning'
  if (hour >= 11 && hour < 13) return 'Good midday'
  if (hour >= 13 && hour < 18) return 'Good afternoon'
  return 'Good evening'
}

export function EmptyState(props: {
  name: string
  context: PageContext | null
  recent: Conversation[]
  onAsk: (question: string) => void
  onOpen: (conversation: string) => void
}) {
  const { t, i18n } = useTranslation()
  const [now] = useState(secondsNow)
  const greeting = t(greetingKey(new Date(now * 1000).getHours()))
  const starters = props.context?.starters ?? generalStarters
  return (
    <div className='agent-empty'>
      <h2>
        {props.name
          ? t('{{greeting}}, {{name}}', { greeting, name: props.name })
          : greeting}
      </h2>
      <p>
        {t(
          'I can look things up in the docs, explain errors and take you to the right setting.'
        )}
      </p>
      <section aria-labelledby='agent-starters-title'>
        <h3 id='agent-starters-title'>
          {props.context
            ? t('Common questions on {{page}}', {
                page: t(props.context.label),
              })
            : t('Common questions')}
        </h3>
        <div className='agent-starters'>
          {starters.map((starter) => (
            <button
              key={starter}
              type='button'
              onClick={() => props.onAsk(t(starter))}
            >
              <span>{t(starter)}</span>
              <ArrowRight className='size-3.5 shrink-0' />
            </button>
          ))}
        </div>
      </section>
      {props.recent.length > 0 && (
        <section aria-labelledby='agent-recent-title'>
          <h3 id='agent-recent-title'>{t('Continue a recent conversation')}</h3>
          <ul className='agent-recent'>
            {props.recent.map((item) => (
              <li key={item.conversation}>
                <button
                  type='button'
                  onClick={() => props.onOpen(item.conversation)}
                >
                  <MessageSquareText className='size-3.5 shrink-0' />
                  <span>{item.title}</span>
                  <time>{relativeTime(item.updated, now, i18n.language)}</time>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
