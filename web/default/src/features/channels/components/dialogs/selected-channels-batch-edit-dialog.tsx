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
import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Layers3, Loader2, PencilLine } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { Textarea } from '@/components/ui/textarea'
import { MultiSelect } from '@/components/multi-select'
import { batchUpdateChannels, getGroups } from '../../api'
import { channelsQueryKeys } from '../../lib'
import type { BatchUpdateChannelsParams } from '../../types'
import { ModelMappingEditor } from '../model-mapping-editor'

type BatchField = BatchUpdateChannelsParams['fields'][number]

type SelectedChannelsBatchEditDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  selectedIds: number[]
  onSuccess?: () => void
}

const FIELD_META: Array<{
  field: BatchField
  labelKey: string
  descriptionKey: string
}> = [
  {
    field: 'groups',
    labelKey: 'Groups',
    descriptionKey: 'Overwrite user groups for selected channels',
  },
  {
    field: 'models',
    labelKey: 'Models',
    descriptionKey: 'Overwrite models for selected channels',
  },
  {
    field: 'model_mapping',
    labelKey: 'Model Mapping',
    descriptionKey: 'Overwrite model mapping for selected channels',
  },
  {
    field: 'priority',
    labelKey: 'Priority',
    descriptionKey: 'Overwrite priority for selected channels',
  },
  {
    field: 'weight',
    labelKey: 'Weight',
    descriptionKey: 'Overwrite weight for selected channels',
  },
  {
    field: 'tag',
    labelKey: 'Tag',
    descriptionKey: 'Set or clear tag for selected channels',
  },
]

function toggleField(
  fields: BatchField[],
  field: BatchField,
  checked: boolean
) {
  if (checked) {
    return fields.includes(field) ? fields : [...fields, field]
  }
  return fields.filter((item) => item !== field)
}

export function SelectedChannelsBatchEditDialog({
  open,
  onOpenChange,
  selectedIds,
  onSuccess,
}: SelectedChannelsBatchEditDialogProps) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const [selectedFields, setSelectedFields] = useState<BatchField[]>([])
  const [groups, setGroups] = useState<string[]>([])
  const [models, setModels] = useState('')
  const [modelMapping, setModelMapping] = useState('')
  const [priority, setPriority] = useState('')
  const [weight, setWeight] = useState('')
  const [tag, setTag] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  const { data: groupsData, isLoading: isLoadingGroups } = useQuery({
    queryKey: ['groups'],
    queryFn: getGroups,
    enabled: open,
  })

  const groupOptions = useMemo(() => {
    const allGroups = new Set([
      ...(Array.isArray(groupsData?.data) ? groupsData.data : []),
      ...groups,
    ])
    return Array.from(allGroups).map((group) => ({
      value: group,
      label: group,
    }))
  }, [groupsData, groups])

  const isFieldSelected = (field: BatchField) => selectedFields.includes(field)

  const reset = () => {
    setSelectedFields([])
    setGroups([])
    setModels('')
    setModelMapping('')
    setPriority('')
    setWeight('')
    setTag('')
  }

  const handleClose = (nextOpen: boolean) => {
    if (!nextOpen && !isSaving) {
      reset()
    }
    onOpenChange(nextOpen)
  }

  const handleSave = async () => {
    if (selectedIds.length === 0) {
      toast.error(t('No channels selected'))
      return
    }
    if (selectedFields.length === 0) {
      toast.error(t('Select at least one field to update'))
      return
    }
    if (isFieldSelected('groups') && groups.length === 0) {
      toast.error(t('Select at least one group'))
      return
    }
    if (isFieldSelected('models') && !models.trim()) {
      toast.error(t('Models cannot be empty'))
      return
    }
    if (isFieldSelected('model_mapping') && modelMapping.trim()) {
      try {
        JSON.parse(modelMapping)
      } catch {
        toast.error(t('Model mapping must be valid JSON'))
        return
      }
    }

    const payload: BatchUpdateChannelsParams = {
      ids: selectedIds,
      fields: selectedFields,
    }

    if (isFieldSelected('groups')) {
      payload.groups = groups.join(',')
    }
    if (isFieldSelected('models')) {
      payload.models = models.trim()
    }
    if (isFieldSelected('model_mapping')) {
      payload.model_mapping = modelMapping.trim()
    }
    if (isFieldSelected('priority')) {
      payload.priority = Number(priority || 0)
    }
    if (isFieldSelected('weight')) {
      payload.weight = Number(weight || 0)
    }
    if (isFieldSelected('tag')) {
      payload.tag = tag.trim() || null
    }

    setIsSaving(true)
    try {
      const response = await batchUpdateChannels(payload)
      if (!response.success) {
        throw new Error(
          response.message || t('Failed to batch update channels')
        )
      }
      toast.success(
        t('Updated {{count}} selected channel(s)', {
          count: response.data ?? selectedIds.length,
        })
      )
      await queryClient.invalidateQueries({ queryKey: channelsQueryKeys.all })
      onSuccess?.()
      reset()
      onOpenChange(false)
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : t('Failed to batch update channels')
      )
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className='max-h-[90vh] max-w-3xl overflow-y-auto p-0'>
        <DialogHeader className='border-b px-5 py-4'>
          <div className='flex items-center gap-3'>
            <span className='bg-primary/10 text-primary flex size-9 shrink-0 items-center justify-center rounded-lg'>
              <PencilLine className='size-4.5' />
            </span>
            <div>
              <DialogTitle>{t('Batch edit selected channels')}</DialogTitle>
              <DialogDescription>
                {t('Overwrite selected fields for {{count}} channel(s)', {
                  count: selectedIds.length,
                })}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className='grid gap-5 p-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]'>
          <div className='space-y-3'>
            <div>
              <h4 className='text-sm font-semibold'>{t('Fields to update')}</h4>
              <p className='text-muted-foreground mt-1 text-xs'>
                {t('Only checked fields will be overwritten.')}
              </p>
            </div>
            <div className='space-y-2 rounded-lg border p-2'>
              {FIELD_META.map((item) => (
                <button
                  key={item.field}
                  type='button'
                  className='hover:bg-muted/50 flex w-full items-start gap-3 rounded-md px-2 py-2 text-left transition-colors'
                  onClick={() =>
                    setSelectedFields((previous) =>
                      toggleField(
                        previous,
                        item.field,
                        !previous.includes(item.field)
                      )
                    )
                  }
                >
                  <Checkbox
                    checked={isFieldSelected(item.field)}
                    onCheckedChange={(checked) =>
                      setSelectedFields((previous) =>
                        toggleField(previous, item.field, checked === true)
                      )
                    }
                    onClick={(event) => event.stopPropagation()}
                    aria-label={t(item.labelKey)}
                    className='mt-0.5'
                  />
                  <span className='min-w-0'>
                    <span className='block text-sm font-medium'>
                      {t(item.labelKey)}
                    </span>
                    <span className='text-muted-foreground block text-xs'>
                      {t(item.descriptionKey)}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className='space-y-4'>
            <div className='bg-muted/20 rounded-lg border p-3'>
              <div className='flex items-center gap-2 text-sm font-medium'>
                <Layers3 className='text-muted-foreground size-4' />
                {t('Selected channels')}: {selectedIds.length}
              </div>
              <p className='text-muted-foreground mt-1 text-xs'>
                {t('These changes apply to every selected channel.')}
              </p>
            </div>

            {isFieldSelected('groups') && (
              <div className='space-y-2'>
                <Label>{t('Groups')}</Label>
                {isLoadingGroups ? (
                  <Skeleton className='h-10 w-full' />
                ) : (
                  <MultiSelect
                    options={groupOptions}
                    selected={groups}
                    onChange={setGroups}
                    allowCreate
                    placeholder={t('Select or create groups')}
                  />
                )}
              </div>
            )}

            {isFieldSelected('models') && (
              <div className='space-y-2'>
                <Label htmlFor='selected-batch-models'>{t('Models')}</Label>
                <Textarea
                  id='selected-batch-models'
                  value={models}
                  onChange={(event) => setModels(event.target.value)}
                  rows={3}
                  placeholder={t('Comma-separated model names')}
                />
              </div>
            )}

            {isFieldSelected('model_mapping') && (
              <div className='space-y-2'>
                <Label>{t('Model Mapping')}</Label>
                <ModelMappingEditor
                  value={modelMapping}
                  onChange={setModelMapping}
                  disabled={isSaving}
                />
              </div>
            )}

            <div className='grid gap-4 sm:grid-cols-2'>
              {isFieldSelected('priority') && (
                <div className='space-y-2'>
                  <Label htmlFor='selected-batch-priority'>
                    {t('Priority')}
                  </Label>
                  <Input
                    id='selected-batch-priority'
                    type='number'
                    value={priority}
                    onChange={(event) => setPriority(event.target.value)}
                    placeholder='0'
                  />
                </div>
              )}
              {isFieldSelected('weight') && (
                <div className='space-y-2'>
                  <Label htmlFor='selected-batch-weight'>{t('Weight')}</Label>
                  <Input
                    id='selected-batch-weight'
                    type='number'
                    min={0}
                    value={weight}
                    onChange={(event) => setWeight(event.target.value)}
                    placeholder='0'
                  />
                </div>
              )}
            </div>

            {isFieldSelected('tag') && (
              <div className='space-y-2'>
                <Label htmlFor='selected-batch-tag'>{t('Tag')}</Label>
                <Input
                  id='selected-batch-tag'
                  value={tag}
                  onChange={(event) => setTag(event.target.value)}
                  placeholder={t('Leave empty to remove tag')}
                />
              </div>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button
            variant='outline'
            onClick={() => handleClose(false)}
            disabled={isSaving}
          >
            {t('Cancel')}
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <Loader2 className='size-4 animate-spin' />
            ) : (
              <PencilLine className='size-4' />
            )}
            {isSaving ? t('Saving...') : t('Update selected')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
