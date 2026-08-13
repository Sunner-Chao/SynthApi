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
import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Download,
  ImagePlus,
  LoaderCircle,
  Paperclip,
  Square,
  WandSparkles,
  X,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { SectionPageLayout } from '@/components/layout'
import { ModelSelector, GroupSelector } from '@/components/model-group-selector'
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
import { cn } from '@/lib/utils'
import {
  getImageGenerationTask,
  getUserGroups,
  getUserModels,
  sendImageGeneration,
} from '@/features/playground/api'
import type {
  GroupOption,
  ImageGenerationData,
  ImageGenerationRequest,
  ImageGenerationResponse,
  ModelOption,
} from '@/features/playground/types'

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

const RESOLUTION_OPTIONS = [
  { value: '1k', label: '1K' },
  { value: '2k', label: '2K' },
  { value: '4k', label: '4K' },
]

function getResolutionPrice(
  description: string | undefined,
  resolution: string
): string {
  if (!description) return ''
  const match = description.match(
    new RegExp(`(?:^|\\s)${resolution}\\s*[:：]\\s*([^\\s,，;；]+)`, 'i')
  )
  return match?.[1] || ''
}

function getImageItems(response: ImageGenerationResponse): ImageGenerationData[] {
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

function fileToDataURL(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function ImageWorkbench() {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)
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
  const [extraJSON, setExtraJSON] = useState('')
  const [references, setReferences] = useState<ReferenceImage[]>([])
  const [results, setResults] = useState<GeneratedImage[]>([])
  const [isGenerating, setIsGenerating] = useState(false)

  const { data: modelsData } = useQuery({
    queryKey: ['image-workbench-models'],
    queryFn: getUserModels,
  })
  const { data: groupsData } = useQuery({
    queryKey: ['image-workbench-groups'],
    queryFn: () => getUserGroups(true),
  })

  useEffect(() => {
    if (!modelsData) return
    const imageModels = modelsData.filter((item) =>
      /image|dall-e|imagen|flux|stable|midjourney|sd[-_]|kling/i.test(
        `${item.value} ${item.label}`
      )
    )
    // Keep the workbench scoped to models that expose an image-generation
    // capability; text-only models would otherwise produce a confusing
    // upstream validation error from the image endpoint.
    const nextModels = imageModels
    setModels(nextModels)
    if (!nextModels.some((item) => item.value === model)) {
      setModel(
        nextModels.find((item) => /gpt-image|dall-e|imagen|image/i.test(item.value))
          ?.value || nextModels[0]?.value || ''
      )
    }
  }, [model, modelsData])

  useEffect(() => {
    if (!groupsData) return
    setGroups(groupsData)
    if (!groupsData.some((item) => item.value === group)) {
      setGroup(
        groupsData.find((item) => item.value === 'default')?.value ||
          groupsData[0]?.value ||
          ''
      )
    }
  }, [group, groupsData])

  const waitForTask = async (
    taskId: string,
    signal: AbortSignal
  ): Promise<ImageGenerationResponse> => {
    const startedAt = Date.now()
    while (Date.now() - startedAt < 900_000) {
      if (signal.aborted) throw new DOMException('Generation stopped', 'AbortError')
      const response = await getImageGenerationTask(taskId, signal)
      const status = String(response.status || '').toLowerCase()
      if (getImageItems(response).some((item) => item.url || item.b64_json)) {
        return response
      }
      if (['succeeded', 'completed', 'success'].includes(status)) return response
      if (['failed', 'error', 'cancelled', 'canceled'].includes(status)) {
        throw new Error(response.error?.message || response.message || t('Image generation failed'))
      }
      await new Promise((resolve) => window.setTimeout(resolve, 3000))
    }
    throw new Error(t('Image generation timed out'))
  }

  const handleFiles = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (files.length === 0) return
    if (references.length + files.length > 16) {
      toast.error(t('You can add up to 16 reference images'))
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

  const handleReferenceURL = () => {
    const value = referenceURL.trim()
    if (!value) return
    if (references.length >= 16) {
      toast.error(t('You can add up to 16 reference images'))
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

  const selectedGroup = groups.find((item) => item.value === group)
  const isAPIMartModel = /^gpt-image-2(?:-ext)?$/i.test(model.trim())
  const supportsResolutionPricing =
    selectedGroup?.supportsResolutionPricing === true
  const allowsCustomParameters =
    !isAPIMartModel || supportsResolutionPricing
  const resolutionOptions = RESOLUTION_OPTIONS.map((option) => {
    const price = getResolutionPrice(selectedGroup?.desc, option.value)
    return {
      ...option,
      label: price
        ? t('{{resolution}} (Price {{price}}/image)', {
            resolution: option.label,
            price,
          })
        : option.label,
    }
  })

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
    const payload: ImageGenerationRequest = {
      ...(allowsCustomParameters ? extra : {}),
      model,
      group,
      prompt: prompt.trim(),
      ...(allowsCustomParameters && resolvedSize ? { size: resolvedSize } : {}),
      ...(allowsCustomParameters
        ? { n: Math.max(1, Math.min(10, count)) }
        : {}),
      ...(isAPIMartModel && supportsResolutionPricing
        ? {
            // APIMart GPT Image 2 accepts the documented reference field.
            resolution,
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
      if (!getImageItems(response).some((item) => item.url || item.b64_json) && taskId) {
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
        throw new Error(response.message || t('Image generation returned no image'))
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
    } catch (error) {
      if ((error as Error)?.name === 'AbortError') return
      toast.error(error instanceof Error ? error.message : t('Image generation failed'))
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setIsGenerating(false)
    }
  }

  const stopGeneration = () => {
    abortRef.current?.abort()
  }

  return (
    <SectionPageLayout>
      <SectionPageLayout.Title>{t('Image Workbench')}</SectionPageLayout.Title>
      <SectionPageLayout.Content>
        <div className='grid min-h-0 gap-5 xl:grid-cols-[minmax(320px,390px)_minmax(0,1fr)]'>
          <section className='space-y-5 rounded-lg border p-4'>
            <div className='space-y-1'>
              <h2 className='text-sm font-semibold'>{t('Image settings')}</h2>
              <p className='text-muted-foreground text-xs'>
                {t('Choose the channel group and image parameters for this request.')}
              </p>
            </div>

            <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-1'>
              <div className='space-y-1.5'>
                <Label>{t('Model restriction')}</Label>
                <ModelSelector
                  selectedModel={model}
                  models={models}
                  onModelChange={setModel}
                  disabled={isGenerating || models.length === 0}
                  className='h-8 w-full justify-between px-3 sm:w-full sm:justify-between'
                />
                {modelsData && models.length === 0 && (
                  <p className='text-muted-foreground text-xs'>
                    {t('No image models available')}
                  </p>
                )}
              </div>
              <div className='space-y-1.5'>
                <Label>{t('Group restriction')}</Label>
                <GroupSelector
                  selectedGroup={group}
                  groups={groups}
                  onGroupChange={setGroup}
                  disabled={isGenerating || groups.length === 0}
                  showRatio={false}
                  className='h-8 w-full justify-between px-3 sm:w-full sm:justify-between'
                />
              </div>
            </div>

            <div className='space-y-1.5'>
              <Label htmlFor='image-prompt'>{t('Prompt')}</Label>
              <Textarea
                id='image-prompt'
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
                placeholder={t('Describe the image you want to create')}
                className='min-h-28 resize-y'
                disabled={isGenerating}
              />
            </div>

            <div className='space-y-2'>
              <div className='flex items-center justify-between'>
                <Label>{t('Reference images')}</Label>
                <span className='text-muted-foreground text-xs'>
                  {references.length}/16
                </span>
              </div>
              <input
                ref={fileInputRef}
                type='file'
                accept='image/*'
                multiple
                className='hidden'
                onChange={handleFiles}
              />
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => fileInputRef.current?.click()}
                disabled={isGenerating || references.length >= 16}
              >
                <Paperclip />
                {t('Add reference image')}
              </Button>
              <div className='flex gap-2'>
                <Input
                  value={referenceURL}
                  onChange={(event) => setReferenceURL(event.target.value)}
                  placeholder={t('Paste a public image URL')}
                  disabled={isGenerating || references.length >= 16}
                />
                <Button
                  type='button'
                  variant='outline'
                  size='sm'
                  onClick={handleReferenceURL}
                  disabled={isGenerating || references.length >= 16}
                >
                  <ImagePlus />
                  {t('Add URL')}
                </Button>
              </div>
              {references.length > 0 && (
                <div className='grid grid-cols-4 gap-2'>
                  {references.map((reference) => (
                    <div key={reference.id} className='group relative aspect-square'>
                      <img
                        src={reference.data}
                        alt={reference.name}
                        className='size-full rounded-md border object-cover'
                      />
                      <button
                        type='button'
                        className='bg-background/90 text-foreground absolute top-1 right-1 rounded-full p-1 opacity-0 shadow transition-opacity group-hover:opacity-100'
                        title={t('Remove reference image')}
                        onClick={() =>
                          setReferences((current) =>
                            current.filter((item) => item.id !== reference.id)
                          )
                        }
                      >
                        <X className='size-3' />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className='grid gap-3 sm:grid-cols-2 xl:grid-cols-3'>
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
                <div className='space-y-1.5'>
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
              {isAPIMartModel && (
                <ParameterSelect
                  label={t('Resolution')}
                  value={resolution}
                  options={resolutionOptions}
                  onChange={setResolution}
                  disabled={isGenerating || !allowsCustomParameters}
                />
              )}
              <div className='space-y-1.5'>
                <Label htmlFor='image-count'>{t('Number of images')}</Label>
                <Input
                  id='image-count'
                  type='number'
                  min={1}
                  max={10}
                  value={count}
                  onChange={(event) =>
                    setCount(Number(event.target.value) || 1)
                  }
                  disabled={isGenerating || !allowsCustomParameters}
                />
              </div>
            </div>

            {!isAPIMartModel && (
              <div className='flex items-center justify-between rounded-md border px-3 py-2'>
                <Label htmlFor='image-watermark'>{t('Watermark')}</Label>
                <Switch
                  id='image-watermark'
                  checked={watermark}
                  onCheckedChange={setWatermark}
                  disabled={isGenerating || !allowsCustomParameters}
                />
              </div>
            )}

            {!isAPIMartModel && (
              <ParameterSelect
                label={t('Quality')}
                value={quality}
                options={QUALITY_OPTIONS.map((option) => ({
                  ...option,
                  label: t(option.label),
                }))}
                onChange={setQuality}
                disabled={isGenerating || !allowsCustomParameters}
              />
            )}

            <div className='space-y-1.5'>
              <Label htmlFor='image-extra'>{t('Advanced JSON parameters')}</Label>
              <Textarea
                id='image-extra'
                value={extraJSON}
                onChange={(event) => setExtraJSON(event.target.value)}
                placeholder='{"provider_parameter":"value"}'
                className='min-h-20 font-mono text-xs'
                disabled={isGenerating || !allowsCustomParameters}
              />
            </div>

            <div className='flex gap-2'>
              {isGenerating ? (
                <Button type='button' variant='outline' onClick={stopGeneration}>
                  <Square />
                  {t('Stop generation')}
                </Button>
              ) : (
                <Button
                  type='button'
                  onClick={handleGenerate}
                  disabled={!model || !prompt.trim()}
                >
                  <WandSparkles />
                  {t('Generate images')}
                </Button>
              )}
            </div>
          </section>

          <section className='min-h-[520px] rounded-lg border p-4'>
            <div className='mb-4 flex items-center justify-between gap-3'>
              <div>
                <h2 className='text-sm font-semibold'>{t('Generated images')}</h2>
                <p className='text-muted-foreground text-xs'>
                  {t('Images generated in this workbench appear here.')}
                </p>
              </div>
              {isGenerating && (
                <LoaderCircle className='text-muted-foreground size-4 animate-spin' />
              )}
            </div>
            {results.length === 0 ? (
              <div className='text-muted-foreground flex min-h-[430px] flex-col items-center justify-center gap-3 text-sm'>
                <ImagePlus className='size-8' />
                <span>{t('No images yet')}</span>
              </div>
            ) : (
              <div className='grid gap-4 sm:grid-cols-2'>
                {results.map((result) => (
                  <div key={result.id} className='group relative overflow-hidden rounded-lg border'>
                    <img
                      src={result.url}
                      alt={t('Generated image')}
                      className={cn(
                        'aspect-square w-full bg-muted/30 object-contain',
                        result.url.startsWith('data:') && 'select-none'
                      )}
                    />
                    <a
                      href={
                        result.url.includes('?')
                          ? `${result.url}&download=1`
                          : `${result.url}?download=1`
                      }
                      download
                      className='bg-background/90 text-foreground absolute right-2 bottom-2 inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs opacity-0 shadow transition-opacity group-hover:opacity-100'
                    >
                      <Download className='size-3' />
                      {t('Download')}
                    </a>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </SectionPageLayout.Content>
    </SectionPageLayout>
  )
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
