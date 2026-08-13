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
import { type ColumnDef } from '@tanstack/react-table'
import {
  CircleAlert,
  CircleCheck,
  Eye,
  KeyRound,
  RotateCcw,
  Sparkles,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { getUserAvatarFallback, getUserAvatarStyle } from '@/lib/avatar'
import { formatBillingCurrencyFromUSD } from '@/lib/currency'
import {
  formatUseTime,
  formatLogQuota,
  formatTimestampToDate,
} from '@/lib/format'
import { cn } from '@/lib/utils'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { DataTableColumnHeader } from '@/components/data-table'
import { StatusBadge, type StatusBadgeProps } from '@/components/status-badge'
import {
  formatSubscriptionDiscountOffPercent,
  formatSubscriptionDiscountPercent,
} from '@/features/subscriptions/lib'
import { LOG_TYPE_ALL_VALUE } from '../../constants'
import {
  formatModelName,
  getFirstResponseTimeColor,
  getResponseTimeColor,
  getTieredBillingSummary,
  getSubscriptionBillingDisplay,
  hasAnyCacheTokens,
  isViolationFeeLog,
  isAutoGroupLog,
  getAutoRouteStatus,
  parseLogOther,
} from '../../lib/format'
import {
  getLogFirstResponseLatency,
  type FirstResponseLatencySource,
} from '../../lib/latency'
import {
  formatTokensPerSecond,
  getLogThroughputAssessment,
  type ThroughputUnavailabilityReason,
} from '../../lib/throughput'
import {
  isDisplayableLogType,
  isTimingLogType,
  getLogTypeConfig,
  isPerCallBilling,
} from '../../lib/utils'
import type { LogOtherData, UsageLog } from '../../types'
import {
  ApiLineBadge,
  ChannelConcurrencyBadge,
  WorkerNodeBadge,
} from '../api-line-badge'
import { DetailsDialog } from '../dialogs/details-dialog'
import { ModelBadge } from '../model-badge'
import { useUsageLogsContext } from '../usage-logs-provider'

interface DetailSegment {
  text: string
  muted?: boolean
  danger?: boolean
}

function getFirstResponseTooltip(
  source: FirstResponseLatencySource | null,
  t: (key: string) => string
): string {
  switch (source) {
    case 'upstream_first_event':
      return t(
        'Upstream first token, excluding client upload and upstream request write'
      )
    case 'upstream_first_body':
      return t(
        'Upstream first response body, excluding client upload and upstream request write'
      )
    case 'end_to_end':
      return t('Legacy end-to-end first response; upstream timing unavailable')
    default:
      return t('First response timing unavailable')
  }
}

function getThroughputTooltip(t: (key: string) => string): string {
  return t(
    'Measured from the first upstream stream event to response completion'
  )
}

function getUnavailableThroughputTooltip(
  reason: ThroughputUnavailabilityReason,
  t: (key: string) => string
): string {
  if (reason === 'buffered_stream') {
    return t(
      'Upstream returned buffered stream data; token throughput cannot be measured'
    )
  }
  return t(
    'Token throughput is unavailable because this stream cannot be measured reliably'
  )
}

function formatRatioCompact(ratio: number | undefined): string {
  if (ratio == null || !Number.isFinite(ratio)) return '-'
  return ratio % 1 === 0
    ? String(ratio)
    : ratio.toFixed(2).replace(/\.?0+$/, '')
}

function getGroupRatioText(other: LogOtherData | null): string | null {
  const userGroupRatio = other?.user_group_ratio
  if (
    userGroupRatio != null &&
    userGroupRatio !== -1 &&
    Number.isFinite(userGroupRatio)
  ) {
    return `${formatRatioCompact(userGroupRatio)}x`
  }

  const groupRatio = other?.group_ratio
  if (groupRatio != null && groupRatio !== 1 && Number.isFinite(groupRatio)) {
    return `${formatRatioCompact(groupRatio)}x`
  }

  return null
}

function getEffectiveGroupRatio(other: LogOtherData | null): number {
  const userGroupRatio = other?.user_group_ratio
  if (
    userGroupRatio != null &&
    userGroupRatio !== -1 &&
    Number.isFinite(userGroupRatio)
  ) {
    return userGroupRatio
  }

  const groupRatio = other?.group_ratio
  if (groupRatio != null && Number.isFinite(groupRatio)) {
    return groupRatio
  }

  return 1
}

function splitQuotaDisplay(value: string): { prefix: string; amount: string } {
  const match = value.match(/^([^0-9+\-.,\s]+)(.+)$/)
  if (!match) return { prefix: '', amount: value }
  return { prefix: match[1], amount: match[2] }
}

function buildDetailSegments(
  log: UsageLog,
  other: LogOtherData | null,
  t: (key: string, opts?: Record<string, unknown>) => string
): DetailSegment[] {
  const formatDetailQuota = (quota: number) =>
    formatLogQuota(quota).replace(/([.,]\d{2})\d+/, '$1')

  if (log.type === 6) {
    return [{ text: t('Async task refund') }]
  }

  if (log.type !== 2) return []

  const isViolation = isViolationFeeLog(other)
  if (isViolation) {
    const segments: DetailSegment[] = []
    segments.push({ text: t('Violation Fee'), danger: true })
    if (other?.violation_fee_code) {
      segments.push({
        text: other.violation_fee_code,
        muted: true,
      })
    }
    segments.push({
      text: `${t('Fee')}: ${formatDetailQuota(other?.fee_quota ?? log.quota)}`,
      muted: true,
    })
    return segments
  }

  if (!other) return []

  const segments: DetailSegment[] = []

  const priceOpts = { digitsLarge: 2, digitsSmall: 2, abbreviate: false }
  const effectiveGroupRatio = getEffectiveGroupRatio(other)
  const formatUnitPrice = (price: number) =>
    `${formatBillingCurrencyFromUSD(price * effectiveGroupRatio, priceOpts)} / 1M tokens`
  const formatPrice = (price: number) =>
    `${formatBillingCurrencyFromUSD(price * effectiveGroupRatio, priceOpts)}/M`
  const isTieredExpr = other.billing_mode === 'tiered_expr'
  const tieredSummary = getTieredBillingSummary(other)
  if (isTieredExpr) {
    if (tieredSummary) {
      const inputEntry = tieredSummary.priceEntries.find(
        (entry) => entry.field === 'inputPrice'
      )
      if (inputEntry) {
        segments.push({
          text: `${t('Input')} ${formatUnitPrice(inputEntry.price)}`,
        })
      }

      const cacheReadEntry = tieredSummary.priceEntries.find(
        (entry) => entry.field === 'cacheReadPrice'
      )
      if (cacheReadEntry) {
        segments.push({
          text: `${t('Cache Read')} ${formatUnitPrice(cacheReadEntry.price)}`,
          muted: true,
        })
      }

      const otherEntries = tieredSummary.priceEntries
        .filter(
          (entry) =>
            ![
              'inputPrice',
              'outputPrice',
              'cacheReadPrice',
              'cacheCreatePrice',
              'cacheCreate5mPrice',
              'cacheCreate1hPrice',
            ].includes(entry.field)
        )
        .map((entry) => `${t(entry.shortLabel)} ${formatPrice(entry.price)}`)
      if (otherEntries.length > 0) {
        segments.push({
          text: otherEntries.join(' · '),
          muted: true,
        })
      }
    } else {
      segments.push({
        text: `${t('Dynamic Pricing')} · ${t('No matching results')}`,
        muted: true,
      })
    }
  } else {
    const isPerCall = isPerCallBilling(other.model_price)
    if (isPerCall) {
      segments.push({
        text: `${t('Per-call')} · ${formatBillingCurrencyFromUSD(other.model_price! * effectiveGroupRatio, priceOpts)}`,
      })
    } else if (other.model_ratio != null) {
      const inputPriceUSD = other.model_ratio * 2.0
      segments.push({
        text: `${t('Input')} ${formatUnitPrice(inputPriceUSD)}`,
      })

      if (hasAnyCacheTokens(other) && other.cache_ratio != null) {
        segments.push({
          text: `${t('Cache Read')} ${formatUnitPrice(inputPriceUSD * other.cache_ratio)}`,
          muted: true,
        })
      }
    } else {
      const userGroupRatio = other.user_group_ratio
      const groupRatio = other.group_ratio
      const isUserGroup =
        userGroupRatio != null &&
        Number.isFinite(userGroupRatio) &&
        userGroupRatio !== -1
      const effectiveRatio = isUserGroup ? userGroupRatio : groupRatio
      const ratioLabel = isUserGroup
        ? t('User Exclusive Ratio')
        : t('Group Ratio')

      if (effectiveRatio != null && Number.isFinite(effectiveRatio)) {
        segments.push({
          text: `${ratioLabel} ${formatRatioCompact(effectiveRatio)}x`,
        })
      }
    }
  }

  if (other.is_system_prompt_overwritten) {
    segments.push({
      text: t('System Prompt Override'),
      danger: true,
    })
  }

  return segments
}

export function useCommonLogsColumns(isAdmin: boolean): ColumnDef<UsageLog>[] {
  const { t } = useTranslation()
  const columns: ColumnDef<UsageLog>[] = [
    {
      accessorKey: 'created_at',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Time')} />
      ),
      cell: ({ row }) => {
        const log = row.original
        const timestamp = row.getValue('created_at') as number
        const fullTimestamp = formatTimestampToDate(timestamp)
        const compactTimestamp = fullTimestamp.replace(/^\d{4}-/, '')
        const config = getLogTypeConfig(log.type)
        const other = parseLogOther(log.other)

        return (
          <div className='command-log-time flex min-w-[12rem] flex-col gap-1'>
            <span
              className='font-mono text-xs tabular-nums'
              title={fullTimestamp}
            >
              {compactTimestamp}
            </span>
            <div className='grid grid-cols-2 items-center gap-x-1.5 gap-y-1'>
              <StatusBadge
                label={t(config.label)}
                variant={config.color as StatusBadgeProps['variant']}
                size='sm'
                copyable={false}
                className='!text-xs [&_span]:!text-xs'
              />
              {isTimingLogType(log.type) ? (
                <ApiLineBadge
                  line={other?.ingress_line}
                  host={other?.ingress_host}
                  className='!text-xs [&_span]:!text-xs'
                />
              ) : (
                <span />
              )}
              {isTimingLogType(log.type) ? (
                <WorkerNodeBadge
                  node={other?.worker_node}
                  className='!text-xs [&_span]:!text-xs'
                />
              ) : (
                <span />
              )}
              {isTimingLogType(log.type) ? (
                <ChannelConcurrencyBadge
                  active={other?.channel_concurrency_active}
                  limit={other?.channel_concurrency_limit}
                  className='!text-xs [&_span]:!text-xs'
                />
              ) : (
                <span />
              )}
            </div>
          </div>
        )
      },
      filterFn: (row, _id, value) => {
        if (!Array.isArray(value) || value.length === 0) return true
        if (value.includes(LOG_TYPE_ALL_VALUE)) return true
        return value.includes(String(row.original.type))
      },
      enableHiding: false,
      meta: { label: t('Time') },
    },
  ]

  if (isAdmin) {
    columns.push(
      {
        id: 'channel',
        accessorFn: (row) => row.channel,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('Channel')} />
        ),
        cell: function ChannelCell({ row }) {
          const { sensitiveVisible, setAffinityTarget, setAffinityDialogOpen } =
            useUsageLogsContext()
          const log = row.original

          if (!isDisplayableLogType(log.type)) return null

          const other = parseLogOther(log.other)
          const affinity = other?.admin_info?.channel_affinity
          const useChannel = other?.admin_info?.use_channel
          const channelChain =
            useChannel && useChannel.length > 0
              ? useChannel.join(' → ')
              : undefined
          const channelDisplay = log.channel_name
            ? `${log.channel_name} #${log.channel}`
            : `#${log.channel}`
          const channelIdDisplay = `#${log.channel}`
          const channelName = sensitiveVisible ? log.channel_name : '••••'

          return (
            <div className='command-log-channel flex min-w-0 flex-col gap-1'>
              <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <div className='command-log-channel flex min-w-0 flex-col gap-0.5' />
                  }
                >
                  <div className='relative inline-flex w-fit'>
                    <StatusBadge
                      label={channelIdDisplay}
                      autoColor={String(log.channel)}
                      copyText={String(log.channel)}
                      size='sm'
                      showDot={false}
                      className='font-mono'
                    />
                    {affinity && (
                      <button
                        type='button'
                        className='absolute -top-1 -right-1 leading-none text-amber-500'
                        onClick={(e) => {
                          e.stopPropagation()
                          setAffinityTarget({
                            rule_name: affinity.rule_name || '',
                            using_group:
                              affinity.using_group ||
                              affinity.selected_group ||
                              '',
                            key_hint: affinity.key_hint || '',
                            key_fp: affinity.key_fp || '',
                          })
                          setAffinityDialogOpen(true)
                        }}
                      >
                        <Sparkles className='size-3 fill-current' />
                      </button>
                    )}
                  </div>
                  {log.channel_name && (
                    <span className='command-log-secondary text-muted-foreground/70 truncate [font-family:var(--font-body)] !text-xs'>
                      {channelName}
                    </span>
                  )}
                </TooltipTrigger>
                <TooltipContent>
                  <div className='space-y-1'>
                    <p>
                      {sensitiveVisible ? channelDisplay : channelIdDisplay}
                    </p>
                    {channelChain && (
                      <p className='text-muted-foreground text-xs'>
                        {t('Chain')}: {channelChain}
                      </p>
                    )}
                    {affinity && (
                      <div className='border-t pt-1 text-xs'>
                        <p className='font-medium'>{t('Channel Affinity')}</p>
                        <p>
                          {t('Rule')}: {affinity.rule_name || '-'}
                        </p>
                        <p>
                          {t('Group')}:{' '}
                          {sensitiveVisible
                            ? affinity.using_group ||
                              affinity.selected_group ||
                              '-'
                            : '••••'}
                        </p>
                      </div>
                    )}
                  </div>
                </TooltipContent>
              </Tooltip>
              </TooltipProvider>
            </div>
          )
        },
        meta: { label: t('Channel') },
      },
      {
        id: 'user',
        accessorFn: (row) => row.username,
        header: ({ column }) => (
          <DataTableColumnHeader column={column} title={t('User')} />
        ),
        cell: function UserCell({ row }) {
          const {
            sensitiveVisible,
            setSelectedUserId,
            setUserInfoDialogOpen,
            rewardSummaries,
          } = useUsageLogsContext()
          const log = row.original
          const reward = rewardSummaries[log.user_id]

          if (!log.username && log.user_id <= 0) return null
          const avatarSeed = log.username || String(log.user_id)

          return (
            <button
              type='button'
              className='command-log-user flex items-center gap-1.5 text-left'
              onClick={(e) => {
                e.stopPropagation()
                setSelectedUserId(log.user_id)
                setUserInfoDialogOpen(true)
              }}
            >
              <Avatar className='ring-border/60 size-6 ring-1 max-sm:hidden'>
                <AvatarFallback
                  className={cn(
                    'text-[11px] font-semibold',
                    !sensitiveVisible && 'bg-muted text-muted-foreground'
                  )}
                  style={
                    sensitiveVisible
                      ? getUserAvatarStyle(avatarSeed)
                      : undefined
                  }
                >
                  {sensitiveVisible ? getUserAvatarFallback(avatarSeed) : '•'}
                </AvatarFallback>
              </Avatar>
              <div className='flex min-w-0 flex-col gap-0.5'>
                {log.username && (
                  <TooltipProvider delay={300}>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span className='text-muted-foreground max-w-full truncate text-sm hover:underline' />
                        }
                      >
                        {sensitiveVisible ? log.username : '••••'}
                      </TooltipTrigger>
                      {sensitiveVisible && log.username.length > 12 && (
                        <TooltipContent side='top'>
                          {log.username}
                        </TooltipContent>
                      )}
                    </Tooltip>
                  </TooltipProvider>
                )}
                {log.user_id > 0 && (
                  <span className='command-log-secondary text-muted-foreground/60 font-mono text-xs'>
                    {t('ID')} {log.user_id}
                  </span>
                )}
                {isAdmin && reward && (
                  <TooltipProvider delay={200}>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <span className='usage-reward-rank max-w-full truncate' />
                        }
                      >
                        <Sparkles aria-hidden='true' />
                        {reward.current_stage.name}
                        <b>{reward.current_stage.rate_bps / 100}%</b>
                      </TooltipTrigger>
                      <TooltipContent side='top'>
                        <div className='grid gap-1 text-xs'>
                          <strong>{reward.current_stage.name}</strong>
                          <span>
                            {t('Effective paid invitees')}：
                            {reward.effective_invite_count}
                          </span>
                          <span>
                            {t('Total rebate earned')}：¥
                            {reward.total_reward_cny.toFixed(2)}
                          </span>
                          <span>
                            {t('Total recharge')}：¥
                            {reward.total_recharge_cny.toFixed(2)}
                          </span>
                          <span>
                            {t('Recharge benefit')}：
                            {reward.granted_benefit_count} {t('Granted')} /{' '}
                            {reward.pending_benefit_count} {t('Pending')}
                          </span>
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
              </div>
            </button>
          )
        },
        meta: { label: t('User') },
      }
    )
  }

  columns.push({
    accessorKey: 'token_name',
    header: ({ column }) => (
      <DataTableColumnHeader column={column} title={t('Token')} />
    ),
    cell: function TokenNameCell({ row }) {
      const { sensitiveVisible } = useUsageLogsContext()
      const log = row.original
      if (!isDisplayableLogType(log.type)) return null

      const tokenName = log.token_name
      const tokenId = log.token_id ?? 0
      if (!tokenName && !(isAdmin && tokenId > 0)) return null

      const other = parseLogOther(log.other)
      const displayName = tokenName
        ? sensitiveVisible
          ? tokenName
          : '••••'
        : `${t('Token')} #${tokenId}`
      let group = log.group
      if (!group) group = other?.group || ''
      const isAutoRoute = isAutoGroupLog(other)
      const autoRouteStatus = getAutoRouteStatus(other)
      const autoRoutePriority = other?.auto_route_priority
      const autoRouteStatusLabel =
        autoRouteStatus === 'degraded'
          ? t('Auto degraded')
          : autoRouteStatus === 'recovered'
            ? t('Auto priority restored')
            : autoRouteStatus === 'normal'
              ? t('Auto healthy')
              : null
      const AutoRouteStatusIcon =
        autoRouteStatus === 'degraded'
          ? CircleAlert
          : autoRouteStatus === 'recovered'
            ? RotateCcw
            : CircleCheck
      const autoRouteStatusVariant =
        autoRouteStatus === 'degraded'
          ? 'warning'
          : autoRouteStatus === 'recovered'
            ? 'success'
            : 'info'

      const autoRouteLabel = autoRoutePriority
        ? `${t('Auto')} · P${autoRoutePriority}`
        : t('Auto')

      const metaParts: string[] = []
      const groupRatioText = getGroupRatioText(other)
      if (isAdmin && tokenId > 0) {
        metaParts.push(`${t('ID')} ${tokenId}`)
      }
      if (group) {
        metaParts.push(sensitiveVisible ? group : '••••')
      }
      if (groupRatioText) metaParts.push(groupRatioText)

      return (
        <div className='command-log-token flex min-w-0 flex-col gap-0.5'>
          <TooltipProvider delay={300}>
            <Tooltip>
              <TooltipTrigger render={<div className='max-w-full' />}>
                <StatusBadge
                  label={displayName}
                  icon={KeyRound}
                  copyText={
                    sensitiveVisible && tokenName
                      ? tokenName
                      : isAdmin && tokenId > 0
                        ? String(tokenId)
                        : undefined
                  }
                  size='sm'
                  showDot={false}
                  className='border-border/60 bg-muted/30 text-foreground h-6 max-w-full gap-1.5 overflow-hidden rounded-md border px-2 py-0.5 [font-family:var(--font-body)]'
                />
              </TooltipTrigger>
              {sensitiveVisible && tokenName && tokenName.length > 16 && (
                <TooltipContent side='top' className='max-w-xs break-all'>
                  {tokenName}
                </TooltipContent>
              )}
            </Tooltip>
          </TooltipProvider>
          {(metaParts.length > 0 || isAutoRoute) && (
            <div className='command-log-secondary flex min-w-0 flex-wrap items-center gap-1 [font-family:var(--font-body)] !text-xs'>
              {metaParts.length > 0 && (
                <span className='text-muted-foreground/60 truncate'>
                  {metaParts.join(' · ')}
                </span>
              )}
              {isAutoRoute && (
                <StatusBadge
                  label={autoRouteLabel}
                  icon={AutoRouteStatusIcon}
                  variant={autoRouteStatusVariant}
                  size='sm'
                  copyable={false}
                  showDot={false}
                  className='h-4 rounded px-1 text-[10px] leading-none'
                  title={
                    autoRouteStatusLabel
                      ? `${autoRouteStatusLabel}${autoRoutePriority ? ` · P${autoRoutePriority}` : ''}`
                      : autoRouteLabel
                  }
                />
              )}
            </div>
          )}
        </div>
      )
    },
    meta: { label: t('Token') },
    size: 160,
  })

  columns.push(
    {
      accessorKey: 'model_name',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Model')} />
      ),
      cell: function ModelCell({ row }) {
        const log = row.original
        if (!isDisplayableLogType(log.type)) return null

        const modelInfo = formatModelName(log)

        return (
          <div className='flex w-fit flex-col gap-0.5'>
            <ModelBadge
              modelName={modelInfo.name}
              actualModel={modelInfo.actualModel}
            />
          </div>
        )
      },
      meta: { label: t('Model'), mobileTitle: true },
    },

    {
      accessorKey: 'use_time',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Timing')} />
      ),
      cell: ({ row }) => {
        const log = row.original
        if (!isTimingLogType(log.type)) return null

        const useTime = row.getValue('use_time') as number
        const other = parseLogOther(log.other)
        const firstResponse = getLogFirstResponseLatency(log, other)
        const throughputAssessment = getLogThroughputAssessment(log, other)
        const throughput = throughputAssessment.throughput
        const timeVariant = getResponseTimeColor(
          useTime,
          log.completion_tokens,
          throughput?.tokensPerSecond
        )
        const firstResponseVariant = firstResponse
          ? getFirstResponseTimeColor(firstResponse.milliseconds / 1000)
          : 'neutral'

        const timingBgMap: Record<string, string> = {
          success:
            'border border-emerald-200/40 bg-emerald-50/35 dark:border-emerald-900/40 dark:bg-emerald-950/15',
          warning:
            'border border-amber-200/45 bg-amber-50/35 dark:border-amber-900/40 dark:bg-amber-950/15',
          danger:
            'border border-rose-200/50 bg-rose-50/35 dark:border-rose-900/40 dark:bg-rose-950/15',
          neutral:
            'border border-border/60 bg-muted/30 dark:border-border/40 dark:bg-muted/20',
        }

        return (
          <div className='command-log-timing flex flex-col gap-1'>
            <div className='grid grid-cols-2 gap-1.5'>
              <div className='flex min-w-0 flex-col gap-0.5'>
                <span className='text-muted-foreground/70 text-[10px] leading-none'>
                  {t('Total')}
                </span>
                <StatusBadge
                  label={formatUseTime(useTime)}
                  variant={timeVariant as StatusBadgeProps['variant']}
                  size='sm'
                  copyable={false}
                  className={cn(
                    'w-fit rounded-md font-mono',
                    timingBgMap[timeVariant]
                  )}
                />
              </div>
              <div className='flex min-w-0 flex-col gap-0.5'>
                <span className='text-muted-foreground/70 text-[10px] leading-none'>
                  {t('First Token')}
                </span>
                <TooltipProvider delay={300}>
                  <Tooltip>
                    <TooltipTrigger
                      render={<span className='inline-flex w-fit' />}
                    >
                      {firstResponse ? (
                        <StatusBadge
                          label={formatUseTime(
                            firstResponse.milliseconds / 1000
                          )}
                          variant={
                            firstResponseVariant as StatusBadgeProps['variant']
                          }
                          size='sm'
                          showDot={false}
                          copyable={false}
                          className={cn(
                            'w-fit rounded-md font-mono',
                            timingBgMap[firstResponseVariant]
                          )}
                        />
                      ) : (
                        <StatusBadge
                          label='N/A'
                          variant='neutral'
                          size='sm'
                          showDot={false}
                          copyable={false}
                          className={cn(
                            'w-fit rounded-md font-mono',
                            timingBgMap.neutral
                          )}
                        />
                      )}
                    </TooltipTrigger>
                    <TooltipContent side='top' className='max-w-xs'>
                      {getFirstResponseTooltip(
                        firstResponse?.source ?? null,
                        t
                      )}
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
            <div className='usage-log-throughput flex w-full items-center justify-center gap-1 [font-family:var(--font-body)] text-[11px] leading-none'>
              <span className='text-muted-foreground/60 inline-flex w-full items-center justify-center [font-family:var(--font-body)] text-[11px] leading-none whitespace-nowrap'>
                {throughput != null && (
                  <TooltipProvider delay={300}>
                    <Tooltip>
                      <TooltipTrigger
                        render={<span className='inline-flex cursor-help' />}
                      >
                        {log.is_stream ? t('Stream') : t('Non-stream')}
                        {' · '}
                        <span className='tabular-nums'>
                          {formatTokensPerSecond(throughput.tokensPerSecond)}
                        </span>
                        {' t/s'}
                      </TooltipTrigger>
                      <TooltipContent side='top' className='max-w-xs'>
                        {getThroughputTooltip(t)}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
                {throughput == null &&
                  throughputAssessment.unavailableReason != null && (
                    <TooltipProvider delay={300}>
                      <Tooltip>
                        <TooltipTrigger
                          render={<span className='inline-flex cursor-help' />}
                        >
                          {log.is_stream ? t('Stream') : t('Non-stream')}
                          {' · N/A'}
                        </TooltipTrigger>
                        <TooltipContent side='top' className='max-w-xs'>
                          {getUnavailableThroughputTooltip(
                            throughputAssessment.unavailableReason,
                            t
                          )}
                        </TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  )}
                {throughput == null &&
                  throughputAssessment.unavailableReason == null &&
                  (log.is_stream ? t('Stream') : t('Non-stream'))}
              </span>
              {log.is_stream &&
                other?.stream_status &&
                other.stream_status.status !== 'ok' && (
                  <TooltipProvider>
                    <Tooltip>
                      <TooltipTrigger
                        render={<CircleAlert className='size-3 text-red-500' />}
                      ></TooltipTrigger>
                      <TooltipContent>
                        <div className='space-y-0.5 text-xs'>
                          <p>
                            {t('Stream Status')}: {t('Error')}
                          </p>
                          <p>{other.stream_status.end_reason || 'unknown'}</p>
                          {(other.stream_status.error_count ?? 0) > 0 && (
                            <p>
                              {t('Soft Errors')}:{' '}
                              {other.stream_status.error_count}
                            </p>
                          )}
                        </div>
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                )}
            </div>
          </div>
        )
      },
      meta: { label: t('Timing') },
    },

    {
      accessorKey: 'prompt_tokens',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title='Tokens' />
      ),
      cell: ({ row }) => {
        const log = row.original
        if (!isDisplayableLogType(log.type)) return null

        const other = parseLogOther(log.other)

        const promptTokens = log.prompt_tokens || 0
        const completionTokens = log.completion_tokens || 0
        if (promptTokens === 0 && completionTokens === 0) {
          return <span className='text-muted-foreground text-xs'>-</span>
        }

        const cacheReadTokens = other?.cache_tokens || 0
        const cacheWrite5m = other?.cache_creation_tokens_5m || 0
        const cacheWrite1h = other?.cache_creation_tokens_1h || 0
        const hasSplitCache = cacheWrite5m > 0 || cacheWrite1h > 0
        const cacheWriteTokens = hasSplitCache
          ? cacheWrite5m + cacheWrite1h
          : other?.cache_creation_tokens || 0

        return (
          <div className='flex flex-col gap-0.5'>
            <span className='font-mono text-xs font-medium tabular-nums'>
              {promptTokens.toLocaleString()} /{' '}
              {completionTokens.toLocaleString()}
            </span>
            {(cacheReadTokens > 0 || cacheWriteTokens > 0) && (
              <div className='command-log-cache flex items-center gap-1 text-[11px]'>
                {cacheReadTokens > 0 && (
                  <span className='text-muted-foreground/60'>
                    {t('Cache')}↓ {cacheReadTokens.toLocaleString()}
                  </span>
                )}
                {cacheWriteTokens > 0 && (
                  <span className='text-muted-foreground/60'>
                    ↑ {cacheWriteTokens.toLocaleString()}
                  </span>
                )}
              </div>
            )}
          </div>
        )
      },
      meta: { label: 'Tokens' },
    },

    {
      accessorKey: 'quota',
      header: ({ column }) => (
        <DataTableColumnHeader column={column} title={t('Cost')} />
      ),
      cell: ({ row }) => {
        const log = row.original
        if (!isDisplayableLogType(log.type)) return null

        const quota = row.getValue('quota') as number
        const other = parseLogOther(log.other)
        const isSubscription = other?.billing_source === 'subscription'

        if (isSubscription) {
          const subscriptionDisplay = getSubscriptionBillingDisplay(
            quota,
            other
          )
          const discount = subscriptionDisplay.discount
          const rate = formatSubscriptionDiscountPercent(discount)
          const off = formatSubscriptionDiscountOffPercent(discount)
          const consumed = subscriptionDisplay.actualConsumed
          return (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger
                  render={
                    <div className='flex cursor-help flex-col items-start gap-1'>
                      <StatusBadge
                        label={t('Subscription')}
                        variant='success'
                        size='sm'
                        copyable={false}
                      />
                      <span
                        className={cn(
                          'inline-flex rounded-md border px-2 py-0.5 text-[11px] leading-none font-semibold',
                          discount < 1
                            ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                            : 'border-border bg-muted/50 text-muted-foreground'
                        )}
                      >
                        {rate} · {formatLogQuota(consumed)}
                      </span>
                    </div>
                  }
                />
                <TooltipContent>
                  <div className='space-y-1 text-xs'>
                    <div>
                      {t('Deducted by subscription')}:{' '}
                      {formatLogQuota(consumed)}
                    </div>
                    <div>{t('{{rate}} rate ({{off}} off)', { rate, off })}</div>
                  </div>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )
        }

        const quotaStr = formatLogQuota(quota)
        const quotaDisplay = splitQuotaDisplay(quotaStr)

        return (
          <div className='flex flex-col gap-0.5'>
            <span className='border-border/80 bg-muted/60 inline-flex h-6 w-fit items-center rounded-md border px-2 [font-family:var(--font-body)] text-sm leading-none font-semibold tabular-nums'>
              {quotaDisplay.prefix && (
                <span className='mr-1'>{quotaDisplay.prefix}</span>
              )}
              <span>{quotaDisplay.amount}</span>
            </span>
          </div>
        )
      },
      meta: { label: t('Cost') },
    },

    {
      accessorKey: 'content',
      header: t('Details'),
      cell: function DetailsCell({ row }) {
        const [dialogOpen, setDialogOpen] = useState(false)
        const log = row.original
        const other = parseLogOther(log.other)

        const segments = buildDetailSegments(log, other, t)

        return (
          <>
            <button
              type='button'
              className='border-border/70 bg-muted/40 hover:bg-muted inline-flex h-7 items-center justify-center gap-1 rounded-md border px-2 text-xs font-medium'
              onClick={() => setDialogOpen(true)}
              title={segments[0]?.text || t('Click to view full details')}
            >
              <Eye className='size-3.5' aria-hidden='true' />
              <span>{t('View')}</span>
            </button>
            <DetailsDialog
              log={log}
              isAdmin={isAdmin}
              open={dialogOpen}
              onOpenChange={setDialogOpen}
            />
          </>
        )
      },
      meta: { label: t('Details') },
      size: 180,
      maxSize: 200,
    }
  )

  return columns
}
