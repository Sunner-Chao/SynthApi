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
import { useMemo, useState, type MouseEvent } from 'react'
import {
  Check,
  ChevronRight,
  ChevronsUpDown,
  CircleAlert,
  CircleCheck,
  CircleSlash,
  Network,
  RefreshCw,
  Star,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { cn } from '@/lib/utils'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import type { GroupChannelStatusSummary } from '../types'
import './auto-group-order-editor.css'

export type ApiKeyGroupOption = {
  value: string
  label: string
  desc?: string
  ratio?: number | string
  channelStatus?: GroupChannelStatusSummary
}

type ApiKeyGroupComboboxProps = {
  options: ApiKeyGroupOption[]
  value?: string
  onValueChange: (value: string) => void
  onOpenChange?: (open: boolean) => void
  onTestGroup?: (group: string) => void
  placeholder?: string
  disabled?: boolean
  statusLoading?: boolean
  testingGroups?: Set<string>
}

function formatGroupRatio(
  ratio: ApiKeyGroupOption['ratio'],
  ratioLabel: string
) {
  if (ratio === undefined || ratio === null || ratio === '') return null
  return `${ratio}x ${ratioLabel}`
}

function getRatioBadgeClassName(ratio: ApiKeyGroupOption['ratio']) {
  if (typeof ratio !== 'number') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
  }

  if (ratio > 5) {
    return 'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300'
  }
  if (ratio > 3) {
    return 'border-orange-200 bg-orange-50 text-orange-700 dark:border-orange-900/60 dark:bg-orange-950/40 dark:text-orange-300'
  }
  if (ratio > 1) {
    return 'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300'
  }
  return 'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300'
}

function GroupRatioBadge({ ratio }: { ratio: ApiKeyGroupOption['ratio'] }) {
  const { t } = useTranslation()
  const label = formatGroupRatio(ratio, t('Ratio'))

  if (!label) return null

  return (
    <Badge
      variant='outline'
      className={cn(
        'max-w-24 shrink-0 truncate text-[10px] sm:max-w-none sm:text-xs',
        getRatioBadgeClassName(ratio)
      )}
    >
      {label}
    </Badge>
  )
}

function RecommendedGroupBadge({ className }: { className?: string } = {}) {
  const { t } = useTranslation()

  return (
    <Badge
      variant='outline'
      className={cn(
        'shrink-0 gap-1 border-amber-300 bg-amber-100 px-1.5 text-[10px] font-semibold text-amber-800 sm:text-xs dark:border-amber-700/80 dark:bg-amber-950/60 dark:text-amber-200',
        className
      )}
    >
      <Star className='size-3 fill-current' />
      {t('Recommended')}
    </Badge>
  )
}

function getChannelStatusView(
  status?: GroupChannelStatusSummary,
  loading = false
) {
  if (loading) {
    return {
      label: 'Testing',
      detail: '',
      icon: CircleSlash,
      className:
        'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-300',
    }
  }

  if (!status) {
    return {
      label: 'Not tested',
      detail: '',
      icon: CircleSlash,
      className:
        'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300',
    }
  }

  if (status.total <= 0) {
    return {
      label: 'No channels',
      detail: '',
      icon: CircleSlash,
      className:
        'border-slate-200 bg-slate-50 text-slate-600 dark:border-slate-800 dark:bg-slate-950/40 dark:text-slate-300',
    }
  }

  const reachable = status.tested > 0 ? status.reachable : status.enabled
  if (reachable > 0) {
    return {
      label: `${reachable}/${status.total}`,
      detail:
        status.best_response_time > 0
          ? `${status.best_response_time}ms`
          : 'available',
      icon: CircleCheck,
      className:
        'border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-300',
    }
  }

  return {
    label: `0/${status.total}`,
    detail:
      status.auto_disabled > 0
        ? 'auto disabled'
        : status.manually_disabled > 0
          ? 'disabled'
          : 'unavailable',
    icon: CircleAlert,
    className:
      'border-rose-200 bg-rose-50 text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/40 dark:text-rose-300',
  }
}

function ChannelStatusBadge({
  status,
  compact = false,
  loading = false,
}: {
  status?: GroupChannelStatusSummary
  compact?: boolean
  loading?: boolean
}) {
  const { t } = useTranslation()
  const view = getChannelStatusView(status, loading)
  const Icon = view.icon
  const lastTestTime =
    status?.last_test_time && status.last_test_time > 0
      ? new Date(status.last_test_time * 1000).toLocaleString()
      : ''
  const title = loading
    ? t('Testing current channel connectivity')
    : !status
      ? t('Not tested yet. Click the test button to check connectivity.')
      : status && status.total > 0
        ? [
            t('Current channels: {{enabled}} available / {{total}} total', {
              enabled: status.tested > 0 ? status.reachable : status.enabled,
              total: status.total,
            }),
            status.tested > 0
              ? t('Tested channels: {{tested}}', {
                  tested: status.tested,
                })
              : '',
            status.best_response_time > 0
              ? t('Best latency: {{latency}}ms', {
                  latency: status.best_response_time,
                })
              : '',
            lastTestTime
              ? t('Last tested: {{time}}', { time: lastTestTime })
              : '',
          ]
            .filter(Boolean)
            .join('\n')
        : t('No current channels')

  return (
    <Badge
      variant='outline'
      title={title}
      className={cn(
        'shrink-0 gap-1 px-1.5 text-[10px] sm:text-xs',
        view.className
      )}
    >
      <Icon className='size-3' />
      <span>{view.label}</span>
      {!compact && view.detail ? (
        <span className='hidden opacity-75 sm:inline'>· {t(view.detail)}</span>
      ) : null}
    </Badge>
  )
}

function AutoChannelStatus({
  status,
  loading = false,
}: {
  status?: GroupChannelStatusSummary
  loading?: boolean
}) {
  const { t } = useTranslation()
  const reachable = status
    ? status.tested > 0
      ? status.reachable
      : status.enabled
    : 0
  const total = status?.total ?? 0
  const available = reachable > 0
  const Icon = loading
    ? CircleSlash
    : available
      ? CircleCheck
      : total > 0
        ? CircleAlert
        : CircleSlash
  const label = loading ? '...' : status ? `${reachable}/${total}` : '--'
  const title = loading
    ? t('Testing current channel connectivity')
    : t('Current channels: {{enabled}} available / {{total}} total', {
        enabled: reachable,
        total,
      })

  return (
    <span
      className='auto-group-channel-status'
      data-state={loading ? 'loading' : available ? 'available' : 'offline'}
      title={title}
    >
      <Icon className={cn('size-3.5', loading && 'animate-spin')} />
      <span>{label}</span>
    </span>
  )
}

export function ApiKeyGroupCombobox({
  options,
  value,
  onValueChange,
  onOpenChange,
  onTestGroup,
  placeholder,
  disabled,
  statusLoading,
  testingGroups,
}: ApiKeyGroupComboboxProps) {
  const { t } = useTranslation()
  const [open, setOpen] = useState(false)
  const [searchValue, setSearchValue] = useState('')
  const selectedOption = options.find((option) => option.value === value)
  const isAutoSelected = selectedOption?.value === 'auto'

  const filteredOptions = useMemo(() => {
    const search = searchValue.trim().toLowerCase()
    if (!search) return options

    return options.filter((option) => {
      const ratioText = String(option.ratio ?? '').toLowerCase()
      return (
        option.value.toLowerCase().includes(search) ||
        option.label.toLowerCase().includes(search) ||
        option.desc?.toLowerCase().includes(search) ||
        ratioText.includes(search)
      )
    })
  }, [options, searchValue])

  const handleSelect = (selectedValue: string) => {
    onValueChange(selectedValue)
    setOpen(false)
    onOpenChange?.(false)
    setSearchValue('')
  }

  const handleOpenChange = (nextOpen: boolean) => {
    setOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }

  const handleTestGroup = (
    event: MouseEvent<HTMLButtonElement>,
    group: string
  ) => {
    event.preventDefault()
    event.stopPropagation()
    onTestGroup?.(group)
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger
        render={
          <Button
            type='button'
            variant='outline'
            role='combobox'
            aria-expanded={open}
            disabled={disabled}
            className={cn(
              'border-input bg-muted/40 hover:bg-muted/55 hover:text-foreground active:bg-background data-popup-open:border-ring data-popup-open:bg-background data-popup-open:ring-ring/20 h-auto min-h-14 w-full justify-between gap-2 rounded-lg px-3 py-2 text-start shadow-none transition-[background-color,border-color,box-shadow] duration-150 data-popup-open:ring-[3px] sm:min-h-20 sm:gap-3 sm:px-4 sm:py-3',
              isAutoSelected &&
                'auto-group-neon-card auto-group-selection-trigger border-transparent bg-transparent text-white hover:text-white data-popup-open:border-cyan-200/70 data-popup-open:bg-transparent data-popup-open:ring-cyan-300/20'
            )}
          />
        }
      >
        <span
          className={cn(
            'flex min-w-0 flex-1 items-center justify-between gap-2 sm:gap-3',
            isAutoSelected && 'auto-group-selection-layout'
          )}
        >
          {isAutoSelected ? (
            <span className='auto-group-selection-icon flex size-10 shrink-0 items-center justify-center rounded-xl sm:size-12'>
              <Network className='size-5 text-cyan-200 sm:size-6' />
            </span>
          ) : null}
          <span className='min-w-0 flex-1'>
            <span className='flex min-w-0 items-center gap-2'>
              <span
                className={cn(
                  'block truncate font-medium',
                  isAutoSelected && 'auto-group-selection-title'
                )}
              >
                {selectedOption?.label || placeholder || t('Select a group')}
              </span>
              {selectedOption?.value === 'auto' ? (
                <RecommendedGroupBadge className='auto-group-recommended-badge' />
              ) : null}
            </span>
            {selectedOption?.desc ? (
              <span
                className={cn(
                  'text-muted-foreground block truncate text-[11px] sm:text-xs',
                  isAutoSelected && 'auto-group-selection-description'
                )}
              >
                {selectedOption.desc}
              </span>
            ) : null}
          </span>
          <span className='hidden shrink-0 sm:block'>
            {isAutoSelected ? (
              <span className='auto-group-selection-metrics'>
                <AutoChannelStatus
                  status={selectedOption?.channelStatus}
                  loading={statusLoading}
                />
                <span className='auto-group-auto-ratio'>
                  {selectedOption?.ratio ?? t('Auto')}x {t('Ratio')}
                </span>
              </span>
            ) : (
              <span className='flex items-center gap-1.5'>
                <ChannelStatusBadge
                  status={selectedOption?.channelStatus}
                  compact
                  loading={statusLoading}
                />
                <GroupRatioBadge ratio={selectedOption?.ratio} />
              </span>
            )}
          </span>
        </span>
        {isAutoSelected ? (
          <ChevronRight className='auto-group-selection-chevron size-5 shrink-0' />
        ) : (
          <ChevronsUpDown className='h-4 w-4 shrink-0 opacity-50' />
        )}
      </PopoverTrigger>
      <PopoverContent
        className='data-closed:zoom-out-100 data-open:zoom-in-100 data-[side=bottom]:slide-in-from-top-0 data-[side=left]:slide-in-from-right-0 data-[side=right]:slide-in-from-left-0 data-[side=top]:slide-in-from-bottom-0 w-[var(--anchor-width)] overflow-hidden rounded-xl p-0 shadow-lg data-closed:duration-75 data-open:duration-100'
        onWheel={(event) => event.stopPropagation()}
        onTouchMove={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={t('Search...')}
            value={searchValue}
            onValueChange={setSearchValue}
          />
          <CommandList className='max-h-[360px]'>
            <CommandEmpty>{t('No group found.')}</CommandEmpty>
            <CommandGroup>
              {filteredOptions.map((option) => (
                <CommandItem
                  key={option.value}
                  value={option.value}
                  onSelect={() => handleSelect(option.value)}
                  className={cn(
                    'data-[selected=true]:bg-muted items-start gap-3 rounded-lg border border-transparent px-3 py-3 transition-colors',
                    option.value === 'auto' &&
                      'border-amber-300/80 bg-amber-50/80 shadow-[inset_3px_0_0_0_rgb(245_158_11)] data-[selected=true]:bg-amber-100 dark:border-amber-800/80 dark:bg-amber-950/40 dark:data-[selected=true]:bg-amber-950/70'
                  )}
                >
                  <Check
                    className={cn(
                      'mt-0.5 h-4 w-4',
                      value === option.value ? 'opacity-100' : 'opacity-0'
                    )}
                  />
                  <span className='min-w-0 flex-1'>
                    <span className='flex min-w-0 items-center gap-2'>
                      <span className='block truncate font-medium'>
                        {option.label}
                      </span>
                      {option.value === 'auto' ? (
                        <RecommendedGroupBadge />
                      ) : null}
                    </span>
                    {option.desc && (
                      <span className='text-muted-foreground block truncate text-xs'>
                        {option.desc}
                      </span>
                    )}
                  </span>
                  <span className='flex shrink-0 items-center gap-1.5'>
                    <ChannelStatusBadge
                      status={option.channelStatus}
                      loading={
                        statusLoading || testingGroups?.has(option.value)
                      }
                    />
                    <GroupRatioBadge ratio={option.ratio} />
                    {onTestGroup ? (
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        className='size-7 shrink-0'
                        title={t('Test current group connectivity')}
                        disabled={testingGroups?.has(option.value)}
                        onClick={(event) =>
                          handleTestGroup(event, option.value)
                        }
                      >
                        <RefreshCw
                          className={cn(
                            'size-3.5',
                            testingGroups?.has(option.value) && 'animate-spin'
                          )}
                        />
                      </Button>
                    ) : null}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
