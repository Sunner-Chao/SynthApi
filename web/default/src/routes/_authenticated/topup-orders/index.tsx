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
import { createFileRoute } from '@tanstack/react-router'
import {
  Search,
  Copy,
  Check,
  ChevronLeft,
  ChevronRight,
  FileDown,
  RefreshCw,
  LayoutGrid,
  LayoutList,
  Calendar,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import {
  formatLocalCurrencyAmount,
  formatQuotaWithCurrency,
} from '@/lib/currency'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Skeleton } from '@/components/ui/skeleton'
import { StatusBadge } from '@/components/status-badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useBillingHistory } from '@/features/wallet/hooks/use-billing-history'
import {
  getStatusConfig,
  getPaymentMethodName,
  formatTimestamp,
} from '@/features/wallet/lib/billing'
import type { TopupRecord } from '@/features/wallet/types'

export const Route = createFileRoute('/_authenticated/topup-orders/')({
  component: TopupOrdersPage,
})

type ViewMode = 'card' | 'table'

function formatTopupAmount(record: TopupRecord) {
  const money = Number(record.money)
  if (Number.isFinite(money) && money > 0) {
    return formatLocalCurrencyAmount(money, {
      digitsLarge: 2,
      digitsSmall: 2,
      abbreviate: false,
    })
  }

  const displayAmount = Number(record.display_amount)
  if (Number.isFinite(displayAmount) && displayAmount > 0) {
    return formatLocalCurrencyAmount(displayAmount, {
      digitsLarge: 2,
      digitsSmall: 2,
      abbreviate: false,
    })
  }

  const amount = Number(record.amount)
  if (!Number.isFinite(amount)) return '-'

  if (Math.abs(amount) >= 10000) {
    return formatQuotaWithCurrency(amount, {
      digitsLarge: 2,
      digitsSmall: 2,
      abbreviate: false,
    })
  }

  return formatLocalCurrencyAmount(amount, {
    digitsLarge: 2,
    digitsSmall: 2,
    abbreviate: false,
  })
}

function formatPaymentAmount(amount: number) {
  return formatLocalCurrencyAmount(amount, {
    digitsLarge: 2,
    digitsSmall: 2,
    abbreviate: false,
  })
}

function TopupOrdersPage() {
  const { t } = useTranslation()
  const {
    records,
    total,
    page,
    pageSize,
    keyword,
    loading,
    handlePageChange,
    handlePageSizeChange,
    handleSearch,
    refresh,
  } = useBillingHistory()

  const { copyToClipboard, copiedText } = useCopyToClipboard({ notify: false })
  const totalPages = Math.ceil(total / pageSize)
  const [viewMode, setViewMode] = useState<ViewMode>('table')
  const [statusFilter, setStatusFilter] = useState<string>('all')

  const filteredRecords =
    statusFilter === 'all'
      ? records
      : records.filter((r) => r.status === statusFilter)

  const handleExportCSV = useCallback(() => {
    if (records.length === 0) return

    const headers = [
      t('Order Number'),
      t('Time'),
      t('Payment Method'),
      t('Amount'),
      t('Payment'),
      t('Status'),
    ]

    const rows = records.map((record) => [
      record.trade_no,
      formatTimestamp(record.create_time),
      getPaymentMethodName(record.payment_method, t),
      formatTopupAmount(record),
      formatPaymentAmount(record.money),
      getStatusConfig(record.status).label,
    ])

    const csv = [headers.join(','), ...rows.map((row) => row.join(','))].join(
      '\n'
    )
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `topup-orders-${new Date().toISOString().slice(0, 10)}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }, [records, t])

  const renderCardView = () => (
    <div className='space-y-4'>
      {filteredRecords.map((record) => {
        const statusConfig = getStatusConfig(record.status)
        return (
          <div
            key={record.id}
            className='hover:bg-muted/50 rounded-lg border p-4 transition-colors'
          >
            <div className='flex items-start justify-between gap-2'>
              <div className='flex-1 space-y-1'>
                <div className='flex min-w-0 items-center gap-2'>
                  <code className='text-foreground truncate font-mono text-sm font-semibold'>
                    {record.trade_no}
                  </code>
                  <Button
                    variant='ghost'
                    size='sm'
                    className='h-6 w-6 p-0'
                    onClick={() => copyToClipboard(record.trade_no)}
                  >
                    {copiedText === record.trade_no ? (
                      <Check className='h-3.5 w-3.5' />
                    ) : (
                      <Copy className='h-3.5 w-3.5' />
                    )}
                  </Button>
                </div>
                <div className='text-muted-foreground text-xs'>
                  {formatTimestamp(record.create_time)}
                </div>
              </div>
              <StatusBadge
                label={statusConfig.label}
                variant={statusConfig.variant}
                showDot
                copyable={false}
              />
            </div>
            <div className='mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3'>
              <div className='space-y-1'>
                <Label className='text-muted-foreground text-xs'>
                  {t('Payment Method')}
                </Label>
                <div className='text-sm font-medium'>
                  {getPaymentMethodName(record.payment_method, t)}
                </div>
              </div>
              <div className='space-y-1'>
                <Label className='text-muted-foreground text-xs'>
                  {t('Amount')}
                </Label>
                <div className='text-sm font-semibold'>
                  {formatTopupAmount(record)}
                </div>
              </div>
              <div className='space-y-1'>
                <Label className='text-muted-foreground text-xs'>
                  {t('Payment')}
                </Label>
                <div className='text-sm font-semibold text-red-600'>
                  {formatPaymentAmount(record.money)}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )

  const renderTableView = () => (
    <div className='rounded-lg border'>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className='w-[200px]'>{t('Order Number')}</TableHead>
            <TableHead>{t('Time')}</TableHead>
            <TableHead>{t('Payment Method')}</TableHead>
            <TableHead className='text-right'>{t('Amount')}</TableHead>
            <TableHead className='text-right'>{t('Payment')}</TableHead>
            <TableHead className='text-center'>{t('Status')}</TableHead>
            <TableHead className='w-[60px]'>{t('Action')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filteredRecords.map((record) => {
            const statusConfig = getStatusConfig(record.status)
            return (
              <TableRow key={record.id}>
                <TableCell>
                  <code className='font-mono text-xs'>{record.trade_no}</code>
                </TableCell>
                <TableCell className='text-muted-foreground text-sm'>
                  {formatTimestamp(record.create_time)}
                </TableCell>
                <TableCell className='text-sm'>
                  {getPaymentMethodName(record.payment_method, t)}
                </TableCell>
                <TableCell className='text-right text-sm font-medium'>
                  {formatTopupAmount(record)}
                </TableCell>
                <TableCell className='text-right text-sm font-semibold text-red-600'>
                  {formatPaymentAmount(record.money)}
                </TableCell>
                <TableCell className='text-center'>
                  <StatusBadge
                    label={statusConfig.label}
                    variant={statusConfig.variant}
                    size='sm'
                    copyable={false}
                  />
                </TableCell>
                <TableCell>
                  <Button
                    variant='ghost'
                    size='sm'
                    className='h-7 w-7 p-0'
                    onClick={() => copyToClipboard(record.trade_no)}
                    title={t('Copy order number')}
                  >
                    {copiedText === record.trade_no ? (
                      <Check className='h-3.5 w-3.5' />
                    ) : (
                      <Copy className='h-3.5 w-3.5' />
                    )}
                  </Button>
                </TableCell>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )

  const renderContent = () => {
    if (loading) {
      return (
        <div className='space-y-4'>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className='rounded-lg border p-4'>
              <div className='flex items-start justify-between'>
                <div className='flex-1 space-y-2'>
                  <Skeleton className='h-5 w-48' />
                  <Skeleton className='h-4 w-32' />
                </div>
                <Skeleton className='h-6 w-20' />
              </div>
              <div className='mt-4 grid grid-cols-2 gap-4 sm:grid-cols-3'>
                <Skeleton className='h-4 w-full' />
                <Skeleton className='h-4 w-full' />
                <Skeleton className='h-4 w-full' />
              </div>
            </div>
          ))}
        </div>
      )
    }

    if (records.length === 0) {
      return (
        <div className='text-muted-foreground flex h-[400px] flex-col items-center justify-center text-center'>
          <p className='text-lg font-medium'>{t('No billing records found')}</p>
          <p className='mt-2 text-sm'>
            {keyword
              ? t('Try adjusting your search')
              : t('Your transaction history will appear here')}
          </p>
        </div>
      )
    }

    return viewMode === 'table' ? renderTableView() : renderCardView()
  }

  return (
    <div className='container mx-auto max-w-6xl space-y-6 p-4 sm:p-6'>
      {/* Header */}
      <div className='flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between'>
        <div>
          <h1 className='text-2xl font-bold'>{t('Topup Orders')}</h1>
          <p className='text-muted-foreground mt-1 text-sm'>
            {t('View your topup transaction records for reimbursement')}
          </p>
        </div>
        <div className='flex items-center gap-2'>
          <Button
            variant='outline'
            size='sm'
            onClick={() => refresh()}
            disabled={loading}
          >
            <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            {t('Refresh')}
          </Button>
          <Button
            variant='outline'
            size='sm'
            onClick={handleExportCSV}
            disabled={loading || records.length === 0}
          >
            <FileDown className='mr-2 h-4 w-4' />
            {t('Export CSV')}
          </Button>
        </div>
      </div>

      {/* Toolbar */}
      <div className='flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between'>
        <div className='flex items-center gap-2'>
          <div className='relative flex-1 sm:w-[300px]'>
            <Search className='text-muted-foreground absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2' />
            <Input
              placeholder={t('Search by order number...')}
              value={keyword}
              onChange={(e) => handleSearch(e.target.value)}
              className='h-9 pl-10'
            />
          </div>
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value)}
          >
            <SelectTrigger className='h-9 w-[130px]'>
              <SelectValue placeholder={t('All Status')} />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value='all'>{t('All Status')}</SelectItem>
                <SelectItem value='success'>{t('Success')}</SelectItem>
                <SelectItem value='pending'>{t('Pending')}</SelectItem>
                <SelectItem value='failed'>{t('Failed')}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
        <div className='flex items-center gap-2'>
          <Select
            value={pageSize.toString()}
            onValueChange={(value) =>
              value !== null && handlePageSizeChange(parseInt(value))
            }
          >
            <SelectTrigger className='h-9 w-[100px]'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value='10'>{t('10 / page')}</SelectItem>
                <SelectItem value='20'>{t('20 / page')}</SelectItem>
                <SelectItem value='50'>{t('50 / page')}</SelectItem>
                <SelectItem value='100'>{t('100 / page')}</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
          <div className='flex items-center rounded-lg border'>
            <Button
              variant={viewMode === 'table' ? 'secondary' : 'ghost'}
              size='sm'
              className='h-9 w-9 p-0'
              onClick={() => setViewMode('table')}
              title={t('Table view')}
            >
              <LayoutList className='h-4 w-4' />
            </Button>
            <Button
              variant={viewMode === 'card' ? 'secondary' : 'ghost'}
              size='sm'
              className='h-9 w-9 p-0'
              onClick={() => setViewMode('card')}
              title={t('Card view')}
            >
              <LayoutGrid className='h-4 w-4' />
            </Button>
          </div>
        </div>
      </div>

      {/* Content */}
      {renderContent()}

      {/* Pagination */}
      {!loading && records.length > 0 && (
        <div className='flex flex-col items-center gap-4 border-t pt-4 sm:flex-row sm:justify-between'>
          <div className='text-muted-foreground text-sm'>
            {t('Showing')} {(page - 1) * pageSize + 1}-
            {Math.min(page * pageSize, total)} {t('of')} {total}
          </div>
          <div className='flex items-center gap-2'>
            <Button
              variant='outline'
              size='sm'
              onClick={() => handlePageChange(page - 1)}
              disabled={page <= 1}
            >
              <ChevronLeft className='mr-1 h-4 w-4' />
              {t('Previous')}
            </Button>
            <div className='text-muted-foreground flex items-center gap-1 text-sm'>
              <span className='font-medium'>{page}</span>
              <span>/</span>
              <span>{totalPages}</span>
            </div>
            <Button
              variant='outline'
              size='sm'
              onClick={() => handlePageChange(page + 1)}
              disabled={page >= totalPages}
            >
              {t('Next')}
              <ChevronRight className='ml-1 h-4 w-4' />
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
