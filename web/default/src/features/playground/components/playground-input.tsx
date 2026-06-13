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
import { useRef, useState, type ChangeEvent } from 'react'
import { nanoid } from 'nanoid'
import {
  PaperclipIcon,
  FileIcon,
  ImageIcon,
  GlobeIcon,
  SendIcon,
  SquareIcon,
  BarChartIcon,
  BoxIcon,
  NotepadTextIcon,
  CodeSquareIcon,
  GraduationCapIcon,
  XIcon,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  PromptInput,
  PromptInputButton,
  PromptInputFooter,
  PromptInputTextarea,
  PromptInputTools,
  type PromptInputMessage,
} from '@/components/ai-elements/prompt-input'
import { Suggestion, Suggestions } from '@/components/ai-elements/suggestion'
import { Badge } from '@/components/ui/badge'
import { ModelGroupSelector } from '@/components/model-group-selector'
import type { ModelOption, GroupOption, PlaygroundAttachment } from '../types'

interface PlaygroundInputProps {
  onSubmit: (text: string, attachments: PlaygroundAttachment[]) => void
  onStop?: () => void
  disabled?: boolean
  isGenerating?: boolean
  models: ModelOption[]
  modelValue: string
  onModelChange: (value: string) => void
  isModelLoading?: boolean
  groups: GroupOption[]
  groupValue: string
  onGroupChange: (value: string) => void
  webSearchEnabled: boolean
  onWebSearchChange: (value: boolean) => void
}

const MAX_ATTACHMENTS = 5
const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024

const suggestions = [
  { icon: BarChartIcon, text: 'Analyze data', color: '#76d0eb' },
  { icon: BoxIcon, text: 'Surprise me', color: '#76d0eb' },
  { icon: NotepadTextIcon, text: 'Summarize text', color: '#ea8444' },
  { icon: CodeSquareIcon, text: 'Code', color: '#6c71ff' },
  { icon: GraduationCapIcon, text: 'Get advice', color: '#76d0eb' },
  { icon: null, text: 'More' },
]

export function PlaygroundInput({
  onSubmit,
  onStop,
  disabled,
  isGenerating,
  models,
  modelValue,
  onModelChange,
  isModelLoading = false,
  groups,
  groupValue,
  onGroupChange,
  webSearchEnabled,
  onWebSearchChange,
}: PlaygroundInputProps) {
  const { t } = useTranslation()
  const [text, setText] = useState('')
  const [attachments, setAttachments] = useState<PlaygroundAttachment[]>([])
  const fileInputRef = useRef<HTMLInputElement>(null)
  const imageInputRef = useRef<HTMLInputElement>(null)

  const isModelSelectDisabled =
    disabled || isModelLoading || models.length === 0
  const isGroupSelectDisabled = disabled || groups.length === 0

  const handleSubmit = (message: PromptInputMessage) => {
    if ((!message.text?.trim() && attachments.length === 0) || disabled) return
    onSubmit(message.text || '', attachments)
    setText('')
    setAttachments([])
  }

  const arrayBufferToBase64 = (buffer: ArrayBuffer) => {
    let binary = ''
    const bytes = new Uint8Array(buffer)
    const chunkSize = 0x8000
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize)
      binary += String.fromCharCode(...chunk)
    }
    return btoa(binary)
  }

  const readFileAsDataUrlWithReader = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(reader.error)
      reader.readAsDataURL(file)
    })

  const readFileAsDataUrl = async (file: File) => {
    if (typeof file.arrayBuffer === 'function') {
      try {
        const buffer = await file.arrayBuffer()
        return `data:${file.type || 'application/octet-stream'};base64,${arrayBufferToBase64(buffer)}`
      } catch (error) {
        // Some WebViews fail Blob.arrayBuffer() for cloud-backed files.
        // Fall back to FileReader before treating the attachment as unreadable.
        // eslint-disable-next-line no-console
        console.warn('Blob.arrayBuffer() failed, falling back to FileReader', error)
      }
    }
    return readFileAsDataUrlWithReader(file)
  }

  const getReadErrorMessage = (error: unknown) => {
    if (error instanceof DOMException && error.message) return error.message
    if (error instanceof Error && error.message) return error.message
    return String(error || t('Unknown error'))
  }

  const getBase64Payload = (dataUrl: string) => {
    const commaIndex = dataUrl.indexOf(',')
    return commaIndex === -1 ? dataUrl : dataUrl.slice(commaIndex + 1)
  }

  const handleFilesSelected = async (
    event: ChangeEvent<HTMLInputElement>,
    kind: PlaygroundAttachment['kind']
  ) => {
    const input = event.currentTarget
    const selectedFiles = Array.from(input.files || [])
    if (selectedFiles.length === 0) return

    const availableSlots = MAX_ATTACHMENTS - attachments.length
    if (availableSlots <= 0) {
      toast.error(t('Attachment limit reached'))
      input.value = ''
      return
    }

    const acceptedFiles = selectedFiles.slice(0, availableSlots)
    const oversized = acceptedFiles.find((file) => file.size > MAX_ATTACHMENT_SIZE)
    if (oversized) {
      toast.error(t('Attachment is too large'), {
        description: `${oversized.name} > 10MB`,
      })
      input.value = ''
      return
    }

    const nextAttachments: PlaygroundAttachment[] = []
    const failedFiles: string[] = []

    try {
      for (const file of acceptedFiles) {
        try {
          const dataUrl = await readFileAsDataUrl(file)
          nextAttachments.push({
            id: nanoid(),
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size,
            data: dataUrl,
            base64: getBase64Payload(dataUrl),
            kind:
              kind === 'image' || file.type.startsWith('image/')
                ? 'image'
                : 'file',
          })
        } catch (error) {
          const reason = getReadErrorMessage(error)
          failedFiles.push(`${file.name}: ${reason}`)
          // eslint-disable-next-line no-console
          console.error('Failed to read playground attachment:', file.name, error)
        }
      }

      if (nextAttachments.length > 0) {
        setAttachments((prev) => [...prev, ...nextAttachments])
      }

      if (failedFiles.length > 0) {
        toast.error(t('Failed to read attachment'), {
          description: failedFiles.slice(0, 2).join('\n'),
        })
      }
    } finally {
      input.value = ''
    }
  }

  const removeAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((item) => item.id !== id))
  }

  const handleSuggestionClick = (suggestion: string) => {
    onSubmit(suggestion, [])
  }

  return (
    <div className='grid shrink-0 gap-4 px-1 md:pb-4'>
      <input
        ref={fileInputRef}
        type='file'
        className='hidden'
        multiple
        onChange={(event) => handleFilesSelected(event, 'file')}
      />
      <input
        ref={imageInputRef}
        type='file'
        className='hidden'
        multiple
        accept='image/*'
        onChange={(event) => handleFilesSelected(event, 'image')}
      />
      <PromptInput groupClassName='rounded-xl' onSubmit={handleSubmit}>
        <PromptInputTextarea
          autoComplete='off'
          autoCorrect='off'
          autoCapitalize='off'
          spellCheck={false}
          className='px-5 md:text-base'
          disabled={disabled}
          onChange={(event) => setText(event.target.value)}
          placeholder={
            webSearchEnabled
              ? t('Ask anything with web search')
              : t('Ask anything')
          }
          value={text}
        />

        {attachments.length > 0 && (
          <div className='flex flex-wrap gap-2 px-3 pb-1'>
            {attachments.map((attachment) => {
              const Icon = attachment.kind === 'image' ? ImageIcon : FileIcon
              return (
                <Badge
                  key={attachment.id}
                  variant='secondary'
                  className='h-7 max-w-full gap-1 rounded-md pr-1'
                >
                  <Icon className='size-3.5 shrink-0' />
                  <span className='max-w-44 truncate'>{attachment.name}</span>
                  <button
                    type='button'
                    className='hover:bg-background/80 flex size-5 items-center justify-center rounded-sm'
                    onClick={() => removeAttachment(attachment.id)}
                    aria-label={t('Remove attachment')}
                  >
                    <XIcon className='size-3.5' />
                  </button>
                </Badge>
              )
            })}
          </div>
        )}

        <PromptInputFooter className='p-2.5'>
          <PromptInputTools>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <PromptInputButton
                    className='border font-medium'
                    disabled={disabled}
                    variant='outline'
                  />
                }
              >
                <PaperclipIcon size={16} />
                <span className='hidden sm:inline'>{t('Attach')}</span>
                <span className='sr-only sm:hidden'>{t('Attach')}</span>
              </DropdownMenuTrigger>
              <DropdownMenuContent align='start'>
                <DropdownMenuItem
                  onClick={() => fileInputRef.current?.click()}
                >
                  <FileIcon className='mr-2' size={16} />
                  {t('Upload file')}
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => imageInputRef.current?.click()}
                >
                  <ImageIcon className='mr-2' size={16} />
                  {t('Upload photo')}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            <PromptInputButton
              className='border font-medium data-[active=true]:border-primary data-[active=true]:bg-primary/10 data-[active=true]:text-primary'
              data-active={webSearchEnabled}
              disabled={disabled}
              onClick={() => onWebSearchChange(!webSearchEnabled)}
              variant='outline'
              type='button'
            >
              <GlobeIcon size={16} />
              <span className='hidden sm:inline'>
                {webSearchEnabled ? t('Search on') : t('Search')}
              </span>
              <span className='sr-only sm:hidden'>
                {webSearchEnabled ? t('Search on') : t('Search')}
              </span>
            </PromptInputButton>
          </PromptInputTools>

          <div className='flex items-center gap-1.5 md:gap-2'>
            <ModelGroupSelector
              selectedModel={modelValue}
              models={models}
              onModelChange={onModelChange}
              selectedGroup={groupValue}
              groups={groups}
              onGroupChange={onGroupChange}
              disabled={isModelSelectDisabled || isGroupSelectDisabled}
            />

            {isGenerating && onStop ? (
              <PromptInputButton
                className='text-foreground font-medium'
                onClick={onStop}
                variant='secondary'
              >
                <SquareIcon className='fill-current' size={16} />
                <span className='hidden sm:inline'>{t('Stop')}</span>
                <span className='sr-only sm:hidden'>{t('Stop')}</span>
              </PromptInputButton>
            ) : (
              <PromptInputButton
                className='text-foreground font-medium'
                disabled={disabled || (!text.trim() && attachments.length === 0)}
                type='submit'
                variant='secondary'
              >
                <SendIcon size={16} />
                <span className='hidden sm:inline'>{t('Send')}</span>
                <span className='sr-only sm:hidden'>{t('Send')}</span>
              </PromptInputButton>
            )}
          </div>
        </PromptInputFooter>
      </PromptInput>

      <Suggestions>
        {suggestions.map(({ icon: Icon, text, color }) => (
          <Suggestion
            className={`text-xs font-normal sm:text-sm ${
              text === 'More' ? 'hidden sm:flex' : ''
            }`}
            key={text}
            onClick={() => handleSuggestionClick(text)}
            suggestion={text}
          >
            {Icon && <Icon size={16} style={{ color }} />}
            {text}
          </Suggestion>
        ))}
      </Suggestions>
    </div>
  )
}
