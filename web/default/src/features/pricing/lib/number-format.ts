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

const PRICING_NOISE_TOLERANCE = 3e-7

function roundToDigits(value: number, digits: number): number {
  const factor = Math.pow(10, digits)
  return Math.round((value + Number.EPSILON) * factor) / factor
}

export function normalizePricingNumber(
  value: number | null | undefined,
  maxDigits = 8
): number {
  const num = Number(value)
  if (!Number.isFinite(num)) return num

  const nearestInteger = Math.round(num)
  if (Math.abs(num - nearestInteger) <= 1e-6) {
    return nearestInteger
  }

  const limit = Math.min(Math.max(maxDigits, 0), 8)
  for (let digits = 0; digits <= limit; digits++) {
    const rounded = roundToDigits(num, digits)
    if (Math.abs(num - rounded) <= PRICING_NOISE_TOLERANCE) {
      return rounded
    }
  }

  return roundToDigits(num, limit)
}

export function formatPricingNumber(
  value: number | null | undefined,
  maxDigits = 8
): string {
  const num = normalizePricingNumber(value, maxDigits)
  if (!Number.isFinite(num)) return '-'
  const fixed = num.toFixed(Math.min(Math.max(maxDigits, 0), 8))
  return fixed.replace(/\.?0+$/, '')
}
