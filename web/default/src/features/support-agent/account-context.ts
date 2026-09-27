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
import type { TFunction } from 'i18next'
import { api } from '@/lib/api'
import { formatQuota } from '@/lib/format'
import { maskSecrets } from './secrets'
import type { AccountContext, AccountContextKind } from './types'

// The user's own account data, read with their session and shown to them
// before anything is shared (phase3b-design.md). Only what is listed here is
// ever formatted: no key values, emails, invite codes or IP addresses.
export const CONTEXT_KINDS: AccountContextKind[] = [
  'recent_requests',
  'quota_summary',
  'key_status',
]
const LABELS: Record<AccountContextKind, string> = {
  recent_requests: 'Recent request records',
  quota_summary: 'Balance and usage',
  key_status: 'API key status',
}
export const contextLabel = (kind: AccountContextKind, t: TFunction) =>
  t(LABELS[kind])

// "A, B and C" in the reader's language.
export function contextList(
  kinds: AccountContextKind[],
  t: TFunction,
  language: string
) {
  const labels = kinds.map((kind) => contextLabel(kind, t))
  try {
    return new Intl.ListFormat(language, { type: 'conjunction' }).format(labels)
  } catch {
    return labels.join(', ')
  }
}

// The service accepts 4000 characters per kind.
const TEXT_LIMIT = 4000
const DAY = 86400
const LISTED_ROWS = 20
const ERROR_ROWS = 10
const ERROR_TEXT = 200
const KEY_ROWS = 50

type Result<T> = { success: boolean; message?: string; data?: T }
async function read<T>(
  url: string,
  params: Record<string, unknown> | undefined,
  valid: (data: T) => boolean
) {
  // Failures are shown in the preview, not as a global error toast.
  const res = await api.get<Result<T>>(url, {
    params,
    skipErrorHandler: true,
    skipBusinessError: true,
  })
  const data = res.data?.data
  if (!res.data?.success || data === undefined || data === null)
    throw new Error(res.data?.message || 'Request failed')
  // A changed response fails the preview instead of showing blanks.
  if (!valid(data)) throw new Error('Unexpected response')
  return data
}

type Page<T> = { items: T[]; total?: number }
const isPage = <T>(data: Page<T>) => Array.isArray(data.items)
const totalOf = <T>(page: Page<T>) =>
  Number.isFinite(page.total) ? Number(page.total) : page.items.length

type LogRow = {
  created_at: number
  type: number
  content: string
  token_name: string
  model_name: string
  quota: number
  prompt_tokens: number
  completion_tokens: number
  use_time: number
  is_stream: boolean
}
const CONSUME = 2
const ERROR = 5

const when = (seconds: number, language: string) =>
  new Date(seconds * 1000).toLocaleString(language, { hour12: false })
// Grouped digits read better, and a long count is never taken for a phone
// number by the service's masking.
const count = (value: number, language: string) =>
  Number.isFinite(value) ? value.toLocaleString(language) : '—'

function requestLine(
  row: LogRow,
  index: number,
  t: TFunction,
  language: string
) {
  const parts = [
    `${index + 1}. ${when(row.created_at, language)}`,
    `${t('Model')} ${row.model_name || '—'}`,
    `${t('Key')}「${row.token_name || '—'}」`,
  ]
  if (row.type === ERROR)
    return [
      ...parts,
      (row.content || '').replace(/\s+/g, ' ').slice(0, ERROR_TEXT),
    ].join(' · ')
  return [
    ...parts,
    t('{{prompt}} in / {{completion}} out tokens', {
      prompt: count(row.prompt_tokens, language),
      completion: count(row.completion_tokens, language),
    }),
    `${t('Cost')} ${formatQuota(row.quota)}`,
    t('{{count}} s', { count: row.use_time }),
    ...(row.is_stream ? [t('Streamed')] : []),
  ].join(' · ')
}

async function recentRequests(t: TFunction, language: string) {
  const end = Math.floor(Date.now() / 1000)
  const window = { start_timestamp: end - DAY, end_timestamp: end, p: 1 }
  const [usage, errors] = await Promise.all([
    read<Page<LogRow>>(
      '/api/log/self',
      { ...window, type: CONSUME, page_size: LISTED_ROWS },
      isPage
    ),
    read<Page<LogRow>>(
      '/api/log/self',
      { ...window, type: ERROR, page_size: ERROR_ROWS },
      isPage
    ),
  ])
  const billedTotal = totalOf(usage)
  const errorTotal = totalOf(errors)
  if (!billedTotal && !errorTotal)
    return t(
      'No requests recorded in the last 24 hours. The site records billed calls; failed requests may not be recorded.'
    )
  // Recorded errors matter most when something fails, so they are always
  // listed; the newest billed calls fill the rest.
  const failed = errors.items.slice(0, ERROR_ROWS)
  const billed = usage.items.slice(0, LISTED_ROWS - failed.length)
  const section = (title: string, rows: LogRow[]) =>
    rows.length
      ? [title, ...rows.map((row, i) => requestLine(row, i, t, language))]
      : []
  return [
    t(
      'Last 24 hours: {{billed}} billed calls, {{errors}} recorded errors (not every failed request is recorded).',
      {
        billed: count(billedTotal, language),
        errors: count(errorTotal, language),
      }
    ),
    ...section(
      t('Recorded errors (newest {{n}}):', { n: failed.length }),
      failed
    ),
    ...section(t('Billed calls (newest {{n}}):', { n: billed.length }), billed),
  ].join('\n')
}

type UserRow = {
  quota: number
  used_quota: number
  request_count: number
  group: string
}
const isUser = (data: UserRow) =>
  [data.quota, data.used_quota, data.request_count].every((value) =>
    Number.isFinite(value)
  )

async function quotaSummary(t: TFunction, language: string) {
  const user = await read<UserRow>('/api/user/self', undefined, isUser)
  return [
    `${t('Balance')}: ${formatQuota(user.quota)}`,
    `${t('Used')}: ${formatQuota(user.used_quota)}`,
    `${t('Request count')}: ${count(user.request_count, language)}`,
    `${t('Group')}: ${user.group || 'default'}`,
  ].join('\n')
}

type KeyRow = {
  name: string
  status: number
  remain_quota: number
  used_quota: number
  unlimited_quota: boolean
  expired_time: number
  group?: string | null
  model_limits_enabled: boolean
  allow_ips?: string | null
}
const KEY_STATES: Record<number, string> = {
  1: 'Enabled',
  2: 'Disabled',
  3: 'Expired',
  4: 'Used up',
}

async function keyStatus(t: TFunction, language: string) {
  const page = await read<Page<KeyRow>>(
    '/api/token/',
    { p: 1, size: KEY_ROWS },
    isPage
  )
  const keys = page.items
  if (!keys.length) return t('No API keys yet.')
  const lines = keys.map((key, index) =>
    [
      `${index + 1}. ${key.name || '—'}`,
      t(KEY_STATES[key.status] ?? 'Unknown state'),
      key.expired_time === -1
        ? t('Never expires')
        : t('Expires {{date}}', {
            date: new Date(key.expired_time * 1000).toLocaleDateString(
              language
            ),
          }),
      key.unlimited_quota
        ? t('Unlimited quota')
        : t('{{amount}} left', { amount: formatQuota(key.remain_quota) }),
      `${t('Used')} ${formatQuota(key.used_quota)}`,
      `${t('Group')} ${key.group || 'default'}`,
      ...(key.model_limits_enabled ? [t('Limited to some models')] : []),
      ...(key.allow_ips?.trim() ? [t('Limited to some IP addresses')] : []),
    ].join(' · ')
  )
  const total = totalOf(page)
  const shown =
    total > keys.length
      ? t('API keys (first {{count}} of {{total}}):', {
          count: keys.length,
          total,
        })
      : t('API keys ({{count}}):', { count: keys.length })
  return [shown, ...lines].join('\n')
}

const FORMATTERS: Record<
  AccountContextKind,
  (t: TFunction, language: string) => Promise<string>
> = {
  recent_requests: recentRequests,
  quota_summary: quotaSummary,
  key_status: keyStatus,
}

// Invisible format characters (zero-width, bidirectional overrides) could hide
// text from the person reviewing the preview, and other control characters
// become spaces; the service strips the same again.
const visible = (text: string) =>
  text
    .replace(/\p{Cf}/gu, '')
    .replace(/\p{Cc}/gu, (char) => ('\t\n\r'.includes(char) ? char : ' '))

// Exactly the text that would be shared: masked here as well, and cut to the
// size the service accepts.
export async function readAccountContext(
  kind: AccountContextKind,
  t: TFunction,
  language: string
): Promise<AccountContext> {
  const raw = visible(await FORMATTERS[kind](t, language))
  const masked = maskSecrets(raw, t('[private key removed]')).text
  const text =
    masked.length > TEXT_LIMIT ? `${masked.slice(0, TEXT_LIMIT - 1)}…` : masked
  return { kind, text }
}
