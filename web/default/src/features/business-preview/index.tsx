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
import { useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useTranslation } from 'react-i18next'
import { formatNumber, formatQuota } from '@/lib/format'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { buttonVariants } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { Skeleton } from '@/components/ui/skeleton'
import { PublicLayout } from '@/components/layout'
import { Footer } from '@/components/layout/components/footer'
import {
  formatDuration,
  formatResetPeriod,
  formatSubscriptionDiscountPercent,
} from '@/features/subscriptions/lib'
import { getPaymentMethodName } from '@/features/wallet/lib/billing'
import { getPaymentIcon } from '@/features/wallet/lib/ui'
import { getBusinessPreview } from './api'
import type { PublicPaymentMethod, PublicSubscriptionPlan } from './types'

function formatTopUpAmount(amount: number, symbol: string): string {
  return `${symbol}${formatNumber(amount)}`
}

function PaymentMethodCard({
  method,
  currencySymbol,
}: {
  method: PublicPaymentMethod
  currencySymbol: string
}) {
  const { t } = useTranslation()
  const displayName = getPaymentMethodName(method.type, t)

  return (
    <Card size='sm'>
      <CardHeader>
        <div className='flex items-center gap-3'>
          <div className='bg-muted flex size-10 shrink-0 items-center justify-center rounded-md'>
            {getPaymentIcon(method.type, 'size-6', undefined, displayName)}
          </div>
          <div className='min-w-0'>
            <div className='flex flex-wrap items-center gap-2'>
              <CardTitle className='truncate'>{displayName}</CardTitle>
              {method.recommended && (
                <Badge variant='secondary'>{t('Recommended')}</Badge>
              )}
            </div>
            <CardDescription>
              {method.min_topup > 0
                ? t('Minimum top-up: {{amount}}', {
                    amount: formatTopUpAmount(method.min_topup, currencySymbol),
                  })
                : t('Available after sign in')}
            </CardDescription>
          </div>
        </div>
      </CardHeader>
    </Card>
  )
}

function PlanCard({
  plan,
  currencySymbol,
}: {
  plan: PublicSubscriptionPlan
  currencySymbol: string
}) {
  const { t } = useTranslation()
  const resetPeriod = formatResetPeriod(plan, t)

  return (
    <Card>
      <CardHeader>
        <div className='flex items-start justify-between gap-3'>
          <div className='min-w-0'>
            <CardTitle>{plan.title}</CardTitle>
            {plan.subtitle && (
              <CardDescription>{plan.subtitle}</CardDescription>
            )}
          </div>
          {plan.non_refundable && (
            <Badge variant='outline'>{t('Non-refundable')}</Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className='flex flex-col gap-3'>
        <div className='flex flex-wrap items-end justify-between gap-3'>
          <span className='text-2xl font-semibold'>
            {formatTopUpAmount(plan.price_amount, currencySymbol)}
          </span>
          <Badge variant='secondary'>
            {t('{{rate}} usage rate', {
              rate: formatSubscriptionDiscountPercent(plan.billing_discount),
            })}
          </Badge>
        </div>
        <Separator />
        <dl className='grid gap-2 text-sm'>
          <div className='flex items-center justify-between gap-3'>
            <dt className='text-muted-foreground'>{t('Validity Period')}</dt>
            <dd>{formatDuration(plan, t)}</dd>
          </div>
          <div className='flex items-center justify-between gap-3'>
            <dt className='text-muted-foreground'>{t('Total Quota')}</dt>
            <dd>
              {plan.unlimited || plan.total_amount <= 0
                ? t('Unlimited')
                : formatQuota(plan.total_amount)}
            </dd>
          </div>
          {resetPeriod !== t('No Reset') && (
            <div className='flex items-center justify-between gap-3'>
              <dt className='text-muted-foreground'>{t('Quota Reset')}</dt>
              <dd>{resetPeriod}</dd>
            </div>
          )}
        </dl>
      </CardContent>
      <CardFooter>
        <Link
          to='/sign-in'
          search={{ redirect: '/wallet' }}
          className={buttonVariants({
            variant: 'outline',
            className: 'w-full',
          })}
        >
          {t('Sign in to purchase')}
        </Link>
      </CardFooter>
    </Card>
  )
}

export function BusinessPreview() {
  const { t } = useTranslation()
  const { data, isLoading, isError } = useQuery({
    queryKey: ['business-preview'],
    queryFn: getBusinessPreview,
    retry: false,
  })
  const preview = data?.data

  return (
    <PublicLayout showMainContainer={false} showNotifications={false}>
      <main className='mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 pt-24 pb-12 sm:px-6'>
        <div className='flex flex-col gap-3'>
          <div className='flex flex-wrap items-center gap-2'>
            <h1 className='text-2xl font-semibold'>{t('Wallet & Plans')}</h1>
            <Badge variant='outline'>{t('Public preview')}</Badge>
          </div>
          <p className='text-muted-foreground max-w-3xl text-sm leading-6'>
            {t(
              'Review available payment methods and subscription plans before creating an account.'
            )}
          </p>
        </div>

        <Alert>
          <AlertTitle>{t('Purchases require an account')}</AlertTitle>
          <AlertDescription>
            {t(
              'This page never exposes user balances, orders, or subscriptions. Sign in before confirming any payment.'
            )}
          </AlertDescription>
        </Alert>

        {isLoading && (
          <div className='grid gap-4 sm:grid-cols-2 lg:grid-cols-3'>
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className='h-28 w-full' />
            ))}
          </div>
        )}

        {isError && (
          <Alert variant='destructive'>
            <AlertTitle>{t('Public preview is unavailable')}</AlertTitle>
            <AlertDescription>
              {t(
                'The administrator has not enabled anonymous business preview.'
              )}
            </AlertDescription>
          </Alert>
        )}

        {preview && (
          <>
            <section className='flex flex-col gap-4'>
              <div>
                <h2 className='text-lg font-semibold'>{t('Add Funds')}</h2>
                <p className='text-muted-foreground mt-1 text-sm'>
                  {t('Payment methods currently available for wallet top-up.')}
                </p>
              </div>

              {preview.amount_options.length > 0 && (
                <div className='flex flex-wrap gap-2'>
                  {preview.amount_options.map((amount) => (
                    <Badge key={amount} variant='outline'>
                      {formatTopUpAmount(amount, preview.currency_symbol)}
                    </Badge>
                  ))}
                </div>
              )}

              {preview.payment_methods.length > 0 ? (
                <div className='grid gap-3 sm:grid-cols-2 lg:grid-cols-3'>
                  {preview.payment_methods.map((method) => (
                    <PaymentMethodCard
                      key={method.type}
                      method={method}
                      currencySymbol={preview.currency_symbol}
                    />
                  ))}
                </div>
              ) : (
                <p className='text-muted-foreground text-sm'>
                  {t('No payment methods available.')}
                </p>
              )}
            </section>

            <Separator />

            <section className='flex flex-col gap-4'>
              <div>
                <h2 className='text-lg font-semibold'>
                  {t('Subscription Plans')}
                </h2>
                <p className='text-muted-foreground mt-1 text-sm'>
                  {t(
                    'Plan access is delivered to the account after payment confirmation.'
                  )}
                </p>
              </div>

              {preview.plans.length > 0 ? (
                <div className='grid gap-4 md:grid-cols-2 xl:grid-cols-3'>
                  {preview.plans.map((plan) => (
                    <PlanCard
                      key={plan.id}
                      plan={plan}
                      currencySymbol={preview.currency_symbol}
                    />
                  ))}
                </div>
              ) : (
                <p className='text-muted-foreground text-sm'>
                  {t('No plans available')}
                </p>
              )}
            </section>

            <div className='flex flex-wrap items-center gap-3'>
              <Link
                to='/sign-up'
                className={buttonVariants({ variant: 'default' })}
              >
                {t('Create account')}
              </Link>
              <Link
                to='/user-agreement'
                className={buttonVariants({ variant: 'outline' })}
              >
                {t('User Agreement')}
              </Link>
              <Link
                to='/privacy-policy'
                className={buttonVariants({ variant: 'outline' })}
              >
                {t('Privacy Policy')}
              </Link>
            </div>
          </>
        )}
      </main>
      <Footer />
    </PublicLayout>
  )
}
