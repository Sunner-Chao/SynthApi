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
import { useState, useCallback } from 'react'
import i18next from 'i18next'
import { toast } from 'sonner'
import {
  calculateAmount,
  calculateStripeAmount,
  calculateWaffoPancakeAmount,
  requestPayment,
  requestStripePayment,
  createMPayOrder,
  createXPayOrder,
  isApiSuccess,
} from '../api'
import {
  isStripePayment,
  isWaffoPancakePayment,
  isXPayRoutedPayment,
  submitPaymentForm,
} from '../lib'

// ============================================================================
// Payment Hook
// ============================================================================

export function usePayment(
  isLocalCurrency: boolean = false,
  displayCurrency: string = 'CNY',
  usdExchangeRate: number = 7.3
) {
  const [amount, setAmount] = useState<number>(0)
  const [calculating, setCalculating] = useState(false)
  const [processing, setProcessing] = useState(false)

  // Calculate payment amount
  const calculatePaymentAmount = useCallback(
    async (topupAmount: number, paymentType: string) => {
      try {
        setCalculating(true)

        // If amounts are already in local currency
        if (isLocalCurrency) {
          // When display is USD, multiply by exchange rate for actual payment
          if (displayCurrency === 'USD') {
            const payAmount = topupAmount * usdExchangeRate
            setAmount(payAmount)
            return payAmount
          }
          // When display is CNY, no conversion needed
          setAmount(topupAmount)
          return topupAmount
        }

        const isStripe = isStripePayment(paymentType)
        const isPancake = isWaffoPancakePayment(paymentType)
        const response = isStripe
          ? await calculateStripeAmount({ amount: topupAmount })
          : isPancake
            ? await calculateWaffoPancakeAmount({ amount: topupAmount })
            : await calculateAmount({ amount: topupAmount })

        if (isApiSuccess(response) && response.data) {
          const calculatedAmount = parseFloat(response.data)
          setAmount(calculatedAmount)
          return calculatedAmount
        }

        // Don't show error for calculation, just set to 0
        setAmount(0)
        return 0
      } catch (_error) {
        setAmount(0)
        return 0
      } finally {
        setCalculating(false)
      }
    },
    [isLocalCurrency, displayCurrency, usdExchangeRate]
  )

  // Process payment
  const processPayment = useCallback(
    async (topupAmount: number, paymentType: string, paymentGateway?: string) => {
      try {
        setProcessing(true)

        const isStripe = isStripePayment(paymentType)
        const isMPay = paymentGateway === 'mpay'
        const isXPay = isXPayRoutedPayment(paymentType)
        // 保留小数，不使用 Math.floor
        const amount = Math.round(topupAmount * 100) / 100

        if (isMPay || isXPay) {
          const createOrder = isMPay ? createMPayOrder : createXPayOrder
          const response = await createOrder({
            amount,
            payment_method: isMPay ? paymentType : 'Alipay',
          })

          if (!isApiSuccess(response)) {
            toast.error(response.message || i18next.t('Payment request failed'))
            return false
          }

          const payUrl = response.data?.pay_url
          if (!payUrl) {
            toast.error(i18next.t('Payment request failed'))
            return false
          }
          window.open(payUrl, '_blank')
          toast.success(i18next.t('Redirecting to payment page...'))
          return true
        }

        if (isStripe) {
          const response = await requestStripePayment({
            amount,
            payment_method: 'stripe',
          })

          if (!isApiSuccess(response)) {
            toast.error(response.message || i18next.t('Payment request failed'))
            return false
          }

          if (response.data?.pay_link) {
            window.open(response.data.pay_link as string, '_blank')
            toast.success(i18next.t('Redirecting to payment page...'))
            return true
          }

          return false
        }

        const response = await requestPayment({
          amount,
          payment_method: paymentType,
        })

        if (!isApiSuccess(response)) {
          toast.error(response.message || i18next.t('Payment request failed'))
          return false
        }

        if (response.url && response.data) {
          submitPaymentForm(response.url, response.data)
          toast.success(i18next.t('Redirecting to payment page...'))
          return true
        }

        return false
      } catch (_error) {
        toast.error(i18next.t('Payment request failed'))
        return false
      } finally {
        setProcessing(false)
      }
    },
    []
  )

  return {
    amount,
    calculating,
    processing,
    calculatePaymentAmount,
    processPayment,
    setAmount,
  }
}
