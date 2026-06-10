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
import dayjs from '@/lib/dayjs'
import { formatLocalCurrencyAmount } from '@/lib/currency'
import {
  DEFAULT_CURRENCY_CONFIG,
  useSystemConfigStore,
} from '@/stores/system-config-store'
import type { SubscriptionPlan } from '../types'

export function formatSubscriptionPrice(amount: number | null | undefined) {
  return formatLocalCurrencyAmount(Number(amount || 0), {
    digitsLarge: 2,
    digitsSmall: 2,
    abbreviate: false,
  })
}

export function normalizeSubscriptionBillingDiscount(
  discount: number | null | undefined
) {
  const value = Number(discount ?? 1)
  if (!Number.isFinite(value) || value <= 0 || value > 1) return 1
  return value
}

export function formatSubscriptionDiscountPercent(
  discount: number | null | undefined
) {
  const percent = normalizeSubscriptionBillingDiscount(discount) * 100
  return `${Number(percent.toFixed(percent < 1 ? 2 : 1))}%`
}

export function formatSubscriptionDiscountOffPercent(
  discount: number | null | undefined
) {
  const off = (1 - normalizeSubscriptionBillingDiscount(discount)) * 100
  return `${Number(off.toFixed(off < 1 ? 2 : 1))}%`
}

export function normalizeSubscriptionDisplayAmount(amount: number) {
  if (!Number.isFinite(amount)) return 0
  return Number(amount.toFixed(6))
}

export function displaySubscriptionAmountToQuota(
  amount: number | null | undefined
) {
  const value = Number(amount || 0)
  if (!Number.isFinite(value) || value <= 0) return 0

  const currency =
    useSystemConfigStore.getState().config.currency ?? DEFAULT_CURRENCY_CONFIG
  const quotaPerUnit =
    currency.quotaPerUnit && currency.quotaPerUnit > 0
      ? currency.quotaPerUnit
      : DEFAULT_CURRENCY_CONFIG.quotaPerUnit

  if (currency.quotaDisplayType === 'TOKENS') {
    return Math.round(value)
  }

  let amountUSD = value
  if (currency.quotaDisplayType === 'CNY') {
    const rate =
      currency.usdExchangeRate && currency.usdExchangeRate > 0
        ? currency.usdExchangeRate
        : DEFAULT_CURRENCY_CONFIG.usdExchangeRate
    amountUSD = value / rate
  } else if (currency.quotaDisplayType === 'CUSTOM') {
    const rate =
      currency.customCurrencyExchangeRate &&
      currency.customCurrencyExchangeRate > 0
        ? currency.customCurrencyExchangeRate
        : DEFAULT_CURRENCY_CONFIG.customCurrencyExchangeRate
    amountUSD = value / rate
  }

  return Math.round(amountUSD * quotaPerUnit)
}

export function formatDuration(
  plan: Partial<SubscriptionPlan>,
  t: TFunction
): string {
  const unit = plan?.duration_unit || 'month'
  const value = plan?.duration_value || 1
  const unitLabels: Record<string, string> = {
    year: t('years'),
    month: t('months'),
    day: t('days'),
    hour: t('hours'),
    custom: t('Custom (seconds)'),
  }
  if (unit === 'custom') {
    const seconds = plan?.custom_seconds || 0
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)} ${t('days')}`
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)} ${t('hours')}`
    return `${seconds} ${t('seconds')}`
  }
  return `${value} ${unitLabels[unit] || unit}`
}

export function formatResetPeriod(
  plan: Partial<SubscriptionPlan>,
  t: TFunction
): string {
  const period = plan?.quota_reset_period || 'never'
  if (period === 'daily') return t('Daily')
  if (period === 'weekly') return t('Weekly')
  if (period === 'monthly') return t('Monthly')
  if (period === 'custom') {
    const seconds = Number(plan?.quota_reset_custom_seconds || 0)
    if (seconds >= 86400) return `${Math.floor(seconds / 86400)} ${t('days')}`
    if (seconds >= 3600) return `${Math.floor(seconds / 3600)} ${t('hours')}`
    if (seconds >= 60) return `${Math.floor(seconds / 60)} ${t('minutes')}`
    return `${seconds} ${t('seconds')}`
  }
  return t('No Reset')
}

export function formatTimestamp(ts: number): string {
  if (!ts) return '-'
  return dayjs(ts * 1000).format('YYYY-MM-DD HH:mm:ss')
}
