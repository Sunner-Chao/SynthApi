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
import { useEffect, useState } from 'react'
import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { cancelAgentRun, getAgentRun, getHistory, startAgentRun } from './api'
import type { AgentRun } from './types'

const active = (run?: AgentRun) =>
  run?.status === 'queued' || run?.status === 'running'
export function useAgentThread(
  userId: number,
  conversation: string,
  page: string
) {
  const qc = useQueryClient()
  const [submitted, setSubmitted] = useState<AgentRun | null>(null)
  const historyKey = ['support-history', userId, conversation]
  const history = useInfiniteQuery({
    queryKey: historyKey,
    initialPageParam: '',
    queryFn: ({ pageParam }) => getHistory(conversation, pageParam),
    getNextPageParam: (last) => last.next_before || undefined,
    staleTime: 0,
    refetchOnWindowFocus: true,
  })
  const savedRun = history.data?.pages[0]?.runs?.find(active)
  const currentSubmitted =
    submitted?.conversation === conversation ? submitted : null
  const runId = currentSubmitted?.id || savedRun?.id
  const runQuery = useQuery({
    queryKey: ['support-run', userId, runId],
    queryFn: () => getAgentRun(runId!),
    enabled: !!runId,
    retry: false,
    refetchInterval: (query) =>
      query.state.status !== 'error' &&
      (active(query.state.data) || !query.state.data)
        ? 1200
        : false,
  })
  const run = runQuery.data || currentSubmitted || savedRun
  const submit = useMutation({
    mutationFn: startAgentRun,
    onError: () => {
      void qc.invalidateQueries({ queryKey: historyKey })
    },
    retry: 1, // A retry reuses the UUID; the server never starts a duplicate task.
    onSuccess: (data) => {
      setSubmitted(data)
      qc.setQueryData(['support-run', userId, data.id], data)
      void qc.invalidateQueries({ queryKey: ['support-conversations', userId] })
    },
  })
  const cancel = useMutation({
    mutationFn: cancelAgentRun,
    onSuccess: async (data) => {
      await qc.cancelQueries({ queryKey: ['support-run', userId, data.id] })
      setSubmitted(data)
      qc.setQueryData(['support-run', userId, data.id], data)
    },
  })
  const runConversation = run?.conversation
  const runStatus = run?.status
  const runID = run?.id
  useEffect(() => {
    if (
      !runID ||
      !runConversation ||
      runStatus === 'running' ||
      runStatus === 'queued'
    )
      return
    void qc.invalidateQueries({
      queryKey: ['support-history', userId, runConversation],
    })
    void qc.invalidateQueries({ queryKey: ['support-conversations', userId] })
  }, [runID, runStatus, runConversation, qc, userId])
  const turns = [...(history.data?.pages || [])]
    .reverse()
    .flatMap((part) => part.turns)
  const failed = run && ['failed', 'interrupted'].includes(run.status)
  return {
    history,
    turns,
    run,
    previousRuns: (history.data?.pages[0]?.runs || []).filter(
      (item) => !active(item) && item.id !== run?.id
    ),
    isPending: submit.isPending || active(run),
    isError: submit.isError || !!failed,
    lastQuestion: run?.question || submit.variables?.question || '',
    send: (question: string) => {
      if (submit.isPending || active(run)) return
      submit.mutate({ id: crypto.randomUUID(), question, conversation, page })
    },
    cancel: () => {
      if (runId) cancel.mutate(runId)
    },
    cancelling: cancel.isPending,
    pollingError: runQuery.isError,
    refetch: () => {
      void history.refetch()
      void runQuery.refetch()
    },
  }
}
