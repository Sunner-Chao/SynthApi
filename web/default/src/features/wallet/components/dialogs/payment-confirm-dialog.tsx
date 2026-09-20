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
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { formatLocalCurrencyAmount } from '@/lib/currency'
import { cn } from '@/lib/utils'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  DEFAULT_DISCOUNT_RATE,
  PAYMENT_PROVIDERS,
  PAYMENT_TYPES,
} from '../../constants'
import {
  formatCurrency,
  getPaymentIcon,
  getPaymentMethodDisplayName,
  isAlipayDirectPayment,
} from '../../lib'
import type { PaymentMethod } from '../../types'

interface PaymentConfirmDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: () => void
  topupAmount: number
  paymentAmount: number
  paymentMethod: PaymentMethod | undefined
  calculating: boolean
  processing: boolean
  discountRate?: number
  usdExchangeRate?: number
  /** Whether preset amounts are already in local currency */
  isLocalCurrency?: boolean
  /** Current display currency (CNY, USD, etc.) */
  displayCurrency?: string
}

export function PaymentConfirmDialog({
  open,
  onOpenChange,
  onConfirm,
  topupAmount,
  paymentAmount,
  paymentMethod,
  calculating,
  processing,
  discountRate = DEFAULT_DISCOUNT_RATE,
  usdExchangeRate = 1,
  isLocalCurrency = false,
  displayCurrency = 'CNY',
}: PaymentConfirmDialogProps) {
  const { t } = useTranslation()
  const hasDiscount = discountRate > 0 && discountRate < 1 && paymentAmount > 0
  const originalAmount = hasDiscount ? paymentAmount / discountRate : 0
  const discountAmount = hasDiscount ? originalAmount - paymentAmount : 0
  const isDirect = isAlipayDirectPayment(paymentMethod)
  const isRecommended = paymentMethod?.recommended === true
  const isBackup = paymentMethod?.provider === PAYMENT_PROVIDERS.XPAY
  const paymentMethodName = paymentMethod
    ? getPaymentMethodDisplayName(paymentMethod, t)
    : ''

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className='max-sm:w-[calc(100vw-1.5rem)] sm:max-w-md'>
        <AlertDialogHeader>
          <AlertDialogTitle className='text-xl font-semibold'>
            {t('Confirm Payment')}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t('Review your payment details')}
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div className='space-y-3 py-3 sm:space-y-4 sm:py-4'>
          <div className='flex items-center justify-between'>
            <span className='text-muted-foreground text-sm'>
              {t('Topup Amount')}
            </span>
            <span className='text-lg font-semibold'>
              {isLocalCurrency && displayCurrency === 'USD'
                ? formatLocalCurrencyAmount(topupAmount, {
                    digitsLarge: 2,
                    digitsSmall: 2,
                    abbreviate: false,
                  })
                : formatLocalCurrencyAmount(topupAmount * usdExchangeRate, {
                    digitsLarge: 2,
                    digitsSmall: 2,
                    abbreviate: false,
                  })}
            </span>
          </div>

          <div className='flex items-center justify-between'>
            <span className='text-muted-foreground text-sm'>
              {t('You Pay')}
            </span>
            {calculating ? (
              <Skeleton className='h-6 w-24' />
            ) : (
              <div className='flex items-baseline gap-2'>
                <span className='text-2xl font-semibold'>
                  {formatCurrency(paymentAmount)}
                </span>
                {hasDiscount && (
                  <span className='text-muted-foreground text-sm line-through'>
                    {formatCurrency(originalAmount)}
                  </span>
                )}
              </div>
            )}
          </div>

          {hasDiscount && !calculating && (
            <div className='bg-muted/50 rounded-lg p-3'>
              <div className='flex items-center justify-between text-sm'>
                <span className='text-muted-foreground'>{t('You save')}</span>
                <span className='font-semibold text-green-600'>
                  {formatCurrency(discountAmount)}
                </span>
              </div>
            </div>
          )}

          <div className='border-t pt-4'>
            <div className='flex items-center justify-between gap-3'>
              <span className='text-muted-foreground shrink-0 text-sm'>
                {t('Payment Method')}
              </span>
              <div className='flex min-w-0 flex-1 flex-col items-end gap-0.5'>
                <div className='flex min-w-0 items-center justify-end gap-2'>
                  <span
                    className={cn(
                      'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg shadow-sm ring-1 ring-inset',
                      paymentMethod?.type === PAYMENT_TYPES.ALIPAY &&
                        'bg-[#1677ff]/10 text-[#1677ff] ring-[#1677ff]/15 dark:bg-[#1677ff]/15',
                      paymentMethod?.type === PAYMENT_TYPES.WECHAT &&
                        'bg-[#07c160]/12 text-[#07a84f] ring-[#07c160]/20 dark:bg-[#07c160]/15 dark:text-[#4ade80]',
                      paymentMethod?.type !== PAYMENT_TYPES.ALIPAY &&
                        paymentMethod?.type !== PAYMENT_TYPES.WECHAT &&
                        'bg-muted text-muted-foreground ring-border'
                    )}
                  >
                    {getPaymentIcon(
                      paymentMethod?.type,
                      'h-[17px] w-[17px]',
                      paymentMethod?.icon,
                      paymentMethodName
                    )}
                  </span>
                  <span className='truncate font-medium'>
                    {paymentMethodName}
                  </span>
                  {isRecommended && (
                    <Badge
                      variant='secondary'
                      className='shrink-0 border border-[#07c160]/20 bg-[#07c160]/12 text-[#078a45] dark:bg-[#07c160]/15 dark:text-[#4ade80]'
                    >
                      {t('Recommended')}
                    </Badge>
                  )}
                </div>
                {(isDirect || isBackup) && (
                  <span className='text-muted-foreground max-w-56 text-right text-xs leading-4'>
                    {isDirect
                      ? t('Official direct payment, more stable')
                      : t('Backup payment method')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        <AlertDialogFooter className='grid grid-cols-2 gap-2 sm:flex'>
          <AlertDialogCancel disabled={processing}>
            {t('Cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            disabled={
              processing ||
              calculating ||
              !Number.isFinite(paymentAmount) ||
              paymentAmount <= 0
            }
          >
            {processing && <Loader2 className='mr-2 h-4 w-4 animate-spin' />}
            {t('Confirm Payment')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
