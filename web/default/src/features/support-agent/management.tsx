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
import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  getKnowledgeDocument,
  getKnowledge,
  replyHandoff,
  resolveHandoff,
  saveKnowledge,
  setDesktopPause,
} from './api'
import { useHandoffQueue } from './queue'

export function AgentManagement(props: { tab: 'handoffs' | 'knowledge' }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const queue = useHandoffQueue(props.tab === 'handoffs')
  const pendingCount =
    queue.data?.items.filter((item) => item.status === 'pending').length ?? 0
  const knowledge = useQuery({
    queryKey: ['support-knowledge'],
    queryFn: getKnowledge,
    enabled: props.tab === 'knowledge',
  })
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [source, setSource] = useState('')
  const [audience, setAudience] = useState('internal')
  const [editingId, setEditingId] = useState('')
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({})
  const [emailRetries, setEmailRetries] = useState<
    Record<string, { replyId: string; message: string }>
  >({})
  const replyIds = useRef(new Map<string, string>())
  const resolve = useMutation({
    mutationFn: resolveHandoff,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support-handoffs'] }),
  })
  const reply = useMutation({
    mutationFn: (value: { id: string; replyId: string; message: string }) =>
      replyHandoff(value.id, value.replyId, value.message),
    onSuccess: (result, value) => {
      replyIds.current.delete(value.id)
      setReplyDrafts((drafts) => ({ ...drafts, [value.id]: '' }))
      void qc.invalidateQueries({ queryKey: ['support-handoffs'] })
      void qc.invalidateQueries({ queryKey: ['support-knowledge'] })
      if (result.email_status === 'failed') {
        setEmailRetries((items) => ({
          ...items,
          [value.id]: { replyId: value.replyId, message: value.message },
        }))
        toast.warning(
          t(
            'Reply saved, but the email could not be sent. Retry it from this ticket.'
          )
        )
      } else {
        setEmailRetries((items) => {
          const next = { ...items }
          delete next[value.id]
          return next
        })
        if (result.email_sent) toast.success(t('Reply saved and email sent.'))
        else if (result.email_status === 'no_email')
          toast.warning(
            t('Reply saved, but this account has no email address.')
          )
        else if (result.email_status === 'queued')
          toast.success(t('Reply saved. Email is in the delivery queue.'))
        else if (result.email_status === 'not_applicable')
          toast.success(
            t(
              'Handling notes saved; an internal knowledge draft is ready for review.'
            )
          )
        else toast.success(t('Reply saved.'))
      }
    },
    onError: () => {
      toast.error(
        t('Could not save reply. Your draft is still here; please retry.')
      )
    },
  })
  const pause = useMutation({
    mutationFn: setDesktopPause,
    onSuccess: () => qc.invalidateQueries({ queryKey: ['support-handoffs'] }),
  })
  const save = useMutation({
    mutationFn: () =>
      saveKnowledge({
        id: editingId || crypto.randomUUID(),
        title,
        content,
        audience,
        source,
      }),
    onSuccess: () => {
      const published = audience === 'customer'
      toast.success(
        t(published ? 'Knowledge published' : 'Knowledge draft saved')
      )
      setEditingId('')
      setTitle('')
      setContent('')
      setSource('')
      void qc.invalidateQueries({ queryKey: ['support-knowledge'] })
    },
  })
  const editKnowledge = async (id: string) => {
    try {
      const doc = await getKnowledgeDocument(id)
      setEditingId(doc.id)
      setTitle(doc.title)
      setContent(doc.content)
      setSource(doc.source)
      setAudience(doc.audience)
    } catch {
      toast.error(t('Unable to open this knowledge draft.'))
    }
  }
  const submitReply = (id: string, message: string) => {
    if (!message.trim()) return
    let replyId = replyIds.current.get(id)
    if (!replyId) {
      replyId = crypto.randomUUID()
      replyIds.current.set(id, replyId)
    }
    reply.mutate({ id, replyId, message: message.trim() })
  }
  return (
    <div className='min-h-0 flex-1 space-y-4 overflow-y-auto p-4'>
      {props.tab === 'handoffs' ? (
        <>
          <div className='agent-queue-summary' role='status'>
            <strong>{t('Human queue')}</strong>
            <span>
              {t('{{count}} pending questions', { count: pendingCount })}
            </span>
          </div>
          <p className='text-muted-foreground text-xs leading-6'>
            {t(
              'Review unresolved questions from the website and WeChat. Mark resolved after handling them.'
            )}
          </p>
          {queue.data?.workflow && (
            <section className='border-border space-y-3 rounded-lg border p-3 text-xs'>
              <div className='flex items-center justify-between gap-2'>
                <strong>{t('Desktop tasks')}</strong>
                <Button
                  size='sm'
                  variant='outline'
                  disabled={pause.isPending}
                  onClick={() => pause.mutate(!queue.data!.workflow.paused)}
                >
                  {queue.data.workflow.paused
                    ? t('Resume observation')
                    : t('Pause desktop')}
                </Button>
              </div>
              <p className='text-muted-foreground'>
                {t('Pending review')}:{' '}
                {queue.data.workflow.counts.human_takeover || 0} ·{' '}
                {t('Verified sent')}: {queue.data.workflow.counts.sent || 0}
              </p>
              <details>
                <summary className='cursor-pointer'>
                  {t('Recent tasks')}
                </summary>
                <ul className='mt-2 space-y-2'>
                  {queue.data.workflow.jobs.slice(0, 20).map((job) => (
                    <li key={job.id}>
                      <span>
                        {job.contact} · {t('support.job.' + job.status)}
                      </span>
                      <p className='text-muted-foreground'>
                        {new Date(job.created * 1000).toLocaleString()} ·{' '}
                        {job.error}
                      </p>
                      <code className='text-[10px]'>{job.id}</code>
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          )}
          {queue.isError && <p role='alert'>{t('Unable to load queue')}</p>}
          {queue.data?.items.length === 0 && (
            <p className='py-8 text-center text-sm'>
              {t('No pending questions')}
            </p>
          )}
          {queue.data?.items.map((item) => {
            const siteUserId = item.principal.match(/^web:(\d+)$/)?.[1]
            const siteTicket = Boolean(siteUserId)
            const requesterName =
              item.requester?.username ||
              (siteUserId
                ? t('Site user {{id}}', { id: siteUserId })
                : t('SightFlow / WeChat'))
            const replyText = replyDrafts[item.id] || ''
            const emailRetry = emailRetries[item.id]
            return (
              <article
                key={item.id}
                className='agent-ticket border-border space-y-3 rounded-lg border p-4 text-sm'
                data-status={item.status}
              >
                <div className='flex flex-wrap items-start justify-between gap-2'>
                  <div className='min-w-0'>
                    <strong className='block break-words'>
                      {requesterName}
                    </strong>
                    {siteTicket ? (
                      <div className='text-muted-foreground mt-1 flex flex-wrap gap-x-2 text-xs'>
                        <span>
                          {t('User ID')}: {item.requester?.id ?? siteUserId}
                        </span>
                        {item.requester?.email && (
                          <span>{item.requester.email}</span>
                        )}
                      </div>
                    ) : (
                      <span className='text-muted-foreground mt-1 block text-xs'>
                        {item.principal}
                      </span>
                    )}
                  </div>
                  <time className='text-muted-foreground text-xs'>
                    {new Date(item.created * 1000).toLocaleString()}
                  </time>
                </div>
                <p className='leading-6 font-medium break-words whitespace-pre-wrap'>
                  {item.question}
                </p>
                <p className='text-muted-foreground text-xs leading-6 break-words'>
                  {item.reason}
                </p>
                {item.status === 'pending' ? (
                  <form
                    className='space-y-2 border-t pt-3'
                    onSubmit={(event) => {
                      event.preventDefault()
                      submitReply(item.id, replyText)
                    }}
                  >
                    <label className='grid gap-1 text-xs font-medium'>
                      {siteTicket
                        ? t('Reply to the user')
                        : t('Handling notes')}
                      <textarea
                        rows={3}
                        maxLength={4000}
                        value={replyText}
                        onChange={(event) =>
                          setReplyDrafts((drafts) => ({
                            ...drafts,
                            [item.id]: event.target.value,
                          }))
                        }
                        placeholder={
                          siteTicket
                            ? t('Write a clear, personal reply.')
                            : t(
                                'Reply in the WeChat conversation first, then record what solved it.'
                              )
                        }
                        className='border-input bg-background min-h-20 w-full resize-y rounded-md border px-3 py-2 text-sm leading-6 outline-none focus-visible:ring-2'
                      />
                    </label>
                    <p className='text-muted-foreground text-xs leading-5'>
                      {siteTicket
                        ? t(
                            'The reply will appear in the original assistant conversation, and a service email will be queued for delivery.'
                          )
                        : t(
                            'For WeChat tickets, send the customer response in SightFlow first. Saving here creates an internal knowledge draft.'
                          )}
                    </p>
                    <div className='flex items-center justify-between gap-3'>
                      {reply.isError && reply.variables?.id === item.id ? (
                        <span className='text-destructive text-xs'>
                          {t('Unable to save reply. Check it and retry.')}
                        </span>
                      ) : (
                        <span />
                      )}
                      <Button
                        type='submit'
                        size='sm'
                        disabled={!replyText.trim() || reply.isPending}
                        aria-busy={
                          reply.isPending && reply.variables?.id === item.id
                        }
                      >
                        {reply.isPending && reply.variables?.id === item.id
                          ? t('Saving…')
                          : siteTicket
                            ? t('Reply and email')
                            : t('Save handling notes')}
                      </Button>
                    </div>
                  </form>
                ) : item.status === 'replied' ? (
                  <div className='space-y-2 border-t pt-3'>
                    {item.reply && (
                      <p className='bg-muted/50 rounded-md px-3 py-2 text-sm leading-6 whitespace-pre-wrap'>
                        {item.reply}
                      </p>
                    )}
                    <div className='flex flex-wrap items-center justify-between gap-3'>
                      <span className='text-xs text-emerald-700 dark:text-emerald-400'>
                        {t('Replied · knowledge draft created')}
                      </span>
                      <div className='flex items-center gap-2'>
                        {emailRetry && (
                          <Button
                            size='sm'
                            variant='outline'
                            disabled={reply.isPending}
                            onClick={() =>
                              reply.mutate({
                                id: item.id,
                                replyId: emailRetry.replyId,
                                message: emailRetry.message,
                              })
                            }
                          >
                            {t('Retry email')}
                          </Button>
                        )}
                        <Button
                          variant='outline'
                          size='sm'
                          disabled={resolve.isPending}
                          onClick={() => resolve.mutate(item.id)}
                        >
                          {t('Close ticket')}
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <span className='text-muted-foreground text-xs'>
                    {t('Resolved')}
                  </span>
                )}
              </article>
            )
          })}
        </>
      ) : (
        <>
          <p className='text-muted-foreground text-xs'>
            {t(
              'Only reviewed customer documents are used in public answers. Internal documents stay private.'
            )}
          </p>
          {editingId && (
            <div className='flex items-center justify-between gap-3 rounded-md border px-3 py-2 text-xs'>
              <span className='min-w-0 truncate'>
                {t('Editing')}: {title}
              </span>
              <Button
                size='sm'
                variant='ghost'
                onClick={() => {
                  setEditingId('')
                  setTitle('')
                  setContent('')
                  setSource('')
                  setAudience('internal')
                }}
              >
                {t('New draft')}
              </Button>
            </div>
          )}
          {editingId.startsWith('handoff-') && audience === 'internal' && (
            <p className='rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs leading-5 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200'>
              {t(
                'This ticket draft stays private until you review and publish it. Remove any remaining personal or account-specific details first.'
              )}
            </p>
          )}
          <form
            className='space-y-3'
            onSubmit={(e) => {
              e.preventDefault()
              save.mutate()
            }}
          >
            <label className='grid gap-1 text-xs'>
              {t('Document title')}
              <input
                required
                maxLength={200}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className='border-input bg-background rounded border p-2 text-sm'
              />
            </label>
            <label className='grid gap-1 text-xs'>
              {t('Visibility')}
              <select
                className='border-input bg-background rounded border p-2 text-sm'
                value={audience}
                onChange={(e) => setAudience(e.target.value)}
              >
                <option value='internal'>{t('Internal draft')}</option>
                <option value='customer'>
                  {t('Reviewed customer knowledge')}
                </option>
              </select>
            </label>
            <label className='grid gap-1 text-xs'>
              {t('Document content')}
              <textarea
                required
                rows={6}
                maxLength={100000}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className='border-input bg-background rounded border p-2 text-sm'
              />
            </label>
            <Button size='sm' disabled={save.isPending}>
              {save.isPending
                ? t('Indexing…')
                : audience === 'customer'
                  ? t('Publish reviewed knowledge')
                  : editingId
                    ? t('Save draft')
                    : t('Add knowledge')}
            </Button>
            {save.isError && (
              <p className='text-destructive text-xs'>
                {t('Unable to index document. Remove secrets and retry.')}
              </p>
            )}
          </form>
          {knowledge.data?.items.map((doc) => (
            <article
              key={doc.id}
              className='border-border rounded-lg border p-3 text-sm'
            >
              <strong>{doc.title}</strong>
              <p className='text-muted-foreground mt-1 text-xs'>
                {doc.audience === 'customer'
                  ? t('Reviewed customer knowledge')
                  : t('Internal draft')}{' '}
                · {new Date(doc.updated * 1000).toLocaleDateString()}
              </p>
              <div className='mt-2 flex items-center justify-between gap-2'>
                {doc.id.startsWith('handoff-') &&
                doc.audience === 'internal' ? (
                  <span className='text-xs text-amber-700 dark:text-amber-400'>
                    {t('Ticket knowledge draft')}
                  </span>
                ) : (
                  <span />
                )}
                <Button
                  size='sm'
                  variant='outline'
                  onClick={() => void editKnowledge(doc.id)}
                >
                  <Pencil className='size-3.5' />
                  {t('Review and edit')}
                </Button>
              </div>
            </article>
          ))}
        </>
      )}
    </div>
  )
}
