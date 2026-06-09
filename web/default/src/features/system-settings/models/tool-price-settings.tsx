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
import { memo, useCallback, useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import { Code2, Copy, Eye, Plus, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { getCurrencyDisplay } from '@/lib/currency'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from '@/components/ui/input-group'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { Textarea } from '@/components/ui/textarea'
import { useUpdateOption } from '../hooks/use-update-option'

const OPTION_KEY = 'tool_price_setting.prices'

const DEFAULT_PRICES: Record<string, number> = {
  web_search: 10.0,
  web_search_preview: 10.0,
  'web_search_preview:gpt-4o*': 25.0,
  'web_search_preview:gpt-4.1*': 25.0,
  'web_search_preview:gpt-4o-mini*': 25.0,
  'web_search_preview:gpt-4.1-mini*': 25.0,
  file_search: 2.5,
  google_search: 14.0,
}

type ToolPriceRow = {
  id: number
  key: string
  price: number
}

function rowsToObject(rows: ToolPriceRow[]): Record<string, number> {
  const prices: Record<string, number> = {}
  for (const row of rows) {
    const k = row.key.trim()
    if (!k) continue
    prices[k] = Number(row.price) || 0
  }
  return prices
}

function objectToRows(prices: Record<string, number>): ToolPriceRow[] {
  return Object.entries(prices).map(([key, price], index) => ({
    id: index + 1,
    key,
    price: Number(price) || 0,
  }))
}

function parseInitialPrices(
  rawValue: string | undefined
): Record<string, number> {
  if (!rawValue) return { ...DEFAULT_PRICES }
  try {
    const parsed = JSON.parse(rawValue) as unknown
    if (
      parsed &&
      typeof parsed === 'object' &&
      !Array.isArray(parsed) &&
      Object.keys(parsed as object).length > 0
    ) {
      return parsed as Record<string, number>
    }
  } catch {
    // fall through to defaults
  }
  return { ...DEFAULT_PRICES }
}

function roundToDecimals(value: number, decimals: number): number {
  const factor = 10 ** decimals
  return Math.round(value * factor) / factor
}

function getToolPriceCurrencyMeta() {
  const { config } = getCurrencyDisplay()
  switch (config.quotaDisplayType) {
    case 'CNY':
      return {
        label: 'CNY',
        symbol: '¥',
        exchangeRate: config.usdExchangeRate || 1,
      }
    case 'CUSTOM':
      return {
        label: 'CUSTOM',
        symbol: config.customCurrencySymbol || '¤',
        exchangeRate: config.customCurrencyExchangeRate || 1,
      }
    default:
      return {
        label: 'USD',
        symbol: '$',
        exchangeRate: 1,
      }
  }
}

function ToolPriceInput(props: {
  value: number
  currencySymbol: string
  exchangeRate: number
  onChange: (value: number) => void
}) {
  const [displayValue, setDisplayValue] = useState('')

  useEffect(() => {
    setDisplayValue(
      String(
        roundToDecimals((Number(props.value) || 0) * props.exchangeRate, 6)
      )
    )
  }, [props.value, props.exchangeRate])

  const handleChange = (event: ChangeEvent<HTMLInputElement>) => {
    const value = event.target.value
    if (value === '' || /^\d*\.?\d*$/.test(value)) {
      setDisplayValue(value)
    }
  }

  const handleBlur = () => {
    const displayNumber = Number(displayValue)
    props.onChange(
      Number.isFinite(displayNumber)
        ? roundToDecimals(displayNumber / props.exchangeRate, 8)
        : 0
    )
  }

  return (
    <InputGroup>
      <InputGroupAddon>{props.currencySymbol}</InputGroupAddon>
      <InputGroupInput
        inputMode='decimal'
        value={displayValue}
        onBlur={handleBlur}
        onChange={handleChange}
      />
      <InputGroupAddon align='inline-end'>/1K</InputGroupAddon>
    </InputGroup>
  )
}

type ToolPriceSettingsProps = {
  defaultValue: string
}

export const ToolPriceSettings = memo(function ToolPriceSettings({
  defaultValue,
}: ToolPriceSettingsProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const [editMode, setEditMode] = useState<'visual' | 'json'>('visual')
  const [rows, setRows] = useState<ToolPriceRow[]>([])
  const [jsonText, setJsonText] = useState('')
  const [jsonError, setJsonError] = useState('')
  const [nextRowId, setNextRowId] = useState(1)
  const currencyMeta = getToolPriceCurrencyMeta()

  useEffect(() => {
    const prices = parseInitialPrices(defaultValue)
    const initialRows = objectToRows(prices)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setRows(initialRows)
    setJsonText(JSON.stringify(prices, null, 2))
    setJsonError('')
    setNextRowId(initialRows.length + 1)
  }, [defaultValue])

  const currentPrices = useMemo(() => rowsToObject(rows), [rows])

  const syncFromRows = useCallback((nextRows: ToolPriceRow[]) => {
    setRows(nextRows)
    setJsonText(JSON.stringify(rowsToObject(nextRows), null, 2))
    setJsonError('')
  }, [])

  const handleJsonChange = useCallback(
    (text: string) => {
      setJsonText(text)
      try {
        const parsed = JSON.parse(text) as unknown
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          setJsonError(t('JSON must be an object'))
          return
        }
        const nextRows = objectToRows(parsed as Record<string, number>)
        setRows(nextRows)
        setNextRowId(nextRows.length + 1)
        setJsonError('')
      } catch (error) {
        setJsonError(error instanceof Error ? error.message : t('Invalid JSON'))
      }
    },
    [t]
  )

  const updateRow = useCallback(
    (id: number, field: 'key' | 'price', value: string | number) => {
      syncFromRows(
        rows.map((r) => (r.id === id ? { ...r, [field]: value } : r))
      )
    },
    [rows, syncFromRows]
  )

  const addRow = useCallback(() => {
    const newRow: ToolPriceRow = { id: nextRowId, key: '', price: 0 }
    setNextRowId((prev) => prev + 1)
    syncFromRows([...rows, newRow])
  }, [nextRowId, rows, syncFromRows])

  const removeRow = useCallback(
    (id: number) => {
      syncFromRows(rows.filter((r) => r.id !== id))
    },
    [rows, syncFromRows]
  )

  const resetToDefault = useCallback(() => {
    const initialRows = objectToRows(DEFAULT_PRICES)
    setRows(initialRows)
    setJsonText(JSON.stringify(DEFAULT_PRICES, null, 2))
    setJsonError('')
    setNextRowId(initialRows.length + 1)
  }, [])

  const handleCopyJson = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(jsonText)
      toast.success(t('Copied to clipboard'))
    } catch {
      toast.error(t('Failed to copy'))
    }
  }, [jsonText, t])

  const handleSave = useCallback(async () => {
    if (editMode === 'json' && jsonError) {
      toast.error(t('Please fix JSON errors before saving'))
      return
    }
    await updateOption.mutateAsync({
      key: OPTION_KEY,
      value: JSON.stringify(currentPrices),
    })
  }, [currentPrices, editMode, jsonError, t, updateOption])

  const toggleEditMode = useCallback(() => {
    setEditMode((prev) => (prev === 'visual' ? 'json' : 'visual'))
  }, [])

  return (
    <div className='space-y-4'>
      <Alert>
        <AlertDescription className='space-y-1 text-sm'>
          <div>
            {t(
              'Configure per-tool unit prices. Visual mode follows the global currency display; JSON values are stored as USD per 1K calls. Per-request models do not incur additional tool fees.'
            )}
          </div>
          <div>
            <span className='font-medium'>{t('Format')}:</span>{' '}
            <code className='bg-muted rounded px-1 py-0.5 text-xs'>
              web_search_preview
            </code>{' '}
            {t('is the default price; ')}
            <code className='bg-muted rounded px-1 py-0.5 text-xs'>
              web_search_preview:gpt-4o*
            </code>{' '}
            {t('overrides for matching model prefix.')}
          </div>
        </AlertDescription>
      </Alert>

      <div className='flex flex-wrap items-center justify-between gap-2'>
        <div className='flex flex-wrap items-center gap-2'>
          {editMode === 'visual' ? (
            <>
              <Button variant='outline' size='sm' onClick={addRow}>
                <Plus className='mr-2 h-4 w-4' />
                {t('Add')}
              </Button>
              <Button variant='ghost' size='sm' onClick={resetToDefault}>
                {t('Restore defaults')}
              </Button>
            </>
          ) : (
            <>
              <Button variant='ghost' size='sm' onClick={handleCopyJson}>
                <Copy className='mr-2 h-4 w-4' />
                {t('Copy')}
              </Button>
              <Button variant='ghost' size='sm' onClick={resetToDefault}>
                {t('Restore defaults')}
              </Button>
            </>
          )}
        </div>
        <Button variant='outline' size='sm' onClick={toggleEditMode}>
          {editMode === 'visual' ? (
            <>
              <Code2 className='mr-2 h-4 w-4' />
              {t('Switch to JSON')}
            </>
          ) : (
            <>
              <Eye className='mr-2 h-4 w-4' />
              {t('Switch to Visual')}
            </>
          )}
        </Button>
      </div>

      {editMode === 'visual' ? (
        <div className='overflow-hidden rounded-md border'>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('Tool identifier')}</TableHead>
                <TableHead className='w-[200px]'>
                  {`${t('Price')} (${currencyMeta.label}/1K)`}
                </TableHead>
                <TableHead className='w-[80px] text-right'>
                  {t('Actions')}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={3}
                    className='text-muted-foreground py-8 text-center'
                  >
                    {t('No tools configured')}
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>
                      <Input
                        value={row.key}
                        placeholder='web_search_preview:gpt-4o*'
                        onChange={(e) =>
                          updateRow(row.id, 'key', e.target.value)
                        }
                      />
                    </TableCell>
                    <TableCell>
                      <ToolPriceInput
                        value={row.price}
                        currencySymbol={currencyMeta.symbol}
                        exchangeRate={currencyMeta.exchangeRate}
                        onChange={(value) => updateRow(row.id, 'price', value)}
                      />
                    </TableCell>
                    <TableCell className='text-right'>
                      <Button
                        variant='ghost'
                        size='icon'
                        onClick={() => removeRow(row.id)}
                        aria-label={t('Delete')}
                      >
                        <Trash2 className='text-destructive h-4 w-4' />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      ) : (
        <div className='space-y-2'>
          <Textarea
            value={jsonText}
            onChange={(e) => handleJsonChange(e.target.value)}
            className='font-mono text-sm'
            rows={12}
            spellCheck={false}
          />
          {jsonError && <p className='text-destructive text-sm'>{jsonError}</p>}
        </div>
      )}

      <div className='flex justify-end'>
        <Button
          onClick={handleSave}
          disabled={
            updateOption.isPending || (editMode === 'json' && !!jsonError)
          }
        >
          {t('Save tool prices')}
        </Button>
      </div>
    </div>
  )
})
