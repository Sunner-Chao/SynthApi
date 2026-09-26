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
import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import type { TFunction } from 'i18next'
import { Bot } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { SectionPageLayout } from '@/components/layout'
import { getConsoleOverview } from '../api'
import { openSupportAgent, useHandoffQueue } from '../queue'
import type { ConsoleOverview } from '../types'
import './console.css'
import { ConsoleDesktop } from './desktop'
import { ConsoleKnowledge, type KnowledgeDraft } from './knowledge'
import { ConsoleSettings } from './settings'
import { ConsoleTickets } from './tickets'
import { ConsoleUnresolved } from './unresolved'

export type ConsoleTab =
  | 'tickets'
  | 'unresolved'
  | 'knowledge'
  | 'desktop'
  | 'settings'

const percent = (part: number, whole: number) =>
  whole > 0 ? `${Math.round((part / whole) * 100)}%` : '—'

function duration(seconds: number | null | undefined, t: TFunction) {
  if (seconds === null || seconds === undefined) return '—'
  const minutes = Math.max(1, Math.round(seconds / 60))
  if (minutes < 60) return t('{{count}} min', { count: minutes })
  return t('{{hours}} h {{minutes}} min', {
    hours: Math.floor(minutes / 60),
    minutes: minutes % 60,
  })
}

function Stat(props: { label: string; value: string | number; hint: string }) {
  return (
    <div className='sc-stat'>
      <span className='sc-stat-label'>{props.label}</span>
      <strong className='sc-stat-value'>{props.value}</strong>
      <span className='sc-stat-hint'>{props.hint}</span>
    </div>
  )
}

function OverviewStrip(props: { data?: ConsoleOverview }) {
  const { t } = useTranslation()
  const data = props.data
  const days = data?.days ?? 7
  const votes = data ? data.votes.up + data.votes.down : 0
  return (
    <div className='sc-overview' aria-busy={!data}>
      <Stat
        label={t('Waiting for a reply')}
        value={data?.tickets.pending ?? '—'}
        hint={t('Tickets in the queue')}
      />
      <Stat
        label={t('Waiting for the user')}
        value={data?.tickets.replied ?? '—'}
        hint={t('Replied, not yet confirmed')}
      />
      <Stat
        label={t('Median first reply')}
        value={duration(data?.first_reply.median, t)}
        hint={t('{{count}} site tickets in {{days}} days', {
          count: data?.first_reply.count ?? 0,
          days,
        })}
      />
      <Stat
        label={t('Disliked answers')}
        value={data ? percent(data.votes.down, votes) : '—'}
        hint={t('{{count}} votes in {{days}} days', { count: votes, days })}
      />
      <Stat
        label={t('Passed to a person')}
        value={data ? percent(data.answers.handoff, data.answers.total) : '—'}
        hint={t('{{count}} questions in {{days}} days', {
          count: data?.answers.total ?? 0,
          days,
        })}
      />
    </div>
  )
}

// The support team's page: tickets, unresolved questions, knowledge, desktop
// tasks and settings. The side panel stays a conversation with the assistant.
export function SupportConsole(props: {
  tab: ConsoleTab
  onTabChange: (tab: ConsoleTab) => void
}) {
  const { t } = useTranslation()
  const overview = useQuery({
    queryKey: ['support-console-overview'],
    queryFn: getConsoleOverview,
    refetchInterval: 60000,
  })
  const queue = useHandoffQueue()
  const pending =
    queue.data?.items.filter((item) => item.status === 'pending').length ?? 0
  // A group of unresolved questions becomes a knowledge draft on the knowledge tab.
  const [draft, setDraft] = useState<KnowledgeDraft | null>(null)
  // Tabs load on first visit and then stay mounted (hidden), so an unsent
  // reply or unsaved edit survives a look at another tab.
  const [visited, setVisited] = useState<ConsoleTab[]>([props.tab])
  if (!visited.includes(props.tab)) setVisited([...visited, props.tab])
  const panel = (tab: ConsoleTab, content: ReactNode) => (
    <TabsContent value={tab} keepMounted>
      {visited.includes(tab) && content}
    </TabsContent>
  )
  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Support console')}</SectionPageLayout.Title>
      <SectionPageLayout.Actions>
        <Button size='sm' variant='outline' onClick={() => openSupportAgent()}>
          <Bot className='size-4' />
          {t('Open the site assistant')}
        </Button>
      </SectionPageLayout.Actions>
      <SectionPageLayout.Content>
        <div className='sc-page'>
          <OverviewStrip data={overview.data} />
          <Tabs
            value={props.tab}
            onValueChange={(value) => props.onTabChange(value as ConsoleTab)}
          >
            <TabsList variant='line' className='sc-tabs'>
              <TabsTrigger value='tickets'>
                {t('Tickets')}
                {pending > 0 && <span className='sc-count'>{pending}</span>}
              </TabsTrigger>
              <TabsTrigger value='unresolved'>
                {t('Unresolved questions')}
              </TabsTrigger>
              <TabsTrigger value='knowledge'>{t('Knowledge')}</TabsTrigger>
              <TabsTrigger value='desktop'>{t('Desktop tasks')}</TabsTrigger>
              <TabsTrigger value='settings'>{t('Settings')}</TabsTrigger>
            </TabsList>
            {panel('tickets', <ConsoleTickets />)}
            {panel(
              'unresolved',
              <ConsoleUnresolved
                onDraft={(next) => {
                  setDraft(next)
                  props.onTabChange('knowledge')
                }}
              />
            )}
            {panel('knowledge', <ConsoleKnowledge draft={draft} />)}
            {panel('desktop', <ConsoleDesktop />)}
            {panel('settings', <ConsoleSettings />)}
          </Tabs>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
}
