import { useEffect, useMemo, useRef, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, Film, LoaderCircle, Play, Sparkles, Square, Upload } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Input } from '@/components/ui/input'
import { ModelSelector, GroupSelector } from '@/components/model-group-selector'
import { getUserGroups, getUserModels, getVideoGenerationHistory, getVideoGenerationTask, sendVideoGeneration } from '@/features/playground/api'
import type { ModelOption, GroupOption, VideoGenerationHistoryItem, VideoGenerationRequest, VideoGenerationResponse } from '@/features/playground/types'
import './styles.css'

const VIDEO_RE = /video|sora|veo|kling|vidu|hailuo|minimax-h3|seedance|skyreels|pixverse|happyhorse|omni-flash|wan2\.[5-9]|wan3/i

function isVideoModel(value: string): boolean {
  const name = value.toLowerCase().trim()
  if (!name || /image|imagen|seedream|z-image|flux-2|flux-kontext/i.test(name)) {
    return false
  }
  return VIDEO_RE.test(name)
}

function responseTaskId(response: VideoGenerationResponse): string {
  if (response.task_id) return response.task_id
  if (response.id) return response.id
  const data = Array.isArray(response.data) ? response.data[0] : response.data
  if (data && typeof data === 'object') {
    const item = data as Record<string, unknown>
    return String(item.task_id || item.id || '')
  }
  return ''
}

function statusText(response: VideoGenerationResponse | null): string {
  const status = String(response?.status || '').toLowerCase()
  if (['completed', 'succeeded', 'success'].includes(status)) return 'completed'
  if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) return 'failed'
  if (['processing', 'in_progress', 'running'].includes(status)) return 'processing'
  return 'queued'
}

function historyStatus(item: VideoGenerationHistoryItem): string {
  const status = String(item.status || '').toLowerCase()
  if (['success', 'succeeded', 'completed'].includes(status)) return 'completed'
  if (['failure', 'failed', 'error', 'cancelled', 'canceled'].includes(status)) return 'failed'
  if (['processing', 'in_progress', 'running'].includes(status)) return 'processing'
  return 'queued'
}

function extractVideoURL(response: VideoGenerationResponse | null): string {
  if (!response) return ''
  const data = Array.isArray(response.data) ? response.data[0] : response.data
  if (data && typeof data === 'object') {
    const item = data as Record<string, unknown>
    if (typeof item.url === 'string') return item.url
    const result = item.result as Record<string, unknown> | undefined
    const videos = result?.videos
    if (Array.isArray(videos)) {
      const first = videos[0] as Record<string, unknown> | undefined
      if (typeof first?.url === 'string') return first.url
      if (Array.isArray(first?.url)) return String(first.url[0] || '')
    }
  }
  return ''
}

export function VideoWorkbench() {
  const { t } = useTranslation()
  const [models, setModels] = useState<ModelOption[]>([])
  const [groups, setGroups] = useState<GroupOption[]>([])
  const [model, setModel] = useState('')
  const [group, setGroup] = useState('')
  const [prompt, setPrompt] = useState('')
  const [duration, setDuration] = useState('5')
  const [resolution, setResolution] = useState('720p')
  const [aspectRatio, setAspectRatio] = useState('16:9')
  const [generateAudio, setGenerateAudio] = useState(false)
  const [referenceImage, setReferenceImage] = useState('')
  const [task, setTask] = useState<VideoGenerationResponse | null>(null)
  const [taskId, setTaskId] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const abortRef = useRef<AbortController | null>(null)

  const modelsQuery = useQuery({ queryKey: ['video-workbench-models'], queryFn: getUserModels })
  const groupsQuery = useQuery({ queryKey: ['video-workbench-groups'], queryFn: () => getUserGroups(false, true) })
  const { data: historyData = [], refetch: refetchHistory } = useQuery({
    queryKey: ['video-workbench-history'],
    queryFn: getVideoGenerationHistory,
    refetchInterval: 15_000,
  })
  const videoHistory = useMemo(
    () => historyData.filter((item) => isVideoModel(item.properties?.origin_model_name || item.properties?.upstream_model_name || '')),
    [historyData]
  )

  useEffect(() => {
    const available = (modelsQuery.data || []).filter((item) => isVideoModel(item.value))
    setModels(available)
    if (!available.some((item) => item.value === model)) setModel(available[0]?.value || '')
  }, [model, modelsQuery.data])

  useEffect(() => {
    // The API returns only groups with video capabilities. Keep this guard in
    // the client as well so stale capability caches cannot expose image groups.
    const available = (groupsQuery.data || []).filter((item) =>
      (item.models || []).some((value) => isVideoModel(value))
    )
    setGroups(available)
    if (!available.some((item) => item.value === group)) setGroup(available[0]?.value || '')
  }, [group, groupsQuery.data])

  const selectedGroup = useMemo(() => groups.find((item) => item.value === group), [group, groups])
  const visibleModels = useMemo(() => {
    const allowed = new Set(selectedGroup?.models || [])
    return models.filter((item) => allowed.size === 0 || allowed.has(item.value.toLowerCase()))
  }, [models, selectedGroup])

  useEffect(() => {
    if (!visibleModels.some((item) => item.value === model)) setModel(visibleModels[0]?.value || '')
  }, [model, visibleModels])

  const pollTask = async (id: string, signal: AbortSignal) => {
    const started = Date.now()
    while (Date.now() - started < 30 * 60 * 1000) {
      const next = await getVideoGenerationTask(id, signal)
      setTask(next)
      const state = statusText(next)
      if (state === 'completed' || state === 'failed') return next
      await new Promise((resolve) => window.setTimeout(resolve, 3000))
    }
    throw new Error(t('Video task timed out; check usage logs later'))
  }

  const handleGenerate = async () => {
    if (!model || !group || !prompt.trim()) return
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setIsGenerating(true)
    setTask(null)
    setTaskId('')
    try {
      const payload: VideoGenerationRequest = {
        model, group, prompt: prompt.trim(), duration: Number(duration) || 5,
        resolution, aspect_ratio: aspectRatio, generate_audio: generateAudio,
      }
      if (referenceImage) payload.image_urls = [referenceImage]
      const submitted = await sendVideoGeneration(payload, controller.signal)
      const id = responseTaskId(submitted)
      if (!id) throw new Error(submitted.error?.message || t('Upstream did not return a task ID'))
      setTaskId(id)
      const completed = await pollTask(id, controller.signal)
      if (statusText(completed) === 'failed') throw new Error(completed.error?.message || t('Video generation failed'))
      await refetchHistory()
    } catch (error) {
      if ((error as Error).name !== 'AbortError') toast.error((error as Error).message || t('Video generation failed'))
    } finally {
      setIsGenerating(false)
    }
  }

  const videoURL = extractVideoURL(task)

  return (
    <main className='video-workbench'>
      <header className='video-workbench__header'>
        <div className='video-workbench__title'><span className='video-workbench__icon'><Film /></span><div><h1>{t('Video Workbench')}</h1><p>{t('Create videos with asynchronous tasks and keep a 7-day archive')}</p></div></div>
        {taskId && <span className='video-workbench__task'>{t('Task {{id}}', { id: taskId })}</span>}
      </header>
      <div className='video-workbench__grid'>
        <section className='video-workbench__panel video-workbench__controls'>
          <div className='video-workbench__field'><Label>{t('Video group')}</Label><GroupSelector selectedGroup={group} groups={groups} onGroupChange={setGroup} className='w-full' /></div>
          <div className='video-workbench__field'><Label>{t('Model')}</Label><ModelSelector selectedModel={model} models={visibleModels} onModelChange={setModel} className='w-full' /></div>
          <div className='video-workbench__field'><Label htmlFor='video-prompt'>{t('Prompt')}</Label><Textarea id='video-prompt' value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={t('Describe the subject, action, camera and atmosphere')} rows={6} /></div>
          <div className='video-workbench__row'>
            <div className='video-workbench__field'><Label>{t('Duration')}</Label><Select value={duration} onValueChange={(value) => value && setDuration(value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['4', '5', '6', '8', '10'].map((value) => <SelectItem key={value} value={value}>{value} {t('seconds')}</SelectItem>)}</SelectContent></Select></div>
            <div className='video-workbench__field'><Label>{t('Resolution')}</Label><Select value={resolution} onValueChange={(value) => value && setResolution(value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['480p', '540p', '720p', '1080p', '4k'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
            <div className='video-workbench__field'><Label>{t('Aspect ratio')}</Label><Select value={aspectRatio} onValueChange={(value) => value && setAspectRatio(value)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{['16:9', '9:16', '1:1', '4:3', '3:4', '21:9'].map((value) => <SelectItem key={value} value={value}>{value}</SelectItem>)}</SelectContent></Select></div>
          </div>
          <div className='video-workbench__row video-workbench__row--bottom'><label className='video-workbench__switch'><input type='checkbox' checked={generateAudio} onChange={(event) => setGenerateAudio(event.target.checked)} /><span />{t('Generate audio')}</label><div className='video-workbench__reference'><Upload className='size-4' /><Input value={referenceImage} onChange={(event) => setReferenceImage(event.target.value)} placeholder={t('Reference image URL (optional)')} /></div></div>
          <div className='video-workbench__actions'>{isGenerating ? <Button variant='outline' onClick={() => abortRef.current?.abort()}><Square />{t('Stop task')}</Button> : <Button onClick={() => void handleGenerate()} disabled={!model || !group || !prompt.trim()}><Sparkles />{t('Generate video')}</Button>}</div>
        </section>
        <section className='video-workbench__panel video-workbench__preview'>
          <div className='video-workbench__preview-head'><h2>{t('Generation result')}</h2>{isGenerating && <LoaderCircle className='video-workbench__spinner' />}</div>
          {videoURL ? <div className='video-workbench__video'><video src={videoURL.startsWith('http') ? `/v1/videos/${encodeURIComponent(taskId)}/content` : videoURL} controls playsInline /><a href={videoURL} target='_blank' rel='noreferrer' download><Download />{t('Download video')}</a></div> : <div className='video-workbench__empty'><Play /><strong>{isGenerating ? t('Video is generating') : t('No generated video yet')}</strong><span>{isGenerating ? t('Current status: {{status}}', { status: statusText(task) }) : t('Enter a prompt to create a video')}</span></div>}
        </section>
      </div>
      <VideoHistoryArchive historyData={videoHistory} t={t} />
    </main>
  )
}

function VideoHistoryArchive({
  historyData,
  t,
}: {
  historyData: VideoGenerationHistoryItem[]
  t: (key: string, options?: Record<string, unknown>) => string
}) {
  return (
    <section className='video-workbench__panel video-workbench__history'>
      <div className='video-workbench__history-head'>
        <div><h2>{t('Video archive')}</h2><p>{t('Last 7 days')} · {t('{{count}} videos', { count: historyData.length })}</p></div>
        <span className='video-workbench__history-note'>{t('Persistent history')}</span>
      </div>
      {historyData.length === 0 ? (
        <div className='video-workbench__history-empty'><Film /><span>{t('No video history in the last 7 days')}</span></div>
      ) : (
        <div className='video-workbench__history-scroll'>
          {historyData.map((item) => {
            const status = historyStatus(item)
            const contentURL = `/v1/videos/${encodeURIComponent(item.task_id)}/content`
            return (
              <article key={item.task_id} className='video-workbench__history-card'>
                <div className='video-workbench__history-media'>
                  {status === 'completed' ? <video src={contentURL} controls preload='none' playsInline /> : <div className='video-workbench__history-placeholder'><Film /><span>{t('Video status {{status}}', { status: statusLabel(status, t) })}</span></div>}
                </div>
                <div className='video-workbench__history-meta'><strong>{item.properties?.origin_model_name || t('Generated video')}</strong><span>{item.task_id}</span></div>
                {status === 'completed' && <a href={contentURL} target='_blank' rel='noreferrer' download><Download />{t('Download')}</a>}
              </article>
            )
          })}
        </div>
      )}
    </section>
  )
}

function statusLabel(status: string, t: (key: string, options?: Record<string, unknown>) => string): string {
  const labels: Record<string, string> = {
    completed: t('Completed'),
    failed: t('Failed'),
    processing: t('Processing'),
    queued: t('Queued'),
  }
  return labels[status] || status
}
