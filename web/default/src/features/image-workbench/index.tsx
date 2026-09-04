/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as published by
the Free Software Foundation, either version 3 of the License, or
(at your option) any later version.

This program is distributed in the hope that it will be useful,
but WITHOUT ANY WARRANTY; without even the implied warranty of
MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the
GNU Affero General Public License for more details.

You should have received a copy of the GNU Affero General Public License
along with this program. If not, see <https://www.gnu.org/licenses/>.
*/
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
} from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  CalendarDays,
  Check,
  ChevronDown,
  Download,
  Filter,
  Grid2X2,
  History,
  ImageIcon,
  ImagePlus,
  Images,
  List,
  LoaderCircle,
  Maximize2,
  Minus,
  MoreHorizontal,
  Plus,
  RefreshCcw,
  RotateCcw,
  Search,
  SlidersHorizontal,
  Sparkles,
  Square,
  Star,
  UploadCloud,
  WandSparkles,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { ModelSelector, GroupSelector } from '@/components/model-group-selector'
import { NotificationPopover } from '@/components/notification-popover'
import { ProfileDropdown } from '@/components/profile-dropdown'
import { SidebarTrigger } from '@/components/ui/sidebar'
import { LogoFull } from '@/components/layout/components/logo-mark'
import { useNotifications } from '@/hooks/use-notifications'
import { useSystemConfig } from '@/hooks/use-system-config'
import { useTheme } from '@/context/theme-provider'
import {
  getImageGenerationTask,
  getImageGenerationHistory,
  getUserGroups,
  getUserModels,
  sendImageGeneration,
} from '@/features/playground/api'
import type {
  GroupOption,
  ImageGenerationData,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ImageGenerationHistoryItem,
  ModelOption,
} from '@/features/playground/types'
import {
  APIMART_IMAGE_MODELS,
  getEstimatedImagePriceCNY,
  getImageModelConfig,
} from './model-config'
import './styles.css'

interface ReferenceImage {
  id: string
  name: string
  data: string
}

interface GeneratedImage {
  id: string
  url: string
  taskId?: string
}

const SIZE_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: '1:1', label: '1:1' },
  { value: '3:2', label: '3:2' },
  { value: '2:3', label: '2:3' },
  { value: '4:3', label: '4:3' },
  { value: '3:4', label: '3:4' },
  { value: '5:4', label: '5:4' },
  { value: '4:5', label: '4:5' },
  { value: '16:9', label: '16:9' },
  { value: '9:16', label: '9:16' },
  { value: '2:1', label: '2:1' },
  { value: '1:2', label: '1:2' },
  { value: '3:1', label: '3:1' },
  { value: '1:3', label: '1:3' },
  { value: '21:9', label: '21:9' },
  { value: '9:21', label: '9:21' },
  { value: 'custom', label: 'Custom pixels' },
]

const QUALITY_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
]

function getImageItems(
  response: ImageGenerationResponse
): ImageGenerationData[] {
  if (Array.isArray(response.data)) return response.data
  return response.data ? [response.data] : []
}

function getTaskId(response: ImageGenerationResponse): string {
  return (
    getImageItems(response).find((item) => item.task_id || item.id)?.task_id ||
    getImageItems(response).find((item) => item.id)?.id ||
    response.task_id ||
    response.id ||
    ''
  )
}

function getImageURL(item: ImageGenerationData): string {
  if (item.url) return item.url
  if (item.b64_json) return `data:image/png;base64,${item.b64_json}`
  return ''
}

function fileToDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function ImageWorkbench() {
  const { t } = useTranslation()
  const { logo } = useSystemConfig()
  const { resolvedTheme, setTheme } = useTheme()
  const notifications = useNotifications()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const resultStageRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)
  const [models, setModels] = useState<ModelOption[]>([])
  const [groups, setGroups] = useState<GroupOption[]>([])
  const [model, setModel] = useState('gpt-image-2')
  const [group, setGroup] = useState('default')
  const [prompt, setPrompt] = useState('')
  const [size, setSize] = useState('1:1')
  const [customSize, setCustomSize] = useState('')
  const [quality, setQuality] = useState('auto')
  const [resolution, setResolution] = useState('1k')
  const [referenceURL, setReferenceURL] = useState('')
  const [count, setCount] = useState(1)
  const [watermark, setWatermark] = useState(false)
  const [outputFormat, setOutputFormat] = useState('jpeg')
  const [seed, setSeed] = useState('')
  const [negativePrompt, setNegativePrompt] = useState('')
  const [promptExtend, setPromptExtend] = useState(false)
  const [promptUpsampling, setPromptUpsampling] = useState(false)
  const [googleSearch, setGoogleSearch] = useState(false)
  const [thinkingMode, setThinkingMode] = useState(true)
  const [sequential, setSequential] = useState(false)
  const [extraJSON, setExtraJSON] = useState('')
  const [references, setReferences] = useState<ReferenceImage[]>([])
  const [results, setResults] = useState<GeneratedImage[]>([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [advancedOpen, setAdvancedOpen] = useState(false)
  const [archiveQuery, setArchiveQuery] = useState('')
  const [archiveTab, setArchiveTab] = useState<'all' | 'favorite' | 'week'>(
    'all'
  )
  const [archiveView, setArchiveView] = useState<'grid' | 'list'>('grid')
  const [favoriteTaskIds, setFavoriteTaskIds] = useState<Set<string>>(
    () => new Set()
  )
  const [selectedTaskId, setSelectedTaskId] = useState('')
  const [isReferenceDragActive, setIsReferenceDragActive] = useState(false)

  const { data: modelsData } = useQuery({
    queryKey: ['image-workbench-models'],
    queryFn: getUserModels,
  })
  const { data: groupsData } = useQuery({
    queryKey: ['image-workbench-groups'],
    queryFn: () => getUserGroups(true),
  })
  const { data: historyData = [], refetch: refetchHistory } = useQuery({
    queryKey: ['image-workbench-history'],
    queryFn: getImageGenerationHistory,
    refetchInterval: 15_000,
  })
  const selectedGroup = groups.find((item) => item.value === group)
  const modelConfig = getImageModelConfig(model)
  const maxReferences = modelConfig?.maxReferences ?? 16
  const maxImages = modelConfig?.maxImages ?? 10

  useEffect(() => {
    if (!modelsData) return
    const allowedModels = new Set(selectedGroup?.models || [])
    const imageModels = modelsData.filter((item) => {
      const value = item.value.toLowerCase().trim()
      const isImageModel =
        APIMART_IMAGE_MODELS.has(value) ||
        /image|dall-e|imagen|flux|seedream|stable|midjourney|sd[-_]|kling/i.test(
          `${item.value} ${item.label}`
        )
      return (
        (allowedModels.size === 0 || allowedModels.has(value)) && isImageModel
      )
    })
    // Keep the workbench scoped to models that expose an image-generation
    // capability; text-only models would otherwise produce a confusing
    // upstream validation error from the image endpoint.
    const nextModels = imageModels
    setModels(nextModels)
    if (!nextModels.some((item) => item.value === model)) {
      setModel(
        nextModels.find((item) =>
          /gpt-image|dall-e|imagen|image/i.test(item.value)
        )?.value ||
          nextModels[0]?.value ||
          ''
      )
    }
  }, [model, modelsData, selectedGroup?.models])

  useEffect(() => {
    if (!groupsData) return
    setGroups(groupsData)
    if (!groupsData.some((item) => item.value === group)) {
      setGroup(
        groupsData.find((item) => item.supportsCustomImageParameters)?.value ||
          groupsData.find((item) => item.value === 'default')?.value ||
          groupsData[0]?.value ||
          ''
      )
    }
  }, [group, groupsData])

  useEffect(() => {
    const config = getImageModelConfig(model)
    if (!config) return
    setResolution(config.defaultResolution || '')
    setQuality(config.defaultQuality || 'auto')
    setCount((current) => Math.min(current, config.maxImages))
    setReferences((current) => current.slice(0, config.maxReferences))
  }, [model])

  useEffect(() => {
    if (selectedTaskId || historyData.length === 0) return
    const firstSuccessful = historyData.find((item) =>
      ['SUCCESS', 'success', 'completed', 'COMPLETED'].includes(item.status)
    )
    if (firstSuccessful) setSelectedTaskId(firstSuccessful.task_id)
  }, [historyData, selectedTaskId])

  const waitForTask = async (
    taskId: string,
    signal: AbortSignal
  ): Promise<ImageGenerationResponse> => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 900_000) {
      if (signal.aborted)
        throw new DOMException('Generation stopped', 'AbortError')
      const response = await getImageGenerationTask(taskId, signal)
      const status = String(response.status || '').toLowerCase()
      if (getImageItems(response).some((item) => item.url || item.b64_json)) {
        return response
      }
      if (['succeeded', 'completed', 'success'].includes(status))
        return response
      if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
        throw new Error(
          response.error?.message ||
            response.message ||
            t('Image generation failed')
        )
      }
      await new Promise((resolve) => window.setTimeout(resolve, 3000))
    }
    throw new Error(t('Image generation timed out'))
  }

  const appendReferenceFiles = async (files: File[]) => {
    if (files.length === 0) return
    if (references.length + files.length > maxReferences) {
      toast.error(
        t('You can add up to {{count}} reference images', {
          count: maxReferences,
        })
      )
      return
    }

    const next: ReferenceImage[] = []
    for (const file of files) {
      if (!file.type.startsWith('image/')) {
        toast.error(t('Only image files are supported'))
        continue
      }
      if (file.size > 20 * 1024 * 1024) {
        toast.error(t('Reference image is too large'))
        continue
      }
      try {
        next.push({
          id: `${file.name}-${file.lastModified}-${Math.random()}`,
          name: file.name,
          data: await fileToDataURL(file),
        })
      } catch {
        toast.error(t('Failed to read reference image'))
      }
    }
    setReferences((current) => [...current, ...next])
  }

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    await appendReferenceFiles(files)
  }

  const handleReferenceDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault()
    setIsReferenceDragActive(false)
    if (isGenerating || references.length >= maxReferences) return
    void appendReferenceFiles(Array.from(event.dataTransfer.files || []))
  }

  const handleReferenceURL = () => {
    const value = referenceURL.trim()
    if (!value) return
    if (references.length >= maxReferences) {
      toast.error(
        t('You can add up to {{count}} reference images', {
          count: maxReferences,
        })
      )
      return
    }
    if (!value.startsWith('data:image/')) {
      try {
        const parsed = new URL(value)
        if (!['http:', 'https:'].includes(parsed.protocol)) throw new Error()
      } catch {
        toast.error(t('Reference URL is invalid'))
        return
      }
    }
    setReferences((current) => [
      ...current,
      {
        id: `${value}-${Math.random()}`,
        name: value.startsWith('data:') ? t('Base64 reference') : value,
        data: value,
      },
    ])
    setReferenceURL('')
  }

  const addHistoryAsReference = async (item: ImageGenerationHistoryItem) => {
    if (maxReferences < 1 || references.length >= maxReferences) {
      toast.error(t('This model does not accept more reference images'))
      return
    }
    const url = `/v1/images/generations/${encodeURIComponent(item.task_id)}/content`
    try {
      const response = await fetch(url, { credentials: 'include' })
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      const blob = await response.blob()
      if (blob.size > 20 * 1024 * 1024) {
        throw new Error(t('Reference image is too large'))
      }
      const data = await fileToDataURL(blob)
      setReferences((current) => [
        ...current,
        {
          id: `history-${item.task_id}`,
          name: item.properties?.origin_model_name || item.task_id,
          data,
        },
      ])
      toast.success(t('Added to reference images'))
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('Failed to load history image')
      )
    }
  }

  const reuseHistorySettings = (item: ImageGenerationHistoryItem) => {
    const properties = item.properties
    if (!properties) return
    if (properties.origin_model_name) setModel(properties.origin_model_name)
    if (properties.input) setPrompt(properties.input)
    if (properties.image_size) {
      if (
        SIZE_OPTIONS.some((option) => option.value === properties.image_size)
      ) {
        setSize(properties.image_size)
      } else {
        setSize('custom')
        setCustomSize(properties.image_size)
      }
    }
    if (properties.image_resolution) setResolution(properties.image_resolution)
    if (properties.image_quality) setQuality(properties.image_quality)
    if (properties.image_count) setCount(properties.image_count)
    setWatermark(properties.image_watermark === true)
    toast.success(t('Prompt and settings restored'))
  }

  const isAPIMartModel = APIMART_IMAGE_MODELS.has(model.toLowerCase().trim())
  const supportsModelResolution = Boolean(modelConfig?.resolutions?.length)
  const allowsCustomParameters =
    !isAPIMartModel || selectedGroup?.supportsCustomImageParameters === true
  const resolutionOptions = (modelConfig?.resolutions || []).map((option) => {
    const price = getEstimatedImagePriceCNY(
      model,
      option.value,
      quality,
      promptExtend
    )
    return {
      ...option,
      label:
        price !== null
          ? t('{{resolution}} (Price {{price}}/image)', {
              resolution: option.label,
              price: `¥${price.toFixed(4)}`,
            })
          : option.label,
    }
  })
  const estimatedPrice = getEstimatedImagePriceCNY(
    model,
    resolution,
    quality,
    promptExtend
  )

  const handleGenerate = async () => {
    if (!prompt.trim()) {
      toast.error(t('Prompt is required'))
      return
    }
    if (!model) {
      toast.error(t('Model is required'))
      return
    }

    let extra: Record<string, unknown> = {}
    if (allowsCustomParameters && extraJSON.trim()) {
      try {
        const parsed = JSON.parse(extraJSON)
        if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') {
          throw new Error('object required')
        }
        extra = parsed as Record<string, unknown>
      } catch {
        toast.error(t('Advanced parameters must be valid JSON'))
        return
      }
    }

    const resolvedSize = size === 'custom' ? customSize.trim() : size
    if (
      allowsCustomParameters &&
      size === 'custom' &&
      !/^\d{2,5}x\d{2,5}$/i.test(resolvedSize)
    ) {
      toast.error(t('Custom size must use WIDTHxHEIGHT format'))
      return
    }
    const imageURLs = references.map((reference) => reference.data)
    const sizeField = modelConfig?.sizeField || 'size'
    const structuredParameters: Record<string, unknown> = {}
    if (allowsCustomParameters && resolvedSize) {
      structuredParameters[sizeField] = resolvedSize
    }
    if (modelConfig?.supportsOutputFormat)
      structuredParameters.output_format = outputFormat
    if (modelConfig?.supportsSeed && seed.trim()) {
      const parsedSeed = Number(seed)
      if (!Number.isSafeInteger(parsedSeed) || parsedSeed < 0) {
        toast.error(t('Seed must be a non-negative integer'))
        return
      }
      structuredParameters.seed = parsedSeed
    }
    if (modelConfig?.supportsNegativePrompt && negativePrompt.trim()) {
      structuredParameters.negative_prompt = negativePrompt.trim()
    }
    if (modelConfig?.supportsPromptExtend)
      structuredParameters.prompt_extend = promptExtend
    if (modelConfig?.supportsPromptUpsampling)
      structuredParameters.prompt_upsampling = promptUpsampling
    if (modelConfig?.supportsGoogleSearch)
      structuredParameters.google_search = googleSearch
    if (modelConfig?.supportsThinkingMode)
      structuredParameters.thinking_mode = thinkingMode
    if (modelConfig?.supportsSequential)
      structuredParameters.enable_sequential = sequential
    if (modelConfig?.supportsWatermark)
      structuredParameters.watermark = watermark
    const payload: ImageGenerationRequest = {
      ...(allowsCustomParameters ? extra : {}),
      ...(allowsCustomParameters ? structuredParameters : {}),
      model,
      group,
      prompt: prompt.trim(),
      ...(allowsCustomParameters
        ? { n: Math.max(1, Math.min(maxImages, count)) }
        : {}),
      ...(isAPIMartModel
        ? {
            ...(supportsModelResolution ? { resolution } : {}),
            ...(modelConfig?.qualities && imageURLs.length === 0
              ? { quality }
              : {}),
            ...(imageURLs.length > 0 ? { image_urls: imageURLs } : {}),
          }
        : {
            ...(!isAPIMartModel && allowsCustomParameters
              ? { quality, watermark }
              : {}),
            ...(imageURLs.length > 0 ? { images: imageURLs } : {}),
          }),
    }

    const controller = new AbortController()
    abortRef.current = controller
    setIsGenerating(true)
    setResults([])
    try {
      let response = await sendImageGeneration(payload, controller.signal)
      const taskId = getTaskId(response)
      if (
        !getImageItems(response).some((item) => item.url || item.b64_json) &&
        taskId
      ) {
        response = await waitForTask(taskId, controller.signal)
      }
      const imageResults = getImageItems(response)
        .map((item, index) => ({
          id: `${taskId || response.id || 'image'}-${index}`,
          url: getImageURL(item),
          taskId,
        }))
        .filter((item) => item.url)

      if (imageResults.length === 0) {
        throw new Error(
          response.message || t('Image generation returned no image')
        )
      }

      setResults(
        imageResults.map((item) => ({
          ...item,
          url:
            item.taskId && !item.url.startsWith('data:')
              ? `/v1/images/generations/${encodeURIComponent(item.taskId)}/content`
              : item.url,
        }))
      )
      await refetchHistory()
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return
      toast.error(
        error instanceof Error ? error.message : t('Image generation failed')
      )
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setIsGenerating(false)
    }
  }

  const stopGeneration = () => {
    abortRef.current?.abort()
  }

  return (
    <div className='iw-root'>
      <header className='iw-topbar'>
        <SidebarTrigger
          variant='ghost'
          className='iw-sidebar-trigger'
          title={t('Show or hide sidebar')}
          aria-label={t('Show or hide sidebar')}
        />
        <a href='/dashboard/overview' className='iw-brand' aria-label='SynthAPI'>
          <span className='iw-brand-mark iw-brand-wordmark'>
            <LogoFull src={logo} alt='SynthAPI' className='size-full' />
          </span>
          <strong>{t('Image Workbench')}</strong>
        </a>

        <label className='iw-global-search'>
          <Search aria-hidden='true' />
          <input
            value={archiveQuery}
            onChange={(event) => setArchiveQuery(event.target.value)}
            placeholder={t('Search prompts, models or history images')}
            aria-label={t('Search prompts, models or history images')}
          />
          <kbd>⌘ K</kbd>
        </label>

        <div className='iw-topbar-actions'>
          <NotificationPopover
            open={notifications.popoverOpen}
            onOpenChange={notifications.setPopoverOpen}
            unreadCount={notifications.unreadCount}
            activeTab={notifications.activeTab}
            onTabChange={notifications.setActiveTab}
            notice={notifications.notice}
            announcements={notifications.announcements}
            popupAnnouncements={notifications.unreadAnnouncements}
            announcementDialogOpen={notifications.announcementDialogOpen}
            onAnnouncementDialogOpenChange={
              notifications.setAnnouncementDialogOpen
            }
            desktopNotificationsSupported={
              notifications.desktopNotificationsSupported
            }
            desktopNotificationPermission={
              notifications.desktopNotificationPermission
            }
            onRequestDesktopNotifications={
              notifications.requestDesktopNotifications
            }
            loading={notifications.loading}
            className='iw-notification-button'
          />
          <span className='iw-topbar-divider' />
          <ProfileDropdown />
          <div className='iw-theme-toggle' aria-label={t('Toggle theme')}>
            <button
              type='button'
              className={cn(resolvedTheme === 'light' && 'is-active')}
              onClick={() => setTheme('light')}
              aria-label={t('Light')}
            >
              <Sparkles />
            </button>
            <button
              type='button'
              className={cn(resolvedTheme === 'dark' && 'is-active')}
              onClick={() => setTheme('dark')}
              aria-label={t('Dark')}
            >
              <span className='iw-moon-glyph' />
            </button>
          </div>
        </div>
      </header>

      <main className='iw-shell'>
        <section className='iw-panel iw-settings-panel'>
          <div className='iw-panel-heading'>
            <h1>
              <span>{t('Image settings')}</span>
            </h1>
            <button
              type='button'
              className='iw-icon-button'
              title={t('Reset parameters')}
              onClick={() => {
                setPrompt('')
                setSize('1:1')
                setCount(1)
                setReferences([])
              }}
            >
              <RefreshCcw />
            </button>
          </div>

          <div className='iw-settings-scroll'>
            <div className='iw-field iw-order-model'>
              <Label>{t('Model restriction')}</Label>
              <ModelSelector
                selectedModel={model}
                models={models}
                onModelChange={setModel}
                disabled={isGenerating || models.length === 0}
                className='iw-selector-trigger'
              />
              {modelsData && models.length === 0 && (
                <p className='iw-field-note'>{t('No image models available')}</p>
              )}
            </div>

            <div className='iw-field iw-order-group'>
              <Label>{t('Group restriction')}</Label>
              <GroupSelector
                selectedGroup={group}
                groups={groups}
                onGroupChange={setGroup}
                disabled={isGenerating || groups.length === 0}
                showRatio={false}
                className='iw-selector-trigger'
              />
            </div>

            {modelConfig && (
              <div className='iw-estimate-card iw-order-estimate'>
                <div>
                  <p>{t(modelConfig.summary)}</p>
                  <span>{t('Actual price is settled after the task is completed.')}</span>
                </div>
                {estimatedPrice !== null && (
                  <div className='iw-estimate-price'>
                    <span>{t('Estimated')}</span>
                    <strong>¥{estimatedPrice.toFixed(4)}</strong>
                    <small>/{t('image')}</small>
                  </div>
                )}
              </div>
            )}

            <div className='iw-field iw-order-prompt'>
              <div className='iw-field-label-row'>
                <Label htmlFor='image-prompt'>{t('Prompt')}</Label>
              </div>
              <div className='iw-prompt-box'>
                <Textarea
                  id='image-prompt'
                  value={prompt}
                  maxLength={3000}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder={t('Describe the image you want to create')}
                  disabled={isGenerating}
                />
                <button
                  type='button'
                  onClick={() =>
                    setPrompt(
                      t('A cinematic landscape with clear details and natural light')
                    )
                  }
                >
                  <span><Sparkles />{t('Inspire me')}</span>
                  <WandSparkles />
                </button>
              </div>
              <span className='iw-prompt-count'>{prompt.length}/3000</span>
            </div>

            {maxReferences > 0 && (
              <div className='iw-field iw-order-reference'>
                <div className='iw-field-label-row'>
                  <Label>{t('Reference images')} <span>({t('Optional')})</span></Label>
                  <span>{references.length}/{maxReferences}</span>
                </div>
                <input
                  ref={fileInputRef}
                  type='file'
                  accept='image/*'
                  multiple
                  className='hidden'
                  onChange={handleFiles}
                />
                <div
                  className={cn('iw-reference-drop', isReferenceDragActive && 'is-dragging')}
                  onDragEnter={(event) => {
                    event.preventDefault()
                    setIsReferenceDragActive(true)
                  }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={() => setIsReferenceDragActive(false)}
                  onDrop={handleReferenceDrop}
                  onClick={() => fileInputRef.current?.click()}
                  role='button'
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      fileInputRef.current?.click()
                    }
                  }}
                >
                  <span className='iw-upload-icon'><UploadCloud /></span>
                  <strong>{t('Click or drag to upload images')}</strong>
                  <small>{t('Supports JPG / PNG, up to {{count}} images', { count: maxReferences })}</small>
                  <button
                    type='button'
                    className='iw-history-reference-button iw-dark-only'
                    onClick={(event) => {
                      event.stopPropagation()
                      document.querySelector('.iw-archive-panel')?.scrollIntoView({ behavior: 'smooth' })
                    }}
                  >
                    <Images />{t('Choose from history')}
                  </button>
                </div>
                {references.length > 0 && (
                  <div className='iw-reference-list'>
                    {references.map((reference) => (
                      <div key={reference.id} className='iw-reference-thumb'>
                        <img src={reference.data} alt={reference.name} />
                        <button
                          type='button'
                          title={t('Remove reference image')}
                          onClick={() =>
                            setReferences((current) =>
                              current.filter((item) => item.id !== reference.id)
                            )
                          }
                        >
                          <X />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            <div className='iw-ratio-count iw-order-ratio'>
              <div className='iw-field'>
                <Label>{t('Aspect ratio')}</Label>
                <div className='iw-ratio-options'>
                  {['1:1', '3:2', '16:9', '4:3', '9:16'].map((ratio) => (
                    <button
                      type='button'
                      key={ratio}
                      className={cn(size === ratio && 'is-active')}
                      onClick={() => setSize(ratio)}
                      disabled={isGenerating || !allowsCustomParameters}
                    >
                      <RatioGlyph ratio={ratio} />
                      {ratio}
                    </button>
                  ))}
                </div>
              </div>
              <div className='iw-field iw-count-field'>
                <Label>{t('Number of images')}</Label>
                <div className='iw-count-stepper'>
                  <button
                    type='button'
                    onClick={() => setCount((current) => Math.max(1, current - 1))}
                    disabled={isGenerating || !allowsCustomParameters || count <= 1}
                  ><Minus /></button>
                  <span>{count}</span>
                  <button
                    type='button'
                    onClick={() => setCount((current) => Math.min(maxImages, current + 1))}
                    disabled={isGenerating || !allowsCustomParameters || count >= maxImages}
                  ><Plus /></button>
                </div>
              </div>
            </div>

            <div className='iw-field iw-dark-count iw-dark-only'>
              <Label>{t('Number of images')}</Label>
              <div className='iw-dark-count-options'>
                {[1, 2, 4].map((option) => (
                  <button
                    type='button'
                    key={option}
                    className={cn(count === option && 'is-active')}
                    onClick={() => setCount(Math.min(maxImages, option))}
                    disabled={isGenerating || !allowsCustomParameters || option > maxImages}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>

            <div className='iw-advanced'>
              <button
                type='button'
                className='iw-advanced-trigger'
                onClick={() => setAdvancedOpen((open) => !open)}
                aria-expanded={advancedOpen}
              >
                <span><SlidersHorizontal />{t('Advanced parameters')} <small>({t('Optional')})</small></span>
                <ChevronDown className={cn(advancedOpen && 'is-open')} />
              </button>
              {advancedOpen && (
                <div className='iw-advanced-content'>
                  <div className='iw-field iw-advanced-span'>
                    <Label>{t('Reference image URL')}</Label>
                    <div className='iw-reference-url'>
                      <Input
                        value={referenceURL}
                        onChange={(event) => setReferenceURL(event.target.value)}
                        placeholder={t('Paste a public image URL')}
                        disabled={isGenerating || references.length >= maxReferences}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter') handleReferenceURL()
                        }}
                      />
                      <Button
                        type='button'
                        variant='outline'
                        size='icon'
                        onClick={handleReferenceURL}
                        disabled={isGenerating || references.length >= maxReferences}
                        title={t('Add URL')}
                      >
                        <Plus />
                      </Button>
                    </div>
                  </div>
                  <ParameterSelect
                    label={t('Size')}
                    value={size}
                    options={SIZE_OPTIONS.map((option) =>
                      option.value === 'custom'
                        ? { ...option, label: t('Custom pixels') }
                        : option
                    )}
                    onChange={setSize}
                    disabled={isGenerating || !allowsCustomParameters}
                  />
                  {size === 'custom' && (
                    <div className='iw-field'>
                      <Label htmlFor='custom-size'>{t('Custom pixel size')}</Label>
                      <Input
                        id='custom-size'
                        value={customSize}
                        onChange={(event) => setCustomSize(event.target.value)}
                        placeholder='1881x836'
                        disabled={isGenerating || !allowsCustomParameters}
                      />
                    </div>
                  )}
                  {supportsModelResolution && (
                    <ParameterSelect
                      label={t('Resolution')}
                      value={resolution}
                      options={resolutionOptions}
                      onChange={setResolution}
                      disabled={isGenerating || !allowsCustomParameters}
                    />
                  )}
                  {(!isAPIMartModel || modelConfig?.qualities) && (
                    <ParameterSelect
                      label={t('Quality')}
                      value={quality}
                      options={(modelConfig?.qualities || QUALITY_OPTIONS).map((option) => ({
                        ...option,
                        label: t(option.label),
                      }))}
                      onChange={setQuality}
                      disabled={isGenerating || !allowsCustomParameters}
                    />
                  )}
                  {modelConfig?.supportsOutputFormat && (
                    <ParameterSelect
                      label={t('Output format')}
                      value={outputFormat}
                      options={[
                        { value: 'jpeg', label: 'JPEG' },
                        { value: 'png', label: 'PNG' },
                        { value: 'webp', label: 'WEBP' },
                      ]}
                      onChange={setOutputFormat}
                      disabled={isGenerating || !allowsCustomParameters}
                    />
                  )}
                  {modelConfig?.supportsSeed && (
                    <div className='iw-field'>
                      <Label htmlFor='image-seed'>{t('Seed')}</Label>
                      <Input
                        id='image-seed'
                        type='number'
                        min={0}
                        value={seed}
                        onChange={(event) => setSeed(event.target.value)}
                        placeholder={t('Random')}
                        disabled={isGenerating || !allowsCustomParameters}
                      />
                    </div>
                  )}
                  {modelConfig?.supportsNegativePrompt && (
                    <div className='iw-field iw-advanced-span'>
                      <Label htmlFor='negative-prompt'>{t('Negative prompt')}</Label>
                      <Textarea
                        id='negative-prompt'
                        value={negativePrompt}
                        onChange={(event) => setNegativePrompt(event.target.value)}
                        disabled={isGenerating || !allowsCustomParameters}
                      />
                    </div>
                  )}
                  <div className='iw-switch-grid iw-advanced-span'>
                    {(!isAPIMartModel || modelConfig?.supportsWatermark) && (
                      <ParameterSwitch
                        label={t('Watermark')}
                        checked={watermark}
                        onChange={setWatermark}
                        disabled={isGenerating || !allowsCustomParameters}
                      />
                    )}
                    {modelConfig?.supportsPromptExtend && (
                      <ParameterSwitch label={t('Prompt enhancement')} checked={promptExtend} onChange={setPromptExtend} disabled={isGenerating || !allowsCustomParameters} />
                    )}
                    {modelConfig?.supportsPromptUpsampling && (
                      <ParameterSwitch label={t('Prompt upsampling')} checked={promptUpsampling} onChange={setPromptUpsampling} disabled={isGenerating || !allowsCustomParameters} />
                    )}
                    {modelConfig?.supportsGoogleSearch && (
                      <ParameterSwitch label={t('Google Search enhancement')} checked={googleSearch} onChange={setGoogleSearch} disabled={isGenerating || !allowsCustomParameters} />
                    )}
                    {modelConfig?.supportsThinkingMode && (
                      <ParameterSwitch label={t('Thinking mode')} checked={thinkingMode} onChange={setThinkingMode} disabled={isGenerating || !allowsCustomParameters} />
                    )}
                    {modelConfig?.supportsSequential && (
                      <ParameterSwitch label={t('Sequential generation')} checked={sequential} onChange={setSequential} disabled={isGenerating || !allowsCustomParameters} />
                    )}
                  </div>
                  <div className='iw-field iw-advanced-span'>
                    <Label htmlFor='image-extra'>{t('Advanced JSON parameters')}</Label>
                    <Textarea
                      id='image-extra'
                      value={extraJSON}
                      onChange={(event) => setExtraJSON(event.target.value)}
                      placeholder='{"provider_parameter":"value"}'
                      className='font-mono'
                      disabled={isGenerating || !allowsCustomParameters}
                    />
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className='iw-generate-bar'>
            {isGenerating ? (
              <Button type='button' variant='outline' onClick={stopGeneration}>
                <Square />{t('Stop generation')}
              </Button>
            ) : (
              <Button type='button' onClick={handleGenerate} disabled={!model || !prompt.trim()}>
                <Sparkles />{t('Generate images')}<kbd>⌘ ↵</kbd>
              </Button>
            )}
          </div>
        </section>

        <section className='iw-panel iw-result-panel'>
          <div className='iw-panel-heading'>
            <h2>{t('Generated images')}</h2>
            <div className='iw-panel-tools'>
              {isGenerating && <LoaderCircle className='iw-spinner' />}
              <button type='button' className='iw-icon-button' title={t('Grid view')}>
                <Grid2X2 />
              </button>
              <button
                type='button'
                className='iw-icon-button'
                title={t('Fullscreen')}
                onClick={() => void resultStageRef.current?.requestFullscreen?.()}
              >
                <Maximize2 />
              </button>
            </div>
          </div>
          <div ref={resultStageRef} className='iw-result-stage'>
            {results.length === 0 ? (
              <div className='iw-result-empty'>
                <div className='iw-empty-art'>
                  <ImageIcon />
                  <Sparkles />
                </div>
                <strong>{isGenerating ? t('Generating your image') : t('No images yet')}</strong>
                <p>{t('Set parameters on the left and click Generate images')}<br />{t('Your creations will appear here')}</p>
              </div>
            ) : (
              <div className={cn('iw-results-grid', results.length === 1 && 'is-single')}>
                {results.map((result) => (
                  <figure key={result.id} className='iw-result-card'>
                    <img
                      src={result.url}
                      alt={t('Generated image')}
                      className={cn(result.url.startsWith('data:') && 'select-none')}
                    />
                    <a
                      href={result.url.includes('?') ? `${result.url}&download=1` : `${result.url}?download=1`}
                      download
                      title={t('Download')}
                    ><Download /></a>
                  </figure>
                ))}
              </div>
            )}
          </div>
        </section>

        <ImageHistoryArchive
          historyData={historyData}
          query={archiveQuery}
          onQueryChange={setArchiveQuery}
          tab={archiveTab}
          onTabChange={setArchiveTab}
          view={archiveView}
          onViewChange={setArchiveView}
          favorites={favoriteTaskIds}
          onToggleFavorite={(taskId) =>
            setFavoriteTaskIds((current) => {
              const next = new Set(current)
              if (next.has(taskId)) next.delete(taskId)
              else next.add(taskId)
              return next
            })
          }
          selectedTaskId={selectedTaskId}
          onSelect={setSelectedTaskId}
          maxReferences={maxReferences}
          referenceCount={references.length}
          onReuse={reuseHistorySettings}
          onReference={(item) => void addHistoryAsReference(item)}
        />
      </main>
    </div>
  )
}

function RatioGlyph({ ratio }: { ratio: string }) {
  const [width, height] = ratio.split(':').map(Number)
  const scale = Math.max(width, height)
  return (
    <span
      className='iw-ratio-glyph'
      style={{
        width: `${Math.max(9, Math.round((width / scale) * 16))}px`,
        height: `${Math.max(9, Math.round((height / scale) * 16))}px`,
      }}
      aria-hidden='true'
    />
  )
}

function ImageHistoryArchive({
  historyData,
  query,
  onQueryChange,
  tab,
  onTabChange,
  view,
  onViewChange,
  favorites,
  onToggleFavorite,
  selectedTaskId,
  onSelect,
  maxReferences,
  referenceCount,
  onReuse,
  onReference,
}: {
  historyData: ImageGenerationHistoryItem[]
  query: string
  onQueryChange: (value: string) => void
  tab: 'all' | 'favorite' | 'week'
  onTabChange: (value: 'all' | 'favorite' | 'week') => void
  view: 'grid' | 'list'
  onViewChange: (value: 'grid' | 'list') => void
  favorites: Set<string>
  onToggleFavorite: (taskId: string) => void
  selectedTaskId: string
  onSelect: (taskId: string) => void
  maxReferences: number
  referenceCount: number
  onReuse: (item: ImageGenerationHistoryItem) => void
  onReference: (item: ImageGenerationHistoryItem) => void
}) {
  const { t } = useTranslation()
  const [openTaskMenu, setOpenTaskMenu] = useState('')
  const history = useMemo(() => {
    const now = Date.now() / 1000
    const normalized = historyData.filter((item) =>
      ['SUCCESS', 'success', 'completed', 'COMPLETED'].includes(item.status)
    )
    return normalized.filter((item) => {
      const prompt = item.properties?.input || ''
      const model = item.properties?.origin_model_name || ''
      const matchesQuery = !query.trim() ||
        `${prompt} ${model} ${item.task_id}`.toLowerCase().includes(query.trim().toLowerCase())
      const matchesTab =
        tab === 'all' ||
        (tab === 'favorite' && favorites.has(item.task_id)) ||
        (tab === 'week' && now - (item.finish_time || item.submit_time || now) <= 7 * 86400)
      return matchesQuery && matchesTab
    })
  }, [favorites, historyData, query, tab])

  return (
    <aside className='iw-panel iw-archive-panel'>
      <div className='iw-archive-heading'>
        <div>
          <h2>{t('Image archive')}</h2>
          <p>{t('Recent generations')} · {historyData.length} {t('images')}</p>
        </div>
        <div className='iw-view-toggle'>
          <button type='button' className={cn(view === 'grid' && 'is-active')} onClick={() => onViewChange('grid')} title={t('Grid view')}><Grid2X2 /></button>
          <button type='button' className={cn(view === 'list' && 'is-active')} onClick={() => onViewChange('list')} title={t('List view')}><List /></button>
        </div>
      </div>
      <div className='iw-archive-toolbar'>
        <div className='iw-archive-tabs'>
          <button type='button' className={cn(tab === 'all' && 'is-active')} onClick={() => onTabChange('all')}>{t('All')}</button>
          <button type='button' className={cn(tab === 'favorite' && 'is-active')} onClick={() => onTabChange('favorite')}><Star />{t('Favorites')}</button>
          <button type='button' className={cn(tab === 'week' && 'is-active')} onClick={() => onTabChange('week')}><CalendarDays />{t('This week')}</button>
        </div>
        <div className='iw-archive-actions'>
          <label className='iw-archive-search'><Search /><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder={t('Search image archive')} /></label>
          <button type='button' className='iw-icon-button' title={t('Filter')}><Filter /></button>
        </div>
      </div>

      <div className={cn('iw-archive-scroll', view === 'list' && 'is-list')}>
        {history.length === 0 ? (
          <div className='iw-archive-empty'>
            <History className='size-6' />
            <span>{t('No image history in the last 7 days')}</span>
          </div>
        ) : (
          history.map((item) => (
            <article key={item.task_id} className={cn('iw-archive-card', selectedTaskId === item.task_id && 'is-selected')} onClick={() => onSelect(item.task_id)}>
              <a
                href={`/v1/images/generations/${encodeURIComponent(item.task_id)}/content`}
                target='_blank'
                rel='noreferrer'
                className='iw-archive-image-wrap'
                onClick={(event) => event.stopPropagation()}
              >
                <img
                  src={`/v1/images/generations/${encodeURIComponent(item.task_id)}/content`}
                  alt={
                    item.properties?.origin_model_name || t('Generated image')
                  }
                  loading='lazy'
                />
                {selectedTaskId === item.task_id && <span className='iw-selected-badge'><Check />{t('Selected')}</span>}
                <div className='iw-archive-meta'>
                  <div className='iw-archive-summary'>
                    <strong>{item.properties?.input || item.properties?.origin_model_name || t('Generated image')}</strong>
                    <span>· {formatRelativeTime(item.finish_time || item.submit_time, t)}</span>
                  </div>
                  <span className='iw-archive-ratio'>{formatArchiveRatio(item.properties?.image_size)}</span>
                </div>
              </a>
              <div className='iw-archive-card-actions'>
                <button type='button' title={t('Favorite')} className={cn(favorites.has(item.task_id) && 'is-favorite')} onClick={(event) => { event.stopPropagation(); onToggleFavorite(item.task_id) }}><Star /></button>
                <button
                  type='button'
                  title={t('More')}
                  onClick={(event) => {
                    event.stopPropagation()
                    setOpenTaskMenu((current) => current === item.task_id ? '' : item.task_id)
                  }}
                ><MoreHorizontal /></button>
                {openTaskMenu === item.task_id && (
                  <div className='iw-archive-menu' onClick={(event) => event.stopPropagation()}>
                    <button type='button' onClick={() => { onReuse(item); setOpenTaskMenu('') }}><RotateCcw />{t('Reuse')}</button>
                    <button type='button' disabled={maxReferences < 1 || referenceCount >= maxReferences} onClick={() => { onReference(item); setOpenTaskMenu('') }}><ImagePlus />{t('Reference')}</button>
                  </div>
                )}
              </div>
            </article>
          ))
        )}
      </div>
      <div className='iw-archive-footer'>{t('Last 7 days')} <span>·</span> {t('Clear selected')}</div>
    </aside>
  )
}

function formatRelativeTime(timestamp: number | undefined, t: (key: string, options?: Record<string, unknown>) => string): string {
  if (!timestamp) return '----'
  const minutes = Math.max(0, Math.floor((Date.now() / 1000 - timestamp) / 60))
  if (minutes < 1) return t('Just now')
  if (minutes < 60) return t('{{count}} minutes ago', { count: minutes })
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return t('{{count}} hours ago', { count: hours })
  return t('{{count}} days ago', { count: Math.floor(hours / 24) })
}

function formatArchiveRatio(size: string | undefined): string {
  if (!size) return '1:1'
  if (/^\d+:\d+$/.test(size)) return size
  const match = size.match(/^(\d+)[xX×](\d+)$/)
  if (!match) return size
  const width = Number(match[1])
  const height = Number(match[2])
  if (!width || !height) return size
  const divisor = (a: number, b: number): number =>
    b === 0 ? a : divisor(b, a % b)
  const common = divisor(width, height)
  return `${width / common}:${height / common}`
}

function ParameterSelect({
  label,
  value,
  options,
  onChange,
  disabled,
}: {
  label: string
  value: string
  options: { value: string; label: string }[]
  onChange: (value: string) => void
  disabled: boolean
}) {
  return (
    <div className='space-y-1.5'>
      <Label>{label}</Label>
      <Select
        value={value}
        onValueChange={(nextValue) => nextValue && onChange(nextValue)}
        items={options}
        disabled={disabled}
      >
        <SelectTrigger className='w-full'>
          <SelectValue />
        </SelectTrigger>
        <SelectContent alignItemWithTrigger={false}>
          <SelectGroup>
            {options.map((option) => (
              <SelectItem key={option.value} value={option.value}>
                {option.label}
              </SelectItem>
            ))}
          </SelectGroup>
        </SelectContent>
      </Select>
    </div>
  )
}

function ParameterSwitch(props: {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  disabled: boolean
}) {
  return (
    <div className='flex items-center justify-between rounded-md border px-3 py-2'>
      <Label>{props.label}</Label>
      <Switch
        checked={props.checked}
        onCheckedChange={props.onChange}
        disabled={props.disabled}
      />
    </div>
  )
}
