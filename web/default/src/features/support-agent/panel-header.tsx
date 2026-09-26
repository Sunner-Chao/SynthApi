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
import {
  BookOpen,
  Bot,
  ChevronDown,
  ChevronLeft,
  Download,
  Ellipsis,
  History,
  Keyboard,
  Maximize2,
  Minimize2,
  SquarePen,
  Users,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { shortcutLabel, type AgentTab } from './queue'

// One row: the conversation title opens history; actions sit on the right.
export function PanelHeader(props: {
  view: AgentTab
  title: string
  admin: boolean
  pendingCount: number
  otherUnread: boolean
  historyOpen: boolean
  wide: boolean
  busy: boolean
  canExport: boolean
  onToggleHistory: () => void
  onOpenHistory: () => void
  onNew: () => void
  onToggleWide: () => void
  onExport: () => void
  onView: (view: AgentTab) => void
  onClose: () => void
}) {
  const { t } = useTranslation()
  const viewTitle =
    props.view === 'handoffs' ? t('Human queue') : t('Knowledge')
  return (
    <header className='agent-header'>
      {props.view === 'chat' ? (
        <button
          type='button'
          className='agent-title'
          aria-expanded={props.historyOpen}
          aria-controls='support-history'
          title={t('Conversation history')}
          onClick={props.onToggleHistory}
        >
          <Bot className='text-primary size-4 shrink-0' />
          <span className='agent-title-text'>{props.title}</span>
          {props.otherUnread && (
            <span className='agent-unread-dot' aria-label={t('New reply')} />
          )}
          <ChevronDown className='agent-title-chevron size-3.5 shrink-0' />
        </button>
      ) : (
        <div className='agent-title is-static'>
          <Button
            size='icon-xs'
            variant='ghost'
            aria-label={t('Back to conversation')}
            title={t('Back to conversation')}
            onClick={() => props.onView('chat')}
          >
            <ChevronLeft className='size-4' />
          </Button>
          <span className='agent-title-text'>{viewTitle}</span>
        </div>
      )}
      <div className='agent-header-actions'>
        {props.view === 'chat' && (
          <Button
            size='icon-sm'
            variant='ghost'
            aria-label={t('New conversation')}
            title={t('New conversation')}
            disabled={props.busy}
            onClick={props.onNew}
          >
            <SquarePen className='size-4' />
          </Button>
        )}
        <Button
          size='icon-sm'
          variant='ghost'
          className='hidden sm:inline-flex'
          aria-label={props.wide ? t('Collapse') : t('Expand')}
          title={props.wide ? t('Collapse') : t('Expand')}
          onClick={props.onToggleWide}
        >
          {props.wide ? (
            <Minimize2 className='size-4' />
          ) : (
            <Maximize2 className='size-4' />
          )}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size='icon-sm'
                variant='ghost'
                className='relative'
                aria-label={t('More')}
                title={t('More')}
              />
            }
          >
            <Ellipsis className='size-4' />
            {props.admin && props.pendingCount > 0 && (
              <span className='agent-unread-dot is-corner' />
            )}
          </DropdownMenuTrigger>
          <DropdownMenuContent align='end' className='w-56'>
            <DropdownMenuItem onClick={props.onOpenHistory}>
              <History />
              {t('Conversation history')}
            </DropdownMenuItem>
            <DropdownMenuItem
              disabled={!props.canExport}
              onClick={props.onExport}
            >
              <Download />
              {t('Export conversation')}
            </DropdownMenuItem>
            {props.admin && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuGroup>
                  <DropdownMenuLabel>{t('Administrator')}</DropdownMenuLabel>
                  <DropdownMenuItem onClick={() => props.onView('handoffs')}>
                    <Users />
                    {t('Human queue')}
                    {props.pendingCount > 0 && (
                      <span className='agent-queue-count ml-auto'>
                        {props.pendingCount}
                      </span>
                    )}
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => props.onView('knowledge')}>
                    <BookOpen />
                    {t('Knowledge')}
                  </DropdownMenuItem>
                </DropdownMenuGroup>
              </>
            )}
            <DropdownMenuSeparator />
            <div className='agent-menu-hint'>
              <Keyboard className='size-3.5 shrink-0' />
              {t('Open or close the assistant: {{keys}}', {
                keys: shortcutLabel(),
              })}
            </div>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          size='icon-sm'
          variant='ghost'
          aria-label={t('Close')}
          title={t('Close')}
          onClick={props.onClose}
        >
          <X className='size-4' />
        </Button>
      </div>
    </header>
  )
}
