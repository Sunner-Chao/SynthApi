import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { RefreshCw, ChevronLeft, ChevronRight } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { api } from '@/lib/api'

type Row = Record<string, string | number | null>
type Snapshot = {
  checked_at: string
  bucket: string
  node: string
  r2_error: string | null
  r2_truncated?: boolean
  r2_bytes: number | null
  objects: Row[]
  batches: Row[]
  records: Row[]
  stats: Record<string, number | string>
  services: Record<string, string>
  tokens: Record<string, number>
  token_scope: string
  acceptance: string
  errors: string[]
}
function bytes(value: number) {
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB']
  let i = 0
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024
    i++
  }
  return `${value.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${units[i]}`
}
function tokens(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '-'
  if (value >= 1e9) return `${(value / 1e9).toFixed(3)}B tokens`
  if (value >= 1e6) return `${(value / 1e6).toFixed(3)}M tokens`
  return `${value.toLocaleString()} tokens`
}
export function R2Monitor() {
  const { t } = useTranslation()
  const [view, setView] = useState<'objects' | 'batches' | 'records'>('objects')
  const [filter, setFilter] = useState('')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<Row | null>(null)
  const query = useQuery({
    queryKey: ['r2-monitor'],
    queryFn: async () => {
      const response = await api.get('/api/admin/r2-monitor')
      if (!response.data.success) throw new Error(response.data.message)
      return response.data.data as Snapshot
    },
    refetchInterval: 30000,
  })
  const data = query.data
  const rows = (data?.[view] || []).filter((row) =>
    JSON.stringify(row).toLowerCase().includes(filter.toLowerCase())
  )
  const fields =
    view === 'objects'
      ? ['key', 'size', 'modified', 'etag']
      : view === 'batches'
        ? [
            'batch_id',
            'state',
            'archive_size',
            'files',
            'retry_count',
            'failed_count',
            'updated_at',
          ]
        : ['session_id', 'model', 'total_tokens', 'size', 'status', 'end_time']
  const stale =
    data && query.dataUpdatedAt - Date.parse(data.checked_at) > 300000
  return (
    <main className='min-w-0 max-w-full space-y-5 overflow-x-hidden p-4 md:p-6'>
      <header className='flex items-center justify-between gap-4'>
        <h1 className='text-2xl font-semibold'>{t('R2 数据监控')}</h1>
        <button
          title={t('刷新')}
          aria-label={t('刷新')}
          disabled={query.isFetching}
          onClick={() => void query.refetch()}
          className='rounded border p-2'
        >
          <RefreshCw size={18} />
        </button>
      </header>
      {query.isPending && <p>{t('加载中...')}</p>}
      {query.isError && (
        <p role='alert' className='text-red-600'>
          {t('监控数据读取失败')}：{query.error.message}
        </p>
      )}
      {data && (
        <>
          <p className='text-muted-foreground text-sm break-all'>
            {data.bucket} · {data.node} ·{' '}
            {new Date(data.checked_at).toLocaleString()}
          </p>
          {stale && (
            <p role='alert' className='text-red-600'>
              {t('快照已过期')}
            </p>
          )}
      {data.r2_error && (
            <p role='alert' className='text-red-600'>
              {data.r2_error}
            </p>
          )}
          <div className='grid grid-cols-2 gap-4 border-y py-4 lg:grid-cols-4'>
            {[
              [t('R2 对象'), data.r2_error ? '-' : data.objects.length],
              [
                t('存储大小'),
                data.r2_bytes === null ? '-' : bytes(data.r2_bytes),
              ],
              [t('本地观测 Token'), tokens(data.tokens?.total_tokens)],
              [t('上传批次'), data.batches.length],
            ].map(([label, value]) => (
              <div key={label}>
                <div className='text-muted-foreground text-sm'>{label}</div>
                <strong className='text-xl break-words'>{value}</strong>
              </div>
            ))}
          </div>
          <p className='text-sm'>
              {data.token_scope || t('暂无 Token 统计')} {t('输入')} {tokens(data.tokens?.prompt_tokens)} ·{' '}
              {t('输出')} {tokens(data.tokens?.completion_tokens)}
          </p>
          <div className='flex flex-wrap gap-4 text-sm'>
            {Object.entries(data.services).map(([name, value]) => (
              <span key={name} className='break-all'>
                {name}: {value}
              </span>
            ))}
          </div>
          <details>
            <summary className='cursor-pointer'>
              {t('记录器队列与错误')}
            </summary>
            <pre className='overflow-auto text-xs'>
              {JSON.stringify(
                { stats: data.stats, errors: data.errors },
                null,
                2
              )}
            </pre>
          </details>
          <p className='text-sm text-amber-700'>{data.acceptance}</p>
          <div className='flex flex-wrap items-center gap-3'>
            <select
              aria-label={t('数据类型')}
              className='bg-background rounded border p-2'
              value={view}
              onChange={(event) => {
                setView(event.target.value as typeof view)
                setPage(0)
                setSelected(null)
              }}
            >
              <option value='objects'>{t('R2 对象')}</option>
              <option value='batches'>{t('上传批次')}</option>
              <option value='records'>{t('会话记录')}</option>
            </select>
            <input
              aria-label={t('搜索')}
              placeholder={t('搜索')}
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value)
                setPage(0)
              }}
              className='bg-background min-w-0 rounded border p-2'
            />
          </div>
          <div className='overflow-x-auto'>
            <table className='w-full min-w-[900px] text-left text-sm'>
              <thead>
                <tr>
                  {fields.map((field) => (
                    <th className='border-b p-2' key={field}>
                      {field}
                    </th>
                  ))}
                  <th className='border-b p-2'>{t('详情')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(page * 25, page * 25 + 25).map((row, index) => (
                  <tr key={index}>
                    {fields.map((field) => (
                      <td
                        key={field}
                        className='max-w-80 border-b p-2 break-all'
                        title={String(row[field] ?? '')}
                      >
                        {(field === 'size' || field === 'archive_size') &&
                        typeof row[field] === 'number'
                          ? bytes(row[field])
                          : String(row[field] ?? '-')}
                      </td>
                    ))}
                    <td className='border-b p-2'>
                      <button
                        className='underline'
                        onClick={() => setSelected(row)}
                      >
                        {t('查看')}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {rows.length === 0 && <p className='p-4'>{t('暂无数据')}</p>}
          </div>
          <div className='flex items-center gap-4'>
            <button
              title={t('上一页')}
              disabled={!page}
              onClick={() => setPage(page - 1)}
            >
              <ChevronLeft />
            </button>
            <span>
              {page + 1} / {Math.max(1, Math.ceil(rows.length / 25))} ·{' '}
              {rows.length}
            </span>
            <button
              title={t('下一页')}
              disabled={(page + 1) * 25 >= rows.length}
              onClick={() => setPage(page + 1)}
            >
              <ChevronRight />
            </button>
          </div>
          {selected && (
            <section className='border-t pt-4'>
              <div className='flex justify-between'>
                <h2>{t('详情')}</h2>
                <button onClick={() => setSelected(null)}>{t('关闭')}</button>
              </div>
              <pre className='max-h-96 overflow-auto text-xs break-all whitespace-pre-wrap'>
                {JSON.stringify(selected, null, 2)}
              </pre>
            </section>
          )}
        </>
      )}
      {data?.r2_truncated && !data.r2_error && (
        <p className='text-amber-700'>{t('R2 列表显示首批 1000 个对象；桶内总量可能更多')}</p>
      )}
    </main>
  )
}
