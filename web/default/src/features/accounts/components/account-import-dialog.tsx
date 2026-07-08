/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful, but WITHOUT
ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or FITNESS
FOR A PARTICULAR PURPOSE. See the GNU Affero General Public License for more
details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.

For commercial licensing, please contact support@quantumnous.com
*/
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link as RouterLink } from '@tanstack/react-router'
import {
  Activity,
  AlertTriangle,
  Boxes,
  CheckCircle2,
  ClipboardList,
  Database,
  ExternalLink,
  FileText,
  FileUp,
  Gauge,
  KeyRound,
  Layers3,
  ListChecks,
  Loader2,
  RefreshCw,
  Server,
  Tag,
  UploadCloud,
  ChevronDown,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { formatTimestampToDate } from '@/lib/format'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { StatusBadge, type StatusVariant } from '@/components/status-badge'
import {
  batchSetChannelGroup,
  createChannel,
  getCodexUsage,
  getGroups,
  getImportedAccountChannels,
  testChannel,
  updateImportedAccountMonitor,
  updateChannelBalance,
} from '@/features/channels/api'
import { channelsQueryKeys } from '@/features/channels/lib'
import type { Channel } from '@/features/channels/types'
import {
  buildImportRequestsFromText,
  type AccountImportBuildResult,
  type AccountImportError,
} from '../lib/account-channel-map'

type AccountImportDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  onImported?: () => void
}

type AccountImportPanelProps = {
  onImported?: () => void
  onClose?: () => void
}

type ImportRunResult = {
  created: number
  failed: number
  errors: AccountImportError[]
}

type CheckStatus = 'pending' | 'running' | 'success' | 'error' | 'skipped'

type ImportedChannelCheck = {
  key: string
  index: number
  name: string
  platform: string
  channelId?: number
  type?: number
  models?: string
  group?: string
  status?: number
  balance?: number
  balanceCurrency?: string
  balanceUpdatedTime?: number
  usedQuota?: number
  remark?: string
  createdTime?: number
  settings?: string
  monitorEnabled?: boolean
  lastCheckedAt?: number
  quotaStatus: CheckStatus
  quotaMessage?: string
  channelStatus: CheckStatus
  channelMessage?: string
  responseTime?: number
}

const CODEX_CHANNEL_TYPE = 57
const CHECK_DELAY_MS = 300
const MONITOR_INTERVAL_MS = 5 * 60 * 1000
const IMPORTED_CHANNEL_PAGE_SIZE = 100
const CHECK_STATUS_LABELS: Record<CheckStatus, string> = {
  pending: 'Pending',
  running: 'Running',
  success: 'Success',
  error: 'Error',
  skipped: 'Skipped',
}

async function readFileAsText(file: File): Promise<string> {
  if (typeof file.text === 'function') return file.text()
  const buffer = await file.arrayBuffer()
  return new TextDecoder().decode(buffer)
}

function sleep(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms))
}

function firstImportModel(models: unknown): string | undefined {
  const value = typeof models === 'string' ? models : ''
  return value
    .split(',')
    .map((item) => item.trim())
    .find(Boolean)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function parseRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value
  if (typeof value !== 'string' || !value.trim()) return {}
  try {
    const parsed = JSON.parse(value) as unknown
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function isCheckStatus(value: unknown): value is CheckStatus {
  return (
    value === 'pending' ||
    value === 'running' ||
    value === 'success' ||
    value === 'error' ||
    value === 'skipped'
  )
}

function getPlatformLabel(type?: number, settings?: Record<string, unknown>) {
  const platform = String(settings?.imported_account_platform || '').trim()
  if (platform) {
    const labels: Record<string, string> = {
      openai: 'OpenAI',
      anthropic: 'Anthropic',
      gemini: 'Gemini',
      codex: 'Codex',
      openrouter: 'OpenRouter',
      custom: 'Custom',
    }
    return labels[platform] || platform
  }
  if (type === 57) return 'Codex'
  if (type === 1) return 'OpenAI'
  if (type === 14) return 'Anthropic'
  if (type === 24) return 'Gemini'
  if (type === 20) return 'OpenRouter'
  return type ? String(type) : 'Custom'
}

function formatPercent(value: unknown) {
  const percent = Number(value)
  if (!Number.isFinite(percent)) return ''
  return `${Math.max(0, Math.min(100, percent)).toFixed(0)}%`
}

function formatCodexUsageSummary(data: Record<string, unknown> | undefined) {
  if (!data) return ''
  const rateLimit = isRecord(data.rate_limit) ? data.rate_limit : {}
  const primary = isRecord(rateLimit.primary_window)
    ? rateLimit.primary_window
    : {}
  const secondary = isRecord(rateLimit.secondary_window)
    ? rateLimit.secondary_window
    : {}
  const planType = String(data.plan_type || rateLimit.plan_type || '').trim()
  const primaryPercent = formatPercent(primary.used_percent)
  const secondaryPercent = formatPercent(secondary.used_percent)
  const parts = [
    planType,
    primaryPercent ? `5h ${primaryPercent}` : '',
    secondaryPercent ? `7d ${secondaryPercent}` : '',
  ].filter(Boolean)
  return parts.join(' · ')
}

function formatQuotaNumber(value: unknown) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '0'
  return number.toLocaleString(undefined, {
    maximumFractionDigits: 4,
  })
}

function formatBalanceDisplay(value: unknown, currency?: string) {
  const number = Number(value)
  if (!Number.isFinite(number)) return '-'
  return `${number.toFixed(4)} ${currency || 'USD'}`
}

function createMonitorSnapshot(
  item: ImportedChannelCheck,
  patch: Partial<ImportedChannelCheck>
): Record<string, unknown> {
  return {
    monitor_enabled: patch.monitorEnabled ?? item.monitorEnabled ?? false,
    monitor_interval_ms: MONITOR_INTERVAL_MS,
    checked_at: patch.lastCheckedAt ?? item.lastCheckedAt,
    quota_status: patch.quotaStatus ?? item.quotaStatus,
    quota_message: patch.quotaMessage ?? item.quotaMessage,
    channel_status: patch.channelStatus ?? item.channelStatus,
    channel_message: patch.channelMessage ?? item.channelMessage,
    response_time: patch.responseTime ?? item.responseTime,
    balance: patch.balance ?? item.balance,
    balance_currency: patch.balanceCurrency ?? item.balanceCurrency,
    balance_updated_time: patch.balanceUpdatedTime ?? item.balanceUpdatedTime,
  }
}

function channelToImportedItem(
  channel: Channel,
  index: number,
  t: (key: string, options?: Record<string, unknown>) => string
): ImportedChannelCheck {
  const settings = parseRecord(channel.settings)
  const monitor = parseRecord(settings.imported_account_monitor)
  const monitorEnabled = monitor.monitor_enabled === true
  const quotaStatus = isCheckStatus(monitor.quota_status)
    ? monitor.quota_status
    : channel.balance_updated_time > 0
      ? 'success'
      : 'pending'
  const channelStatus = isCheckStatus(monitor.channel_status)
    ? monitor.channel_status
    : channel.test_time > 0
      ? 'success'
      : 'pending'
  const responseTime = Number(
    monitor.response_time ??
      (channel.response_time > 0 ? channel.response_time / 1000 : undefined)
  )
  const balanceUpdatedTime = Number(
    monitor.balance_updated_time ?? channel.balance_updated_time
  )
  const lastCheckedAt = Number(monitor.checked_at)

  return {
    key: getImportedChannelKey(index, channel.id),
    index,
    name: channel.name,
    platform: getPlatformLabel(channel.type, settings),
    channelId: channel.id,
    type: channel.type,
    models: channel.models || '',
    group: channel.group || '',
    status: channel.status,
    balance: Number(monitor.balance ?? channel.balance ?? 0),
    balanceCurrency: String(monitor.balance_currency || 'USD'),
    balanceUpdatedTime: Number.isFinite(balanceUpdatedTime)
      ? balanceUpdatedTime
      : undefined,
    usedQuota: Number(channel.used_quota ?? 0),
    remark: channel.remark || '',
    createdTime: channel.created_time,
    settings: channel.settings,
    monitorEnabled,
    lastCheckedAt: Number.isFinite(lastCheckedAt) ? lastCheckedAt : undefined,
    quotaStatus,
    quotaMessage:
      typeof monitor.quota_message === 'string' && monitor.quota_message
        ? monitor.quota_message
        : channel.type !== CODEX_CHANNEL_TYPE &&
            channel.balance_updated_time > 0
          ? t('Balance: {{balance}} {{currency}}', {
              balance: Number(channel.balance || 0).toFixed(4),
              currency: 'USD',
            })
          : undefined,
    channelStatus,
    channelMessage:
      typeof monitor.channel_message === 'string' && monitor.channel_message
        ? monitor.channel_message
        : channel.test_time > 0 && Number.isFinite(responseTime)
          ? t('Response time: {{time}}s', { time: responseTime.toFixed(2) })
          : undefined,
    responseTime: Number.isFinite(responseTime) ? responseTime : undefined,
  }
}

function getCheckVariant(status: CheckStatus): StatusVariant {
  if (status === 'success') return 'success'
  if (status === 'error') return 'danger'
  if (status === 'running') return 'info'
  if (status === 'skipped') return 'warning'
  return 'neutral'
}

function getChannelStatusMeta(status?: number): {
  label: string
  variant: StatusVariant
} {
  if (status === 1) return { label: 'Enabled', variant: 'success' }
  if (status === 2) return { label: 'Auto disabled', variant: 'warning' }
  if (status === 0) return { label: 'Disabled', variant: 'danger' }
  return { label: 'Unknown', variant: 'neutral' }
}

function getCreatedCount(result: ImportRunResult | null) {
  return result?.created ?? 0
}

function getImportedChannelKey(index: number, channelId?: number) {
  return channelId ? `channel-${channelId}` : `import-${index}`
}

export function AccountImportPanel(props: AccountImportPanelProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const [fileName, setFileName] = useState('')
  const [content, setContent] = useState('')
  const [buildResult, setBuildResult] =
    useState<AccountImportBuildResult | null>(null)
  const [runResult, setRunResult] = useState<ImportRunResult | null>(null)
  const [checkItems, setCheckItems] = useState<ImportedChannelCheck[]>([])
  const [parsing, setParsing] = useState(false)
  const [importing, setImporting] = useState(false)
  const [checking, setChecking] = useState(false)
  const [loadingImported, setLoadingImported] = useState(false)
  const [autoMonitor, setAutoMonitor] = useState(false)
  const [applyingGroup, setApplyingGroup] = useState(false)
  const [selectedImportedKeys, setSelectedImportedKeys] = useState<Set<string>>(
    () => new Set()
  )
  const [mobileTab, setMobileTab] = useState<'import' | 'channels'>('import')

  const { data: groupsData } = useQuery({
    queryKey: ['groups'],
    queryFn: getGroups,
  })
  const groupOptions = useMemo(
    () => (Array.isArray(groupsData?.data) ? groupsData.data : []),
    [groupsData]
  )

  const reset = () => {
    setFileName('')
    setContent('')
    setBuildResult(null)
    setRunResult(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  const updateCheckItem = useCallback(
    (key: string, patch: Partial<ImportedChannelCheck>) => {
      setCheckItems((previous) =>
        previous.map((item) =>
          item.key === key ? { ...item, ...patch } : item
        )
      )
    },
    []
  )

  const loadImportedChannels = useCallback(
    async (options: { silent?: boolean } = {}) => {
      if (!options.silent) setLoadingImported(true)
      try {
        const importedChannels: Channel[] = []
        let page = 1
        let total = 0
        do {
          const response = await getImportedAccountChannels({
            p: page,
            page_size: IMPORTED_CHANNEL_PAGE_SIZE,
            sort_by: 'id',
            sort_order: 'desc',
          })
          if (!response.success) {
            throw new Error(
              response.message || t('Failed to load imported channels')
            )
          }
          const data = response.data
          const items = data?.items || []
          importedChannels.push(...items)
          total = data?.total ?? importedChannels.length
          page += 1
          if (items.length === 0) break
        } while (importedChannels.length < total)

        const importedItems = importedChannels.map((channel, index) =>
          channelToImportedItem(channel, index, t)
        )
        setCheckItems(importedItems)
        setAutoMonitor(importedItems.some((item) => item.monitorEnabled))
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t('Failed to load imported channels')
        )
      } finally {
        if (!options.silent) setLoadingImported(false)
      }
    },
    [t]
  )

  useEffect(() => {
    void loadImportedChannels()
  }, [loadImportedChannels])

  useEffect(() => {
    setSelectedImportedKeys((previous) => {
      if (previous.size === 0) return previous

      const selectableKeys = new Set(
        checkItems.filter((item) => item.channelId).map((item) => item.key)
      )
      let changed = false
      const next = new Set<string>()

      previous.forEach((key) => {
        if (selectableKeys.has(key)) {
          next.add(key)
        } else {
          changed = true
        }
      })

      return changed ? next : previous
    })
  }, [checkItems])

  const handleToggleImportedSelected = useCallback(
    (key: string, selected: boolean) => {
      setSelectedImportedKeys((previous) => {
        const next = new Set(previous)
        if (selected) {
          next.add(key)
        } else {
          next.delete(key)
        }
        return next
      })
    },
    []
  )

  const handleToggleAllImported = useCallback(
    (selected: boolean) => {
      if (!selected) {
        setSelectedImportedKeys(new Set())
        return
      }

      setSelectedImportedKeys(
        new Set(
          checkItems.filter((item) => item.channelId).map((item) => item.key)
        )
      )
    },
    [checkItems]
  )

  const persistMonitorSnapshot = useCallback(
    async (
      item: ImportedChannelCheck,
      patch: Partial<ImportedChannelCheck>
    ) => {
      if (!item.channelId) return
      const response = await updateImportedAccountMonitor(
        item.channelId,
        createMonitorSnapshot(item, patch)
      )
      if (!response.success) {
        throw new Error(response.message || t('Failed to save monitor state'))
      }
    },
    [t]
  )

  const showParseToast = (result: AccountImportBuildResult) => {
    if (result.requests.length === 0) {
      toast.error(t('No importable accounts found'))
      return
    }
    if (result.errors.length > 0) {
      toast.warning(
        t(
          '{{count}} account(s) can be imported, {{failed}} item(s) need review',
          {
            count: result.requests.length,
            failed: result.errors.length,
          }
        )
      )
      return
    }
    toast.success(
      t('Parsed {{count}} account(s)', {
        count: result.requests.length,
      })
    )
  }

  const parseContent = (
    nextContent: string
  ): AccountImportBuildResult | null => {
    const trimmed = nextContent.trim()
    if (!trimmed) {
      toast.error(t('Paste or choose credentials first'))
      return null
    }

    setParsing(true)
    setRunResult(null)
    try {
      const nextBuildResult = buildImportRequestsFromText(trimmed)
      setBuildResult(nextBuildResult)
      showParseToast(nextBuildResult)
      return nextBuildResult
    } catch (error) {
      setBuildResult(null)
      let message = t('Failed to parse import content')
      if (error instanceof SyntaxError) {
        message = t('Invalid JSON content')
      } else if (error instanceof Error) {
        message = error.message
      }
      toast.error(message)
      return null
    } finally {
      setParsing(false)
    }
  }

  const handleContentChange = (
    event: React.ChangeEvent<HTMLTextAreaElement>
  ) => {
    setContent(event.target.value)
    setBuildResult(null)
    setRunResult(null)
  }

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = event.target.files?.[0]
    if (!file) return

    setParsing(true)
    setRunResult(null)
    setFileName(file.name)
    try {
      const text = await readFileAsText(file)
      setContent(text)
      const nextBuildResult = buildImportRequestsFromText(text)
      setBuildResult(nextBuildResult)
      showParseToast(nextBuildResult)
    } catch (error) {
      setBuildResult(null)
      let message = t('Failed to parse import file')
      if (error instanceof SyntaxError) {
        message = t('Invalid JSON file')
      } else if (error instanceof Error) {
        message = error.message
      }
      toast.error(message)
    } finally {
      setParsing(false)
    }
  }

  const runPostImportChecks = useCallback(
    async (items = checkItems) => {
      if (checking || items.length === 0) return

      setChecking(true)
      try {
        for (const item of items) {
          const finalPatch: Partial<ImportedChannelCheck> = {}
          if (!item.channelId) {
            Object.assign(finalPatch, {
              quotaStatus: 'skipped',
              quotaMessage: t('Channel id missing'),
              channelStatus: 'skipped',
              channelMessage: t('Channel id missing'),
              lastCheckedAt: Math.floor(Date.now() / 1000),
            })
            updateCheckItem(item.key, finalPatch)
            continue
          }

          updateCheckItem(item.key, {
            quotaStatus: 'running',
            quotaMessage: t('Checking...'),
          })
          try {
            if (item.type === CODEX_CHANNEL_TYPE) {
              const response = await getCodexUsage(item.channelId)
              if (!response.success) {
                throw new Error(response.message || t('Failed to fetch usage'))
              }
              Object.assign(finalPatch, {
                quotaStatus: 'success',
                quotaMessage:
                  formatCodexUsageSummary(response.data) || t('Usage fetched'),
              })
              updateCheckItem(item.key, finalPatch)
            } else {
              const response = await updateChannelBalance(item.channelId)
              if (!response.success || response.balance === undefined) {
                throw new Error(
                  response.message || t('Failed to query balance')
                )
              }
              Object.assign(finalPatch, {
                quotaStatus: 'success',
                quotaMessage: t('Balance: {{balance}} {{currency}}', {
                  balance: response.balance.toFixed(4),
                  currency: response.currency || 'USD',
                }),
                balance: response.balance,
                balanceCurrency: response.currency || 'USD',
                balanceUpdatedTime: Math.floor(Date.now() / 1000),
              })
              updateCheckItem(item.key, finalPatch)
            }
          } catch (error) {
            Object.assign(finalPatch, {
              quotaStatus: 'error',
              quotaMessage:
                error instanceof Error ? error.message : t('Check failed'),
            })
            updateCheckItem(item.key, finalPatch)
          }

          await sleep(CHECK_DELAY_MS)

          const testModel = firstImportModel(item.models)
          if (!testModel) {
            Object.assign(finalPatch, {
              channelStatus: 'skipped',
              channelMessage: t('Configure models in Channels first'),
              lastCheckedAt: Math.floor(Date.now() / 1000),
            })
            updateCheckItem(item.key, finalPatch)
            try {
              await persistMonitorSnapshot(item, finalPatch)
            } catch (error) {
              toast.error(
                error instanceof Error
                  ? error.message
                  : t('Failed to save monitor state')
              )
            }
            await sleep(CHECK_DELAY_MS)
            continue
          }

          updateCheckItem(item.key, {
            channelStatus: 'running',
            channelMessage: t('Checking connection'),
          })
          try {
            const response = await testChannel(item.channelId, {
              model: testModel,
              endpoint_type:
                item.type === CODEX_CHANNEL_TYPE
                  ? 'openai-response'
                  : undefined,
            })
            if (!response.success) {
              throw new Error(response.message || t('Failed to test channel'))
            }
            const responseTime = Number(
              (response as typeof response & { time?: number }).time ??
                response.data?.response_time
            )
            Object.assign(finalPatch, {
              channelStatus: 'success',
              responseTime,
              channelMessage: Number.isFinite(responseTime)
                ? t('Response time: {{time}}s', {
                    time: responseTime.toFixed(2),
                  })
                : t('Channel test completed'),
            })
          } catch (error) {
            Object.assign(finalPatch, {
              channelStatus: 'error',
              channelMessage:
                error instanceof Error ? error.message : t('Check failed'),
            })
          }

          Object.assign(finalPatch, {
            lastCheckedAt: Math.floor(Date.now() / 1000),
          })
          updateCheckItem(item.key, finalPatch)
          try {
            await persistMonitorSnapshot(item, finalPatch)
          } catch (error) {
            toast.error(
              error instanceof Error
                ? error.message
                : t('Failed to save monitor state')
            )
          }

          await sleep(CHECK_DELAY_MS)
        }
      } finally {
        setChecking(false)
      }
    },
    [checkItems, checking, persistMonitorSnapshot, t, updateCheckItem]
  )

  useEffect(() => {
    if (!autoMonitor || checkItems.length === 0) return
    const timer = window.setInterval(() => {
      void runPostImportChecks()
    }, MONITOR_INTERVAL_MS)
    return () => window.clearInterval(timer)
  }, [autoMonitor, checkItems.length, runPostImportChecks])

  const handleApplyGroup = useCallback(
    async (group: string) => {
      const targets = checkItems.filter(
        (item) => item.channelId && selectedImportedKeys.has(item.key)
      )
      if (targets.length === 0) {
        toast.error(t('Select imported channels first'))
        return
      }
      setApplyingGroup(true)
      try {
        const response = await batchSetChannelGroup({
          ids: Array.from(new Set(targets.map((item) => item.channelId!))),
          group,
        })
        if (!response.success) {
          throw new Error(response.message || t('Failed to set group'))
        }
        targets.forEach((item) => updateCheckItem(item.key, { group }))
        toast.success(
          t('Group applied to {{count}} channel(s)', {
            count: response.data ?? targets.length,
          })
        )
        await queryClient.invalidateQueries({ queryKey: channelsQueryKeys.all })
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : t('Failed to set group')
        )
      } finally {
        setApplyingGroup(false)
      }
    },
    [checkItems, queryClient, selectedImportedKeys, t, updateCheckItem]
  )

  const handleToggleAutoMonitor = useCallback(async () => {
    const nextAutoMonitor = !autoMonitor
    const nextItems = checkItems.map((item) => ({
      ...item,
      monitorEnabled: nextAutoMonitor,
    }))

    setAutoMonitor(nextAutoMonitor)
    setCheckItems(nextItems)

    for (const item of nextItems) {
      try {
        await persistMonitorSnapshot(item, {
          monitorEnabled: nextAutoMonitor,
        })
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t('Failed to save monitor state')
        )
      }
      await sleep(CHECK_DELAY_MS)
    }

    if (nextAutoMonitor && nextItems.length > 0) {
      void runPostImportChecks(nextItems)
    }
  }, [autoMonitor, checkItems, persistMonitorSnapshot, runPostImportChecks, t])

  const handleImport = async () => {
    const currentBuildResult = buildResult ?? parseContent(content)
    if (!currentBuildResult || currentBuildResult.requests.length === 0) {
      toast.error(t('No importable accounts found'))
      return
    }

    setImporting(true)
    const errors: AccountImportError[] = [...currentBuildResult.errors]
    const importedChannels: ImportedChannelCheck[] = []
    let created = 0

    for (const [index, request] of currentBuildResult.requests.entries()) {
      const name = String(request.channel.name || `Account ${index + 1}`)
      const preview = currentBuildResult.previews.find(
        (item) => item.index === index
      )
      try {
        const response = await createChannel(request)
        if (response.success) {
          created += 1
          const channelInfo = response.data?.channels?.[0]
          const channelId = channelInfo?.id ?? response.data?.ids?.[0]
          const statusValue = Number(
            channelInfo?.status ?? request.channel.status
          )
          importedChannels.push({
            key: getImportedChannelKey(index, channelId),
            index,
            name: channelInfo?.name || name,
            platform: preview?.platform || String(request.channel.type || ''),
            channelId,
            type: Number(channelInfo?.type ?? request.channel.type),
            models: channelInfo?.models || String(request.channel.models || ''),
            group: channelInfo?.group || String(request.channel.group || ''),
            status: Number.isFinite(statusValue) ? statusValue : undefined,
            balance: Number(channelInfo?.balance ?? 0),
            balanceUpdatedTime: Number(channelInfo?.balance_updated_time ?? 0),
            usedQuota: Number(channelInfo?.used_quota ?? 0),
            remark: channelInfo?.remark || String(request.channel.remark || ''),
            createdTime: Number(channelInfo?.created_time ?? 0),
            monitorEnabled: autoMonitor,
            quotaStatus: 'pending',
            channelStatus: 'pending',
          })
        } else {
          errors.push({
            index,
            name,
            message: response.message || t('Create failed'),
          })
        }
      } catch (error) {
        errors.push({
          index,
          name,
          message: error instanceof Error ? error.message : t('Create failed'),
        })
      }
    }

    const failed = errors.length
    setRunResult({ created, failed, errors })
    setCheckItems((previous) => {
      const importedIds = new Set(
        importedChannels.map((item) => item.channelId).filter(Boolean)
      )
      return [
        ...importedChannels,
        ...previous.filter(
          (item) => !item.channelId || !importedIds.has(item.channelId)
        ),
      ]
    })
    await queryClient.invalidateQueries({ queryKey: channelsQueryKeys.all })
    setImporting(false)

    if (created > 0) {
      setSelectedImportedKeys(
        new Set(
          importedChannels
            .filter((item) => item.channelId)
            .map((item) => item.key)
        )
      )
      props.onImported?.()
      void runPostImportChecks(importedChannels)
    }
    if (failed > 0) {
      toast.warning(
        t('Import finished: {{created}} created, {{failed}} failed', {
          created,
          failed,
        })
      )
      return
    }

    toast.success(t('Imported {{count}} account(s)', { count: created }))
  }

  const readyCount = buildResult?.requests.length ?? 0
  const reviewCount = buildResult?.errors.length ?? 0

  return (
    <section className='space-y-4'>
      <div className='bg-background overflow-hidden rounded-lg border shadow-sm'>
        <div className='flex flex-col gap-4 px-4 py-4 sm:px-5 lg:flex-row lg:items-center lg:justify-between'>
          <div className='flex min-w-0 items-center gap-3'>
            <span className='bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-xl'>
              <KeyRound className='size-5' />
            </span>
            <div className='min-w-0'>
              <h3 className='truncate text-base font-semibold'>
                {t('Import Accounts')}
              </h3>
              <p className='text-muted-foreground text-sm'>
                {t('Import credential JSON or access tokens into channels')}
              </p>
            </div>
          </div>
          <div className='grid grid-cols-2 gap-2 sm:grid-cols-4'>
            <ImportMetric label={t('Ready')} value={readyCount} color='blue' />
            <ImportMetric
              label={t('Imported')}
              value={checkItems.length || getCreatedCount(runResult)}
              color='green'
            />
            <ImportMetric
              label={t('Needs review')}
              value={reviewCount}
              color={reviewCount > 0 ? 'amber' : 'default'}
            />
            <ImportMetric
              label={t('Checks')}
              value={
                checkItems.filter(
                  (item) =>
                    item.quotaStatus !== 'pending' ||
                    item.channelStatus !== 'pending'
                ).length
              }
              color='default'
            />
          </div>
        </div>
      </div>

      {/* Mobile tab switcher — hidden on xl+ */}
      <div className='xl:hidden'>
        <div className='bg-muted flex rounded-lg p-1'>
          <button
            type='button'
            onClick={() => setMobileTab('import')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
              mobileTab === 'import'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <ClipboardList className='size-3.5' />
            {t('Credentials')}
          </button>
          <button
            type='button'
            onClick={() => setMobileTab('channels')}
            className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-1.5 text-sm font-medium transition-all ${
              mobileTab === 'channels'
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            <Database className='size-3.5' />
            {t('Imported Channels')}
            {checkItems.length > 0 && (
              <span className='bg-primary/15 text-primary rounded-full px-1.5 py-0.5 text-xs font-semibold tabular-nums'>
                {checkItems.length}
              </span>
            )}
          </button>
        </div>
      </div>

      <div className='grid gap-4 xl:grid-cols-[minmax(360px,0.88fr)_minmax(0,1.12fr)]'>
        <div
          className={`bg-background overflow-hidden rounded-lg border shadow-sm ${mobileTab !== 'import' ? 'hidden xl:block' : ''}`}
        >
          <div className='border-border/70 flex items-center justify-between gap-3 border-b px-4 py-3'>
            <div className='flex min-w-0 items-center gap-2.5'>
              <span className='bg-primary/10 text-primary flex size-7 shrink-0 items-center justify-center rounded-lg'>
                <ClipboardList className='size-3.5' />
              </span>
              <h4 className='truncate text-sm font-semibold'>
                {t('Credential Content')}
              </h4>
            </div>
            {fileName && (
              <span className='text-muted-foreground max-w-48 truncate rounded-md border px-2 py-0.5 font-mono text-xs'>
                {fileName}
              </span>
            )}
          </div>

          <div className='space-y-4 p-4 sm:p-5'>
            <Alert className='border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100'>
              <FileText className='size-4' />
              <AlertTitle>{t('Credential import')}</AlertTitle>
              <AlertDescription className='text-blue-800 dark:text-blue-200/80'>
                {t(
                  'Imported credentials are created as channels. Configure models later in Channels.'
                )}
              </AlertDescription>
            </Alert>

            <Textarea
              id='account-import-content'
              value={content}
              onChange={handleContentChange}
              rows={18}
              spellCheck={false}
              className='min-h-[430px] resize-y font-mono text-xs leading-relaxed sm:text-sm'
              placeholder={t(
                'Paste JSON, an array, mixed JSON lines, or one accessToken per line'
              )}
            />

            <div className='flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between'>
              <div className='flex flex-wrap gap-2'>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => fileInputRef.current?.click()}
                  disabled={parsing || importing}
                >
                  {parsing ? (
                    <Loader2 className='size-4 animate-spin' />
                  ) : (
                    <UploadCloud className='size-4' />
                  )}
                  {t('Choose File')}
                </Button>
                <Button
                  type='button'
                  variant='outline'
                  onClick={() => parseContent(content)}
                  disabled={parsing || importing || !content.trim()}
                >
                  {parsing ? (
                    <Loader2 className='size-4 animate-spin' />
                  ) : (
                    <CheckCircle2 className='size-4' />
                  )}
                  {t('Preview')}
                </Button>
                <Button
                  type='button'
                  variant='ghost'
                  onClick={reset}
                  disabled={parsing || importing || (!content && !buildResult)}
                >
                  {t('Clear')}
                </Button>
              </div>
              <Button
                type='button'
                onClick={handleImport}
                disabled={
                  importing ||
                  checking ||
                  parsing ||
                  (!content.trim() && !buildResult?.requests.length)
                }
                className='sm:min-w-40'
              >
                {importing ? (
                  <Loader2 className='size-4 animate-spin' />
                ) : (
                  <FileUp className='size-4' />
                )}
                {importing ? t('Importing...') : t('Import Accounts')}
              </Button>
            </div>

            <input
              ref={fileInputRef}
              type='file'
              accept='application/json,text/plain,.json,.txt'
              className='hidden'
              onChange={handleFileChange}
            />

            <ImportPreviewAndErrors
              buildResult={buildResult}
              runResult={runResult}
            />
          </div>
        </div>

        <div className={mobileTab !== 'channels' ? 'hidden xl:block' : ''}>
          <ImportedChannelsPanel
            items={checkItems}
            checking={checking}
            loading={loadingImported}
            autoMonitor={autoMonitor}
            applyingGroup={applyingGroup}
            groupOptions={groupOptions}
            selectedKeys={selectedImportedKeys}
            onRefresh={() => loadImportedChannels()}
            onRunChecks={() => runPostImportChecks()}
            onToggleAutoMonitor={handleToggleAutoMonitor}
            onToggleSelected={handleToggleImportedSelected}
            onToggleAll={handleToggleAllImported}
            onApplyGroup={handleApplyGroup}
          />
        </div>
      </div>
    </section>
  )
}

const METRIC_COLOR_MAP = {
  blue: 'border-blue-200/80 bg-blue-50/60 dark:border-blue-900/40 dark:bg-blue-950/20',
  green:
    'border-emerald-200/80 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20',
  amber:
    'border-amber-200/80 bg-amber-50/60 dark:border-amber-900/40 dark:bg-amber-950/20',
  default: 'bg-muted/30',
}
const METRIC_VALUE_COLOR_MAP = {
  blue: 'text-blue-700 dark:text-blue-300',
  green: 'text-emerald-700 dark:text-emerald-300',
  amber: 'text-amber-700 dark:text-amber-300',
  default: '',
}

function ImportMetric({
  label,
  value,
  color = 'default',
}: {
  label: string
  value: number
  color?: 'blue' | 'green' | 'amber' | 'default'
}) {
  return (
    <div className={`rounded-lg border px-3 py-2 ${METRIC_COLOR_MAP[color]}`}>
      <div className='text-muted-foreground text-xs'>{label}</div>
      <div
        className={`mt-0.5 text-2xl font-bold tabular-nums ${METRIC_VALUE_COLOR_MAP[color]}`}
      >
        {value}
      </div>
    </div>
  )
}

function ImportPreviewAndErrors({
  buildResult,
  runResult,
}: {
  buildResult: AccountImportBuildResult | null
  runResult: ImportRunResult | null
}) {
  const { t } = useTranslation()
  const errors = runResult?.errors.length
    ? runResult.errors
    : buildResult?.errors || []

  return (
    <div className='grid gap-4 lg:grid-cols-2'>
      <div>
        <div className='mb-2 flex items-center gap-1.5 text-sm font-medium'>
          <ListChecks className='text-primary size-3.5' />
          {t('Import Preview')}
          {buildResult?.previews.length ? (
            <Badge variant='secondary' className='ml-1 rounded-md tabular-nums'>
              {buildResult.previews.length}
            </Badge>
          ) : null}
        </div>
        <div className='max-h-56 overflow-auto rounded-lg border'>
          {buildResult?.previews.length ? (
            buildResult.previews.slice(0, 40).map((item) => (
              <div
                key={`${item.index}-${item.name}`}
                className='border-border/50 hover:bg-muted/30 grid grid-cols-[3rem_1fr_auto] items-center gap-2 border-b px-3 py-2 text-xs transition-colors last:border-b-0'
              >
                <span className='text-muted-foreground font-mono'>
                  #{item.index + 1}
                </span>
                <span className='min-w-0 truncate font-medium'>
                  {item.name}
                </span>
                <Badge variant='outline' className='rounded-md font-normal'>
                  {item.platform}
                </Badge>
              </div>
            ))
          ) : (
            <div className='text-muted-foreground flex h-20 items-center justify-center px-4 text-center text-sm'>
              {t('No preview yet')}
            </div>
          )}
        </div>
      </div>

      <div>
        <div className='mb-2 flex items-center gap-1.5 text-sm font-medium'>
          <AlertTriangle className='size-3.5 text-amber-500' />
          {t('Import errors')}
          {errors.length > 0 && (
            <Badge
              variant='outline'
              className='ml-1 rounded-md border-amber-300 text-amber-700 tabular-nums dark:border-amber-700 dark:text-amber-400'
            >
              {errors.length}
            </Badge>
          )}
        </div>
        <div className='max-h-56 overflow-auto rounded-lg border border-amber-200/70 bg-amber-50/60 p-3 font-mono text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200'>
          {errors.length ? (
            <div className='space-y-1'>
              {errors.map((item) => (
                <div
                  key={`${item.index}-${item.name}-${item.message}`}
                  className='leading-relaxed'
                >
                  <span className='opacity-60'>#{item.index + 1}</span>{' '}
                  <span className='font-medium'>{item.name || '-'}</span>
                  <span className='opacity-70'>: {item.message}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className='text-muted-foreground flex h-16 items-center justify-center font-sans text-sm'>
              {t('No import errors')}
            </div>
          )}
        </div>
        {runResult && (
          <div className='text-muted-foreground mt-2 text-xs'>
            {t('{{created}} created, {{failed}} failed', {
              created: runResult.created,
              failed: runResult.failed,
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function ImportedChannelsPanel({
  items,
  checking,
  loading,
  autoMonitor,
  applyingGroup,
  groupOptions,
  selectedKeys,
  onRefresh,
  onRunChecks,
  onToggleAutoMonitor,
  onToggleSelected,
  onToggleAll,
  onApplyGroup,
}: {
  items: ImportedChannelCheck[]
  checking: boolean
  loading: boolean
  autoMonitor: boolean
  applyingGroup: boolean
  groupOptions: string[]
  selectedKeys: Set<string>
  onRefresh: () => void
  onRunChecks: () => void
  onToggleAutoMonitor: () => void
  onToggleSelected: (key: string, selected: boolean) => void
  onToggleAll: (selected: boolean) => void
  onApplyGroup: (group: string) => Promise<void>
}) {
  const { t } = useTranslation()
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const selectableItems = items.filter((item) => item.channelId)
  const selectedCount = selectableItems.filter((item) =>
    selectedKeys.has(item.key)
  ).length
  const allSelected =
    selectableItems.length > 0 && selectedCount === selectableItems.length
  const someSelected = selectedCount > 0 && !allSelected
  const groupSelectOptions = useMemo(
    () => Array.from(new Set(groupOptions)).filter(Boolean),
    [groupOptions]
  )
  const selectedGroupsLabel =
    selectedGroups.length > 0 ? selectedGroups.join(', ') : t('Select groups')

  const toggleSelectedGroup = useCallback((group: string, checked: boolean) => {
    setSelectedGroups((current) => {
      if (checked) {
        return current.includes(group) ? current : [...current, group]
      }
      return current.filter((item) => item !== group)
    })
  }, [])

  return (
    <div className='bg-background flex min-h-[720px] min-w-0 flex-col overflow-hidden rounded-lg border shadow-sm'>
      {/* Panel header */}
      <div className='border-border/70 border-b px-4 py-3'>
        <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
          <div className='flex min-w-0 items-center gap-2.5'>
            <span className='bg-primary/10 text-primary flex size-8 shrink-0 items-center justify-center rounded-lg'>
              <Database className='size-4' />
            </span>
            <div className='min-w-0'>
              <div className='flex items-center gap-2'>
                <h4 className='truncate text-sm font-semibold'>
                  {t('Imported Channels')}
                </h4>
                <Badge variant='secondary' className='rounded-md tabular-nums'>
                  {items.length}
                </Badge>
                <StatusBadge
                  label={t(autoMonitor ? 'Enabled' : 'Disabled')}
                  variant={autoMonitor ? 'success' : 'neutral'}
                  size='sm'
                  copyable={false}
                />
              </div>
              <p className='text-muted-foreground text-xs'>
                {t('Channel account information')}
              </p>
            </div>
          </div>
          <div className='flex flex-wrap gap-2'>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={onRefresh}
              disabled={loading || checking}
            >
              {loading ? (
                <Loader2 className='size-3.5 animate-spin' />
              ) : (
                <RefreshCw className='size-3.5' />
              )}
              {t('Refresh list')}
            </Button>
            <Button
              type='button'
              variant={autoMonitor ? 'secondary' : 'outline'}
              size='sm'
              onClick={onToggleAutoMonitor}
              disabled={loading || checking || items.length === 0}
            >
              {autoMonitor ? t('Stop monitor') : t('Start monitor')}
            </Button>
            <Button
              type='button'
              variant='outline'
              size='sm'
              onClick={onRunChecks}
              disabled={checking || loading || items.length === 0}
            >
              {checking ? (
                <Loader2 className='size-3.5 animate-spin' />
              ) : (
                <RefreshCw className='size-3.5' />
              )}
              {t('Run checks')}
            </Button>
          </div>
        </div>
      </div>

      {/* Batch group configuration */}
      {items.length > 0 && (
        <div className='relative border-b'>
          {/* Left accent bar */}
          <div className='bg-primary absolute top-0 left-0 h-full w-0.5 rounded-r-full' />
          <div className='from-primary/5 to-background bg-gradient-to-r px-4 py-3 pl-5'>
            {/* Top row: label + counters + toggle */}
            <div className='mb-2.5 flex flex-wrap items-center gap-x-3 gap-y-1.5'>
              <div className='flex items-center gap-1.5'>
                <Layers3 className='text-primary size-3.5' />
                <span className='text-sm font-semibold'>
                  {t('Batch set group')}
                </span>
              </div>
              <div className='flex items-center gap-1.5'>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium tabular-nums transition-colors ${
                    selectedCount > 0
                      ? 'bg-primary/10 text-primary ring-primary/20 ring-1'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {selectedCount} / {selectableItems.length} {t('selected')}
                </span>
              </div>
              <div className='ml-auto flex items-center gap-1.5'>
                <button
                  type='button'
                  disabled={applyingGroup || selectableItems.length === 0}
                  onClick={() => onToggleAll(!allSelected)}
                  className='text-muted-foreground hover:text-foreground cursor-pointer text-xs underline-offset-2 transition-colors hover:underline disabled:cursor-not-allowed disabled:no-underline disabled:opacity-40'
                >
                  {allSelected ? t('Clear selection') : t('Select all')}
                </button>
              </div>
            </div>

            {/* Bottom row: input + apply */}
            <div className='flex flex-col gap-2 sm:flex-row sm:items-center'>
              <DropdownMenu modal={false}>
                <DropdownMenuTrigger
                  disabled={applyingGroup}
                  render={
                    <Button
                      type='button'
                      variant='outline'
                      size='sm'
                      className='min-w-0 flex-1 justify-between gap-2'
                      disabled={applyingGroup}
                    />
                  }
                >
                  <span className='flex min-w-0 items-center gap-2'>
                    <Tag className='text-muted-foreground size-3.5 shrink-0' />
                    <span className='truncate text-sm font-medium'>
                      {selectedGroupsLabel}
                    </span>
                  </span>
                  <ChevronDown className='text-muted-foreground size-3.5 shrink-0' />
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align='start'
                  className='max-h-64 min-w-64'
                >
                  {groupSelectOptions.length > 0 ? (
                    groupSelectOptions.map((group) => (
                      <DropdownMenuCheckboxItem
                        key={group}
                        checked={selectedGroups.includes(group)}
                        onCheckedChange={(checked) =>
                          toggleSelectedGroup(group, checked)
                        }
                        onSelect={(event) => event.preventDefault()}
                        className='min-w-0'
                      >
                        <span className='truncate'>{group}</span>
                      </DropdownMenuCheckboxItem>
                    ))
                  ) : (
                    <div className='text-muted-foreground px-2 py-1.5 text-sm'>
                      {t('No groups available')}
                    </div>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
              <Button
                type='button'
                size='sm'
                disabled={
                  applyingGroup ||
                  selectedGroups.length === 0 ||
                  selectedCount === 0
                }
                onClick={() => {
                  if (selectedGroups.length > 0) {
                    void onApplyGroup(selectedGroups.join(','))
                  }
                }}
                className='shrink-0 gap-1.5'
              >
                {applyingGroup ? (
                  <Loader2 className='size-3.5 animate-spin' />
                ) : (
                  <Layers3 className='size-3.5' />
                )}
                {applyingGroup
                  ? t('Applying...')
                  : selectedCount > 0
                    ? t('Apply to {{count}} channels', { count: selectedCount })
                    : t('Apply to all')}
              </Button>
            </div>

            {/* Progress bar while applying */}
            {applyingGroup && (
              <div className='bg-primary/15 mt-2.5 h-1 w-full overflow-hidden rounded-full'>
                <div className='bg-primary h-full w-1/3 animate-[slide_1.2s_ease-in-out_infinite] rounded-full' />
              </div>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className='text-muted-foreground flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center'>
          <Loader2 className='size-7 animate-spin opacity-60' />
          <p className='text-sm font-medium'>
            {t('Loading imported channels')}
          </p>
        </div>
      ) : items.length === 0 ? (
        <div className='text-muted-foreground flex flex-1 flex-col items-center justify-center gap-4 px-6 text-center'>
          <div className='bg-muted/50 flex size-14 items-center justify-center rounded-xl border'>
            <Server className='size-6 opacity-50' />
          </div>
          <div>
            <p className='text-foreground/70 text-sm font-medium'>
              {t('No imported channels yet')}
            </p>
            <p className='text-muted-foreground mt-1 text-xs'>
              {t('Import credentials on the left to get started')}
            </p>
          </div>
        </div>
      ) : (
        <div className='min-h-0 flex-1 overflow-auto'>
          <div className='hidden md:block'>
            <Table>
              <TableHeader className='bg-muted/40 sticky top-0 z-10'>
                <TableRow>
                  <TableHead className='w-10'>
                    <Checkbox
                      checked={allSelected}
                      indeterminate={someSelected}
                      disabled={selectableItems.length === 0}
                      onCheckedChange={(value) => onToggleAll(!!value)}
                      aria-label={t('Select all imported channels')}
                    />
                  </TableHead>
                  <TableHead className='w-[34%]'>{t('Channel')}</TableHead>
                  <TableHead>{t('Account quota')}</TableHead>
                  <TableHead>{t('Channel check')}</TableHead>
                  <TableHead>{t('Models')}</TableHead>
                  <TableHead className='text-right'>{t('Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((item) => (
                  <ImportedChannelRow
                    key={item.key}
                    item={item}
                    selected={selectedKeys.has(item.key)}
                    onSelectedChange={(selected) =>
                      onToggleSelected(item.key, selected)
                    }
                  />
                ))}
              </TableBody>
            </Table>
          </div>
          <div className='divide-border divide-y md:hidden'>
            {items.map((item) => (
              <ImportedChannelCard
                key={item.key}
                item={item}
                selected={selectedKeys.has(item.key)}
                onSelectedChange={(selected) =>
                  onToggleSelected(item.key, selected)
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function ImportedChannelRow({
  item,
  selected,
  onSelectedChange,
}: {
  item: ImportedChannelCheck
  selected: boolean
  onSelectedChange: (selected: boolean) => void
}) {
  const { t } = useTranslation()

  return (
    <TableRow data-state={selected ? 'selected' : undefined}>
      <TableCell className='w-10'>
        <Checkbox
          checked={selected}
          disabled={!item.channelId}
          onCheckedChange={(value) => onSelectedChange(!!value)}
          aria-label={t('Select imported channel')}
        />
      </TableCell>
      <TableCell className='whitespace-normal'>
        <ChannelIdentity item={item} />
      </TableCell>
      <TableCell className='whitespace-normal'>
        <QuotaCell item={item} />
      </TableCell>
      <TableCell className='whitespace-normal'>
        <CheckCell status={item.channelStatus} message={item.channelMessage} />
      </TableCell>
      <TableCell className='whitespace-normal'>
        <ModelsCell models={item.models} />
      </TableCell>
      <TableCell className='text-right'>
        <OpenChannelButton item={item} />
      </TableCell>
    </TableRow>
  )
}

function ImportedChannelCard({
  item,
  selected,
  onSelectedChange,
}: {
  item: ImportedChannelCheck
  selected: boolean
  onSelectedChange: (selected: boolean) => void
}) {
  const { t } = useTranslation()

  return (
    <div
      className='data-[state=selected]:bg-primary/5 space-y-3 p-4'
      data-state={selected ? 'selected' : undefined}
    >
      <div className='flex items-start justify-between gap-3'>
        <div className='flex min-w-0 items-start gap-3'>
          <Checkbox
            checked={selected}
            disabled={!item.channelId}
            onCheckedChange={(value) => onSelectedChange(!!value)}
            aria-label={t('Select imported channel')}
            className='mt-1'
          />
          <ChannelIdentity item={item} />
        </div>
        <OpenChannelButton item={item} compact />
      </div>
      <div className='grid gap-3 text-xs'>
        <AccountInfoLine
          icon={<Gauge className='size-3.5' />}
          label={t('Account quota')}
        >
          <QuotaCell item={item} />
        </AccountInfoLine>
        <AccountInfoLine
          icon={<Activity className='size-3.5' />}
          label={t('Channel check')}
        >
          <CheckCell
            status={item.channelStatus}
            message={item.channelMessage}
          />
        </AccountInfoLine>
        <AccountInfoLine
          icon={<Boxes className='size-3.5' />}
          label={t('Models')}
        >
          <ModelsCell models={item.models} />
        </AccountInfoLine>
      </div>
    </div>
  )
}

function AccountInfoLine({
  icon,
  label,
  children,
}: {
  icon: ReactNode
  label: string
  children: ReactNode
}) {
  return (
    <div className='grid grid-cols-[7rem_1fr] items-start gap-2'>
      <div className='text-muted-foreground flex items-center gap-1.5'>
        {icon}
        <span>{label}</span>
      </div>
      <div className='min-w-0'>{children}</div>
    </div>
  )
}

function ChannelIdentity({ item }: { item: ImportedChannelCheck }) {
  const { t } = useTranslation()
  const statusMeta = getChannelStatusMeta(item.status)

  return (
    <div className='min-w-0 space-y-1.5'>
      <div className='flex min-w-0 items-center gap-1.5'>
        <span className='truncate text-sm font-semibold'>{item.name}</span>
        {item.channelId && (
          <span className='text-muted-foreground shrink-0 font-mono text-xs'>
            #{item.channelId}
          </span>
        )}
      </div>
      <div className='flex flex-wrap items-center gap-1'>
        <Badge variant='outline' className='rounded-md text-xs font-normal'>
          {item.platform || '-'}
        </Badge>
        {item.group && (
          <Badge variant='secondary' className='rounded-md text-xs font-normal'>
            <Tag className='mr-1 size-2.5 opacity-70' />
            {item.group}
          </Badge>
        )}
        <StatusBadge
          label={t(statusMeta.label)}
          variant={statusMeta.variant}
          size='sm'
          copyable={false}
        />
      </div>
      {item.remark && (
        <div className='text-muted-foreground line-clamp-2 text-xs'>
          {item.remark}
        </div>
      )}
      <div className='text-muted-foreground text-xs'>
        {t('Last checked: {{time}}', {
          time: item.lastCheckedAt
            ? formatTimestampToDate(item.lastCheckedAt)
            : t('Never checked'),
        })}
      </div>
    </div>
  )
}

function QuotaCell({ item }: { item: ImportedChannelCheck }) {
  const { t } = useTranslation()
  const usedQuota = formatQuotaNumber(item.usedQuota)
  const balance =
    item.type === CODEX_CHANNEL_TYPE
      ? item.quotaMessage || t('Pending')
      : item.balance !== undefined
        ? formatBalanceDisplay(item.balance, item.balanceCurrency)
        : item.quotaMessage || '-'

  return (
    <div className='min-w-0 space-y-1'>
      <div className='flex flex-wrap items-center gap-1.5'>
        <StatusBadge
          label={t(CHECK_STATUS_LABELS[item.quotaStatus])}
          variant={getCheckVariant(item.quotaStatus)}
          size='sm'
          copyable={false}
        />
        <span className='text-xs font-medium'>{balance}</span>
      </div>
      <div className='text-muted-foreground text-xs'>
        {t('Used:')} {usedQuota}
      </div>
    </div>
  )
}

function CheckCell({
  status,
  message,
}: {
  status: CheckStatus
  message?: string
}) {
  const { t } = useTranslation()

  return (
    <div className='min-w-0 space-y-1'>
      <StatusBadge
        label={t(CHECK_STATUS_LABELS[status])}
        variant={getCheckVariant(status)}
        size='sm'
        copyable={false}
      />
      {message && (
        <div className='text-muted-foreground line-clamp-2 text-xs'>
          {message}
        </div>
      )}
    </div>
  )
}

function ModelsCell({ models }: { models?: string }) {
  const { t } = useTranslation()
  const modelList = String(models || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  if (modelList.length === 0) {
    return (
      <StatusBadge
        label={t('Configure in Channels')}
        variant='warning'
        size='sm'
        copyable={false}
      />
    )
  }

  return (
    <div className='flex flex-wrap gap-1'>
      <Badge variant='outline' className='rounded-md font-mono'>
        {modelList[0]}
      </Badge>
      {modelList.length > 1 && (
        <Badge variant='secondary' className='rounded-md'>
          +{modelList.length - 1}
        </Badge>
      )}
    </div>
  )
}

function OpenChannelButton({
  item,
  compact,
}: {
  item: ImportedChannelCheck
  compact?: boolean
}) {
  const { t } = useTranslation()
  const filter = item.channelId ? String(item.channelId) : item.name

  return (
    <Button
      size='sm'
      variant='outline'
      render={<RouterLink to='/channels' search={{ filter }} />}
    >
      <ExternalLink className='size-3.5' />
      {!compact && t('Open in Channels')}
    </Button>
  )
}

export function AccountImportDialog(props: AccountImportDialogProps) {
  const { t } = useTranslation()

  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className='max-h-[90vh] overflow-auto p-0 sm:max-w-7xl'>
        <DialogHeader className='sr-only'>
          <DialogTitle>{t('Import Accounts')}</DialogTitle>
        </DialogHeader>
        <AccountImportPanel
          onImported={props.onImported}
          onClose={() => props.onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}
