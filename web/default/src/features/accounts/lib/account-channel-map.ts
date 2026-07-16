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
import { CHANNEL_STATUS } from '@/features/channels/constants'
import { getDefaultBaseUrl } from '@/features/channels/lib/channel-type-config'
import type { AddChannelRequest, Channel } from '@/features/channels/types'

export type AccountPlatform =
  | 'openai'
  | 'anthropic'
  | 'gemini'
  | 'codex'
  | 'openrouter'
  | 'custom'

export type AccountImportPreview = {
  index: number
  name: string
  platform: string
  models: string
}

export type AccountImportBuildResult = {
  requests: AddChannelRequest[]
  previews: AccountImportPreview[]
  errors: AccountImportError[]
}

export type AccountImportError = {
  index: number
  name?: string
  message: string
}

type PlatformConfig = {
  channelType: number
  label: string
}

type CodexCredentialParts = {
  accessToken: string
  refreshToken: string
  idToken: string
  accountId: string
  email: string
  expiresAt: string
  userId: string
  planType: string
  organizationId: string
  name: string
  sessionTokenPresent: boolean
}

const CODEX_IMPORT_CLOCK_SKEW_SECONDS = 120

export const ACCOUNT_PLATFORM_CONFIGS: Record<AccountPlatform, PlatformConfig> =
  {
    openai: {
      channelType: 1,
      label: 'OpenAI',
    },
    anthropic: {
      channelType: 14,
      label: 'Anthropic',
    },
    gemini: {
      channelType: 24,
      label: 'Gemini',
    },
    codex: {
      channelType: 57,
      label: 'Codex',
    },
    openrouter: {
      channelType: 20,
      label: 'OpenRouter',
    },
    custom: {
      channelType: 8,
      label: 'Custom',
    },
  }

type ImportedAccountMeta = {
  email?: string
  accountId?: string
  userId?: string
  planType?: string
  organizationId?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function asRecord(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {}
}

function firstString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim()
    if (typeof value === 'number' && Number.isFinite(value))
      return String(value)
  }
  return ''
}

function normalizeList(value: unknown): string {
  if (Array.isArray(value)) {
    return value
      .map((item) => firstString(item))
      .filter(Boolean)
      .join(',')
  }
  return firstString(value)
}

function normalizeGroup(value: unknown, fallback = 'default'): string {
  if (Array.isArray(value)) {
    const groups = value
      .map((item) => {
        if (isRecord(item)) return firstString(item.name, item.group)
        return firstString(item)
      })
      .filter(Boolean)
    return groups.length > 0 ? groups.join(',') : fallback
  }
  return firstString(value) || fallback
}

function normalizeJsonString(value: unknown): string {
  const direct = firstString(value)
  if (direct) return direct
  if (isRecord(value) || Array.isArray(value)) return JSON.stringify(value)
  return ''
}

function normalizeSettingsRecord(value: unknown): Record<string, unknown> {
  if (isRecord(value)) return value
  const direct = firstString(value)
  if (!direct) return {}
  try {
    const parsed = JSON.parse(direct) as unknown
    return isRecord(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

function parseJsonObject(value: string): Record<string, unknown> | null {
  if (!value.trim().startsWith('{')) return null
  try {
    const parsed = JSON.parse(value) as unknown
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function valueAtPath(source: Record<string, unknown>, path: string[]): unknown {
  let current: unknown = source
  for (const key of path) {
    if (!isRecord(current)) return undefined
    current = current[key]
  }
  return current
}

function firstPathString(
  source: Record<string, unknown>,
  paths: string[][]
): string {
  for (const path of paths) {
    const value = firstString(valueAtPath(source, path))
    if (value) return value
  }
  return ''
}

function parseTimeLike(value: unknown): string {
  const raw = firstString(value)
  if (!raw) return ''

  const numeric = Number(raw)
  let date: Date
  if (Number.isFinite(numeric) && /^\d+(\.\d+)?$/.test(raw)) {
    date = new Date(numeric > 1_000_000_000_000 ? numeric : numeric * 1000)
  } else {
    date = new Date(raw)
  }

  return Number.isFinite(date.getTime()) ? date.toISOString() : ''
}

function firstPathTime(
  source: Record<string, unknown>,
  paths: string[][]
): string {
  for (const path of paths) {
    const value = parseTimeLike(valueAtPath(source, path))
    if (value) return value
  }
  return ''
}

function decodeBase64UrlJson(segment: string): Record<string, unknown> | null {
  try {
    let normalized = segment.replace(/-/g, '+').replace(/_/g, '/')
    const padding = normalized.length % 4
    if (padding > 0) normalized += '='.repeat(4 - padding)

    const binary = globalThis.atob(normalized)
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0))
    const decoded = new TextDecoder().decode(bytes)
    const parsed = JSON.parse(decoded) as unknown
    return isRecord(parsed) ? parsed : null
  } catch {
    return null
  }
}

function extractOrganizationId(authClaims: Record<string, unknown>): string {
  const direct = firstString(authClaims.poid, authClaims.organization_id)
  if (direct) return direct

  const organizations = authClaims.organizations
  if (!Array.isArray(organizations)) return ''

  const defaultOrg = organizations.find((item) => {
    const org = asRecord(item)
    return org.is_default === true || org.isDefault === true
  })
  if (defaultOrg) return firstString(asRecord(defaultOrg).id)

  return firstString(asRecord(organizations[0]).id)
}

function readCodexJwtParts(token: string): Partial<CodexCredentialParts> {
  const parts = token.trim().split('.')
  if (parts.length !== 3) return {}

  const claims = decodeBase64UrlJson(parts[1])
  if (!claims) return {}

  const authClaims = asRecord(claims['https://api.openai.com/auth'])
  const exp = Number(claims.exp)
  const result: Partial<CodexCredentialParts> = {
    email: firstString(claims.email),
    userId: firstString(claims.sub),
  }

  if (Number.isFinite(exp) && exp > 0) {
    result.expiresAt = new Date(exp * 1000).toISOString()
  }

  if (Object.keys(authClaims).length > 0) {
    result.accountId = firstString(authClaims.chatgpt_account_id)
    result.userId =
      firstString(authClaims.chatgpt_user_id, authClaims.user_id) ||
      result.userId
    result.planType = firstString(authClaims.chatgpt_plan_type)
    result.organizationId = extractOrganizationId(authClaims)
  }

  return result
}

function mergeCodexParts(
  base: CodexCredentialParts,
  incoming: Partial<CodexCredentialParts>
) {
  for (const [key, value] of Object.entries(incoming)) {
    if (typeof value === 'string' && value.trim()) {
      base[key as keyof CodexCredentialParts] = value.trim() as never
    }
  }
}

function collectCodexCredentialParts(
  source: Record<string, unknown>,
  credentials: Record<string, unknown>,
  fallbackKey: string
): CodexCredentialParts {
  const inlineJson = parseJsonObject(fallbackKey)
  const effectiveSource = inlineJson ? { ...source, ...inlineJson } : source
  const effectiveCredentials = inlineJson
    ? { ...asRecord(inlineJson.credentials), ...credentials }
    : credentials
  const rawFallbackToken =
    !inlineJson && !fallbackKey.trim().startsWith('{') ? fallbackKey : ''

  const parts: CodexCredentialParts = {
    accessToken: firstString(
      effectiveCredentials.access_token,
      effectiveCredentials.accessToken,
      firstPathString(effectiveSource, [
        ['tokens', 'access_token'],
        ['tokens', 'accessToken'],
        ['access_token'],
        ['accessToken'],
        ['token'],
      ]),
      rawFallbackToken
    ),
    refreshToken: firstString(
      effectiveCredentials.refresh_token,
      effectiveCredentials.refreshToken,
      firstPathString(effectiveSource, [
        ['tokens', 'refresh_token'],
        ['tokens', 'refreshToken'],
        ['refresh_token'],
        ['refreshToken'],
      ])
    ),
    idToken: firstString(
      effectiveCredentials.id_token,
      effectiveCredentials.idToken,
      firstPathString(effectiveSource, [
        ['tokens', 'id_token'],
        ['tokens', 'idToken'],
        ['id_token'],
        ['idToken'],
      ])
    ),
    accountId: firstString(
      effectiveCredentials.account_id,
      effectiveCredentials.chatgpt_account_id,
      firstPathString(effectiveSource, [
        ['chatgpt_account_id'],
        ['chatgptAccountId'],
        ['account_id'],
        ['accountId'],
        ['account', 'id'],
        ['account', 'account_id'],
        ['account', 'chatgpt_account_id'],
      ])
    ),
    email: firstString(
      effectiveCredentials.email,
      firstPathString(effectiveSource, [['email'], ['user', 'email']])
    ),
    expiresAt:
      firstString(
        effectiveCredentials.expired,
        effectiveCredentials.expires_at
      ) ||
      firstPathTime(effectiveSource, [
        ['tokens', 'expires_at'],
        ['tokens', 'expiresAt'],
        ['expired'],
        ['expires_at'],
        ['expiresAt'],
      ]),
    userId: firstString(
      effectiveCredentials.chatgpt_user_id,
      firstPathString(effectiveSource, [
        ['chatgpt_user_id'],
        ['chatgptUserId'],
        ['user_id'],
        ['userId'],
        ['user', 'id'],
      ])
    ),
    planType: firstString(
      effectiveCredentials.plan_type,
      firstPathString(effectiveSource, [
        ['plan_type'],
        ['planType'],
        ['account', 'plan_type'],
        ['account', 'planType'],
      ])
    ),
    organizationId: firstString(
      effectiveCredentials.organization_id,
      firstPathString(effectiveSource, [
        ['organization_id'],
        ['organizationId'],
        ['org_id'],
        ['orgId'],
      ])
    ),
    name: firstPathString(effectiveSource, [['name'], ['user', 'name']]),
    sessionTokenPresent: Boolean(
      firstPathString(effectiveSource, [['session_token'], ['sessionToken']])
    ),
  }

  if (parts.idToken) mergeCodexParts(parts, readCodexJwtParts(parts.idToken))
  if (parts.accessToken) {
    mergeCodexParts(parts, readCodexJwtParts(parts.accessToken))
  }

  return parts
}

function hasCodexAccountClaim(token: string): boolean {
  return Boolean(readCodexJwtParts(token).accountId)
}

function looksLikeCodexCredentialSource(
  source: Record<string, unknown>
): boolean {
  const credentials = asRecord(source.credentials)
  const platform = firstString(source.platform).toLowerCase()
  if (platform.includes('codex')) return true

  if (
    firstPathString(source, [
      ['accessToken'],
      ['sessionToken'],
      ['chatgpt_account_id'],
      ['chatgptAccountId'],
      ['tokens', 'access_token'],
      ['tokens', 'accessToken'],
      ['account', 'chatgpt_account_id'],
    ])
  ) {
    return true
  }

  if (
    firstString(credentials.access_token) &&
    firstString(credentials.chatgpt_account_id, credentials.account_id)
  ) {
    return true
  }

  const token = firstString(
    credentials.access_token,
    firstPathString(source, [
      ['tokens', 'access_token'],
      ['tokens', 'accessToken'],
      ['access_token'],
      ['accessToken'],
      ['token'],
    ])
  )
  return token ? hasCodexAccountClaim(token) : false
}

function normalizePlatform(value: unknown): AccountPlatform {
  const normalized = firstString(value).toLowerCase()
  if (normalized.includes('openrouter')) return 'openrouter'
  if (normalized.includes('anthropic') || normalized.includes('claude')) {
    return 'anthropic'
  }
  if (normalized.includes('gemini') || normalized.includes('google')) {
    return 'gemini'
  }
  if (normalized.includes('codex')) return 'codex'
  if (normalized.includes('openai') || normalized.includes('chatgpt')) {
    return 'openai'
  }
  return 'custom'
}

function inferAccountPlatform(
  source: Record<string, unknown>
): AccountPlatform {
  const platform = normalizePlatform(
    firstString(source.platform, source.provider, source.service)
  )
  if (
    (platform === 'openai' || platform === 'custom' || platform === 'codex') &&
    looksLikeCodexCredentialSource(source)
  ) {
    return 'codex'
  }
  return platform
}

function platformFromChannelType(type: number): AccountPlatform {
  for (const [platform, config] of Object.entries(ACCOUNT_PLATFORM_CONFIGS)) {
    if (config.channelType === type) return platform as AccountPlatform
  }
  return 'custom'
}

function resolveChannelType(
  source: Record<string, unknown>,
  platform: AccountPlatform
): number {
  const channelType = Number(source.channel_type ?? source.channelType)
  if (Number.isInteger(channelType) && channelType > 0) return channelType

  const directType = Number(source.type)
  if (Number.isInteger(directType) && directType > 0) return directType

  return ACCOUNT_PLATFORM_CONFIGS[platform].channelType
}

function buildCodexCredential(
  source: Record<string, unknown>,
  credentials: Record<string, unknown>,
  fallbackKey: string
): string {
  const existingJson = parseJsonObject(fallbackKey)
  if (
    existingJson &&
    firstString(existingJson.access_token) &&
    firstString(existingJson.account_id)
  ) {
    return JSON.stringify({ type: 'codex', ...existingJson })
  }

  const parts = collectCodexCredentialParts(source, credentials, fallbackKey)
  if (!parts.accessToken || !parts.accountId) return fallbackKey

  const payload: Record<string, unknown> = {
    type: 'codex',
    access_token: parts.accessToken,
    account_id: parts.accountId,
  }
  if (parts.refreshToken) payload.refresh_token = parts.refreshToken
  if (parts.idToken) payload.id_token = parts.idToken
  if (parts.email) payload.email = parts.email
  if (parts.expiresAt) payload.expired = parts.expiresAt
  return JSON.stringify(payload)
}

function getCodexKeyValidationError(key: string): string | null {
  const parsed = parseJsonObject(key)
  if (!parsed) return 'Codex key must be a valid JSON object'
  if (!firstString(parsed.access_token)) {
    return 'Codex key JSON must include access_token'
  }
  if (!firstString(parsed.account_id)) {
    return 'Codex key JSON must include account_id'
  }

  const refreshToken = firstString(parsed.refresh_token)
  const expired = firstString(parsed.expired, parsed.expires_at)
  if (!refreshToken && expired) {
    const expiresAt = Date.parse(expired)
    if (
      Number.isFinite(expiresAt) &&
      expiresAt / 1000 <= Date.now() / 1000 - CODEX_IMPORT_CLOCK_SKEW_SECONDS
    ) {
      return 'Codex access_token is expired and no refresh_token is available'
    }
  }
  return null
}

export function isCodexCredentialInputReady(
  input: string,
  accountId = ''
): boolean {
  const key = buildCodexCredential({ account_id: accountId }, {}, input.trim())
  return getCodexKeyValidationError(key) === null
}

function extractKey(
  source: Record<string, unknown>,
  platform: AccountPlatform
): string {
  const credentials = asRecord(source.credentials)
  const fallbackKey = firstString(
    source.key,
    source.api_key,
    source.apiKey,
    source.token,
    credentials.key,
    credentials.api_key,
    credentials.apiKey,
    credentials.session_key,
    credentials.access_token,
    credentials.refresh_token,
    firstPathString(source, [
      ['tokens', 'access_token'],
      ['tokens', 'accessToken'],
      ['accessToken'],
      ['access_token'],
    ])
  )

  if (platform === 'codex') {
    return buildCodexCredential(source, credentials, fallbackKey)
  }

  return fallbackKey
}

function collectImportedAccountMeta(
  source: Record<string, unknown>,
  credentials: Record<string, unknown>,
  codexParts: CodexCredentialParts | null
): ImportedAccountMeta {
  return {
    email: firstString(
      source.email,
      credentials.email,
      firstPathString(source, [['user', 'email']]),
      codexParts?.email
    ),
    accountId: firstString(
      source.account_id,
      source.accountId,
      credentials.account_id,
      credentials.accountId,
      credentials.chatgpt_account_id,
      codexParts?.accountId
    ),
    userId: firstString(
      source.user_id,
      source.userId,
      credentials.user_id,
      credentials.userId,
      firstPathString(source, [['user', 'id']]),
      codexParts?.userId
    ),
    planType: firstString(
      source.plan_type,
      source.planType,
      credentials.plan_type,
      credentials.planType,
      codexParts?.planType
    ),
    organizationId: firstString(
      source.organization_id,
      source.organizationId,
      credentials.organization_id,
      credentials.organizationId,
      codexParts?.organizationId
    ),
  }
}

function buildImportRemark(
  source: Record<string, unknown>,
  meta?: ImportedAccountMeta
): string {
  const notes = firstString(source.notes, source.remark, source.description)
  const accountType = firstString(source.account_type, source.accountType)
  const typeValue = firstString(source.type)
  const fragments = [notes]
  if (meta?.email) fragments.push(`Account email: ${meta.email}`)
  if (meta?.accountId) fragments.push(`Account ID: ${meta.accountId}`)
  if (meta?.planType) fragments.push(`Plan: ${meta.planType}`)
  if (accountType) fragments.push(`Imported account type: ${accountType}`)
  if (typeValue && !Number.isFinite(Number(typeValue))) {
    fragments.push(`Imported source type: ${typeValue}`)
  }
  return fragments.filter(Boolean).join('\n')
}

function buildImportedSettings(
  source: Record<string, unknown>,
  platform: AccountPlatform,
  meta?: ImportedAccountMeta
): string {
  const settings = normalizeSettingsRecord(source.settings)
  return JSON.stringify({
    ...settings,
    imported_account_platform: platform,
    imported_account_type: firstString(source.type, source.account_type),
    imported_account_email: meta?.email,
    imported_account_id: meta?.accountId,
    imported_account_user_id: meta?.userId,
    imported_account_plan_type: meta?.planType,
    imported_account_organization_id: meta?.organizationId,
  })
}

function normalizeDirectChannel(
  source: Record<string, unknown>
): Partial<Channel> {
  const type = Number(source.type)
  const platform = Number.isInteger(type)
    ? platformFromChannelType(type)
    : normalizePlatform(source.platform)
  const channelType = resolveChannelType(source, platform)
  const key = extractKey(source, platform)
  const models = normalizeList(source.models)
  const meta = collectImportedAccountMeta(
    source,
    asRecord(source.credentials),
    null
  )

  return {
    name:
      firstString(source.name) ||
      `${ACCOUNT_PLATFORM_CONFIGS[platform].label} Account`,
    type: channelType,
    key,
    base_url:
      firstString(source.base_url, source.baseUrl) ||
      getDefaultBaseUrl(channelType) ||
      null,
    models,
    group: normalizeGroup(source.group, 'default'),
    priority: Number(source.priority ?? 0),
    status: Number(source.status ?? CHANNEL_STATUS.ENABLED),
    tag: firstString(source.tag) || null,
    remark: buildImportRemark(source, meta),
    setting: normalizeJsonString(source.setting) || undefined,
    settings:
      normalizeJsonString(buildImportedSettings(source, platform, meta)) ||
      undefined,
    other: firstString(source.other),
  }
}

function normalizeAccount(source: Record<string, unknown>): Partial<Channel> {
  const platform = inferAccountPlatform(source)
  const credentials = asRecord(source.credentials)
  const fallbackKey = firstString(
    source.key,
    source.api_key,
    source.apiKey,
    source.token,
    credentials.access_token,
    firstPathString(source, [
      ['tokens', 'access_token'],
      ['tokens', 'accessToken'],
      ['accessToken'],
      ['access_token'],
    ])
  )
  const codexParts =
    platform === 'codex'
      ? collectCodexCredentialParts(source, credentials, fallbackKey)
      : null
  const channelType = resolveChannelType(source, platform)
  const statusText = firstString(source.status).toLowerCase()
  const status =
    statusText === 'inactive' || statusText === 'error'
      ? CHANNEL_STATUS.MANUAL_DISABLED
      : CHANNEL_STATUS.ENABLED
  const meta = collectImportedAccountMeta(source, credentials, codexParts)
  const models =
    normalizeList(source.models) || normalizeList(asRecord(source.extra).models)

  return {
    name:
      firstString(
        source.name,
        firstPathString(source, [['user', 'name']]),
        credentials.email,
        firstPathString(source, [['user', 'email']]),
        codexParts?.email,
        codexParts?.accountId
      ) || `${ACCOUNT_PLATFORM_CONFIGS[platform].label} Account`,
    type: channelType,
    key: extractKey(source, platform),
    base_url:
      firstString(
        source.base_url,
        source.baseUrl,
        asRecord(source.extra).base_url
      ) ||
      getDefaultBaseUrl(channelType) ||
      null,
    models,
    group: normalizeGroup(
      source.group ?? source.groups ?? source.group_names,
      'default'
    ),
    priority: Number(source.priority ?? 0),
    status,
    tag: firstString(source.tag) || null,
    remark: buildImportRemark(source, meta),
    settings: buildImportedSettings(source, platform, meta),
    other: firstString(source.other),
  }
}

function normalizeImportItem(
  item: unknown,
  index: number
): {
  request?: AddChannelRequest
  preview?: AccountImportPreview
  error?: AccountImportError
} {
  const source =
    typeof item === 'string'
      ? { platform: 'codex', accessToken: item.trim() }
      : asRecord(item)
  if (!Object.keys(source).length) {
    return { error: { index, message: 'Item is not an object' } }
  }

  let channelSource: Record<string, unknown> | null = null
  if (isRecord(source.channel)) {
    channelSource = source.channel
  } else if (Number.isInteger(Number(source.type)) && firstString(source.key)) {
    channelSource = source
  }
  const channel = channelSource
    ? normalizeDirectChannel(channelSource)
    : normalizeAccount(source)

  if (!firstString(channel.name)) {
    channel.name = `Imported Account ${index + 1}`
  }
  if (!firstString(channel.key)) {
    return {
      error: {
        index,
        name: firstString(channel.name),
        message: 'Missing credential key',
      },
    }
  }
  if (Number(channel.type) === ACCOUNT_PLATFORM_CONFIGS.codex.channelType) {
    const codexError = getCodexKeyValidationError(firstString(channel.key))
    if (codexError) {
      return {
        error: {
          index,
          name: firstString(channel.name),
          message: codexError,
        },
      }
    }
  }

  const request: AddChannelRequest = {
    mode: 'single',
    channel,
  }
  return {
    request,
    preview: {
      index,
      name: firstString(channel.name),
      platform:
        ACCOUNT_PLATFORM_CONFIGS[platformFromChannelType(Number(channel.type))]
          ?.label ?? 'Custom',
      models: firstString(channel.models),
    },
  }
}

export function extractImportItems(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload
  if (typeof payload === 'string' && payload.trim()) return [payload.trim()]
  if (!isRecord(payload)) return []

  const data = payload.data
  if (Array.isArray(payload.accounts)) return payload.accounts
  if (Array.isArray(payload.channels)) return payload.channels
  if (Array.isArray(payload.items)) return payload.items
  if (Array.isArray(data)) return data
  if (isRecord(data)) {
    if (Array.isArray(data.accounts)) return data.accounts
    if (Array.isArray(data.channels)) return data.channels
    if (Array.isArray(data.items)) return data.items
  }
  return [payload]
}

function looksLikeJsonContent(content: string): boolean {
  for (let index = 0; index < content.length; index += 1) {
    const char = content[index]
    if (/\s/.test(char)) continue
    return char === '{' || char === '['
  }
  return false
}

function flattenImportValues(values: unknown[]): unknown[] {
  const out: unknown[] = []
  const appendValue = (value: unknown) => {
    if (Array.isArray(value)) {
      value.forEach(appendValue)
      return
    }
    out.push(value)
  }
  values.forEach(appendValue)
  return out
}

function parseAccountImportLines(content: string): unknown[] {
  const values: unknown[] = []
  let lineStart = 0

  for (let index = 0; index <= content.length; index += 1) {
    if (index < content.length && content.charCodeAt(index) !== 10) continue

    const trimmed = content.slice(lineStart, index).trim()
    lineStart = index + 1
    if (!trimmed) continue
    if (looksLikeJsonContent(trimmed)) {
      values.push(...flattenImportValues([JSON.parse(trimmed) as unknown]))
      continue
    }
    values.push(trimmed)
  }
  return values
}

export function parseAccountImportText(content: string): unknown {
  if (!/\S/.test(content)) return []

  if (looksLikeJsonContent(content)) {
    try {
      return JSON.parse(content) as unknown
    } catch (error) {
      if (content.includes('\n')) return parseAccountImportLines(content)
      throw error
    }
  }

  return parseAccountImportLines(content)
}

export function buildImportRequests(
  payload: unknown
): AccountImportBuildResult {
  const items = extractImportItems(payload)
  const requests: AddChannelRequest[] = []
  const previews: AccountImportPreview[] = []
  const errors: AccountImportError[] = []

  items.forEach((item, index) => {
    const result = normalizeImportItem(item, index)
    if (result.request) requests.push(result.request)
    if (result.preview) previews.push(result.preview)
    if (result.error) errors.push(result.error)
  })

  return { requests, previews, errors }
}

export function buildImportRequestsFromText(
  content: string
): AccountImportBuildResult {
  return buildImportRequests(parseAccountImportText(content))
}
