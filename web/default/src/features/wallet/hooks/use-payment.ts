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
import { useState, useCallback, useRef } from 'react'
import i18next from 'i18next'
import { toast } from 'sonner'
import {
  calculateAmount,
  calculateStripeAmount,
  calculateWaffoAmount,
  calculateWaffoPancakeAmount,
  requestPayment,
  requestStripePayment,
  createAlipayDirectOrder,
  createMPayOrder,
  createXPayOrder,
  isApiSuccess,
} from '../api'
import { PAYMENT_PROVIDERS, PAYMENT_TYPES } from '../constants'
import {
  isStripePayment,
  isWaffoPancakePayment,
  isXPayRoutedPayment,
  normalizeTopupAmount,
  submitPaymentForm,
} from '../lib'

// ============================================================================
// Payment Hook
// ============================================================================

export function usePayment() {
  const [amount, setAmount] = useState<number>(0)
  const [calculating, setCalculating] = useState(false)
  const [processing, setProcessing] = useState(false)
  const calculationRequestRef = useRef(0)

  // Calculate payment amount
  const calculatePaymentAmount = useCallback(
    async (
      topupAmount: number,
      paymentType: string,
      paymentProvider?: string
    ) => {
      const requestId = ++calculationRequestRef.current
      try {
        setCalculating(true)
        const amount = normalizeTopupAmount(topupAmount)
        if (amount <= 0) {
          if (requestId === calculationRequestRef.current) {
            setAmount(0)
          }
          return 0
        }

        const isStripe = isStripePayment(paymentType)
        const isPancake = isWaffoPancakePayment(paymentType)
        const isWaffo =
          paymentProvider === PAYMENT_PROVIDERS.WAFFO ||
          paymentType === PAYMENT_TYPES.WAFFO
        const response = isStripe
          ? await calculateStripeAmount({ amount })
          : isPancake
            ? await calculateWaffoPancakeAmount({ amount })
            : isWaffo
              ? await calculateWaffoAmount({ amount })
              : await calculateAmount({
                  amount,
                  payment_provider: paymentProvider,
                })

        if (requestId !== calculationRequestRef.current) return null

        if (isApiSuccess(response) && response.data) {
          const calculatedAmount = parseFloat(response.data)
          if (Number.isFinite(calculatedAmount) && calculatedAmount > 0) {
            setAmount(calculatedAmount)
            return calculatedAmount
          }
        }

        // Don't show error for calculation, just set to 0
        if (requestId === calculationRequestRef.current) {
          setAmount(0)
        }
        return 0
      } catch (_error) {
        if (requestId !== calculationRequestRef.current) return null
        if (requestId === calculationRequestRef.current) {
          setAmount(0)
        }
        return 0
      } finally {
        if (requestId === calculationRequestRef.current) {
          setCalculating(false)
        }
      }
    },
    []
  )

  // Process payment
  const processPayment = useCallback(
    async (
      topupAmount: number,
      paymentType: string,
      paymentProvider?: string
    ) => {
      try {
        setProcessing(true)

        const isStripe = isStripePayment(paymentType)
        const isAlipayDirect =
          paymentProvider === PAYMENT_PROVIDERS.ALIPAY_DIRECT
        const isMPay = paymentProvider === PAYMENT_PROVIDERS.MPAY
        const isXPay = isXPayRoutedPayment(paymentType, paymentProvider)
        const amount = normalizeTopupAmount(topupAmount)
        if (amount <= 0) {
          toast.error(i18next.t('Payment request failed'))
          return false
        }

        if (isAlipayDirect || isMPay || isXPay) {
          const response = isAlipayDirect
            ? await createAlipayDirectOrder({ amount })
            : await (isMPay ? createMPayOrder : createXPayOrder)({
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
          toast.success(i18next.t('Redirecting to payment page...'))
          if (isAlipayDirect) {
            window.location.assign(payUrl)
          } else {
            window.open(payUrl, '_blank')
          }
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
