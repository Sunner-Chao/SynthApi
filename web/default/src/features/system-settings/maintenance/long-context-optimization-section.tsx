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
import { useEffect, useMemo, useRef } from 'react'
import * as z from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'
import { safeNumberFieldProps } from '../utils/numeric-field'

const longContextSchema = z.object({
  long_context_optimization: z.object({
    enabled: z.boolean(),
    server_side_compaction_enabled: z.boolean(),
    compact_threshold_tokens: z.number().int().min(1_000).max(1_000_000),
    override_existing_compaction: z.boolean(),
    reasoning_downgrade_enabled: z.boolean(),
    reasoning_threshold_tokens: z.number().int().min(1_000).max(1_000_000),
    reasoning_target_effort: z.enum(['low', 'medium', 'high']),
    apply_to_user_ids: z.string(),
    apply_to_token_ids: z.string(),
    apply_to_groups: z.string(),
  }),
})

type LongContextFormValues = z.infer<typeof longContextSchema>

export type LongContextOptimizationDefaults = {
  'long_context_optimization.enabled': boolean
  'long_context_optimization.server_side_compaction_enabled': boolean
  'long_context_optimization.compact_threshold_tokens': number
  'long_context_optimization.override_existing_compaction': boolean
  'long_context_optimization.reasoning_downgrade_enabled': boolean
  'long_context_optimization.reasoning_threshold_tokens': number
  'long_context_optimization.reasoning_target_effort': 'low' | 'medium' | 'high'
  'long_context_optimization.apply_to_user_ids': string
  'long_context_optimization.apply_to_token_ids': string
  'long_context_optimization.apply_to_groups': string
}

const buildFormDefaults = (
  values: LongContextOptimizationDefaults
): LongContextFormValues => ({
  long_context_optimization: {
    enabled: values['long_context_optimization.enabled'],
    server_side_compaction_enabled:
      values['long_context_optimization.server_side_compaction_enabled'],
    compact_threshold_tokens:
      values['long_context_optimization.compact_threshold_tokens'],
    override_existing_compaction:
      values['long_context_optimization.override_existing_compaction'],
    reasoning_downgrade_enabled:
      values['long_context_optimization.reasoning_downgrade_enabled'],
    reasoning_threshold_tokens:
      values['long_context_optimization.reasoning_threshold_tokens'],
    reasoning_target_effort:
      values['long_context_optimization.reasoning_target_effort'],
    apply_to_user_ids:
      values['long_context_optimization.apply_to_user_ids'] ?? '',
    apply_to_token_ids:
      values['long_context_optimization.apply_to_token_ids'] ?? '',
    apply_to_groups: values['long_context_optimization.apply_to_groups'] ?? '',
  },
})

const flattenFormValues = (
  values: LongContextFormValues
): LongContextOptimizationDefaults => ({
  'long_context_optimization.enabled': values.long_context_optimization.enabled,
  'long_context_optimization.server_side_compaction_enabled':
    values.long_context_optimization.server_side_compaction_enabled,
  'long_context_optimization.compact_threshold_tokens':
    values.long_context_optimization.compact_threshold_tokens,
  'long_context_optimization.override_existing_compaction':
    values.long_context_optimization.override_existing_compaction,
  'long_context_optimization.reasoning_downgrade_enabled':
    values.long_context_optimization.reasoning_downgrade_enabled,
  'long_context_optimization.reasoning_threshold_tokens':
    values.long_context_optimization.reasoning_threshold_tokens,
  'long_context_optimization.reasoning_target_effort':
    values.long_context_optimization.reasoning_target_effort,
  'long_context_optimization.apply_to_user_ids':
    values.long_context_optimization.apply_to_user_ids.trim(),
  'long_context_optimization.apply_to_token_ids':
    values.long_context_optimization.apply_to_token_ids.trim(),
  'long_context_optimization.apply_to_groups':
    values.long_context_optimization.apply_to_groups.trim(),
})

type Props = {
  defaultValues: LongContextOptimizationDefaults
}

export function LongContextOptimizationSection({ defaultValues }: Props) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const formDefaults = useMemo(
    () => buildFormDefaults(defaultValues),
    [defaultValues]
  )
  const form = useForm<LongContextFormValues>({
    resolver: zodResolver(longContextSchema),
    defaultValues: formDefaults,
  })
  const baselineRef = useRef(defaultValues)
  const baselineSerializedRef = useRef(JSON.stringify(defaultValues))

  useEffect(() => {
    const serialized = JSON.stringify(defaultValues)
    if (serialized === baselineSerializedRef.current) return
    baselineRef.current = defaultValues
    baselineSerializedRef.current = serialized
    form.reset(buildFormDefaults(defaultValues))
  }, [defaultValues, form])

  const enabled = form.watch('long_context_optimization.enabled')
  const compactionEnabled = form.watch(
    'long_context_optimization.server_side_compaction_enabled'
  )
  const reasoningEnabled = form.watch(
    'long_context_optimization.reasoning_downgrade_enabled'
  )

  const onSubmit = async (values: LongContextFormValues) => {
    const flattened = flattenFormValues(values)
    const updates = Object.entries(flattened).filter(
      ([key, value]) =>
        value !==
        baselineRef.current[key as keyof LongContextOptimizationDefaults]
    )

    for (const [key, value] of updates) {
      await updateOption.mutateAsync({ key, value })
    }
  }

  return (
    <SettingsSection title={t('Long Context Optimization')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
          />

          <FormField
            control={form.control}
            name='long_context_optimization.enabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Enable long context optimization')}</FormLabel>
                  <FormDescription>
                    {t('Only applies to the scopes configured below')}
                  </FormDescription>
                </SettingsSwitchContent>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
              </SettingsSwitchItem>
            )}
          />

          <FormField
            control={form.control}
            name='long_context_optimization.server_side_compaction_enabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Server-side compaction')}</FormLabel>
                  <FormDescription>
                    {t('OpenAI Responses and Codex channels only')}
                  </FormDescription>
                </SettingsSwitchContent>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={!enabled}
                  />
                </FormControl>
              </SettingsSwitchItem>
            )}
          />

          <FormField
            control={form.control}
            name='long_context_optimization.compact_threshold_tokens'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Compaction threshold')}</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    min={1_000}
                    max={1_000_000}
                    step={1_000}
                    {...safeNumberFieldProps(field)}
                    disabled={!enabled || !compactionEnabled}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='long_context_optimization.override_existing_compaction'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Override client compaction')}</FormLabel>
                  <FormDescription>
                    {t('Keep client settings unless this is enabled')}
                  </FormDescription>
                </SettingsSwitchContent>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={!enabled || !compactionEnabled}
                  />
                </FormControl>
              </SettingsSwitchItem>
            )}
          />

          <FormField
            control={form.control}
            name='long_context_optimization.reasoning_downgrade_enabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Reasoning effort downgrade')}</FormLabel>
                  <FormDescription>
                    {t('May reduce answer quality; disabled by default')}
                  </FormDescription>
                </SettingsSwitchContent>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                    disabled={!enabled}
                  />
                </FormControl>
              </SettingsSwitchItem>
            )}
          />

          <FormField
            control={form.control}
            name='long_context_optimization.reasoning_threshold_tokens'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Reasoning downgrade threshold')}</FormLabel>
                <FormControl>
                  <Input
                    type='number'
                    min={1_000}
                    max={1_000_000}
                    step={1_000}
                    {...safeNumberFieldProps(field)}
                    disabled={!enabled || !reasoningEnabled}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='long_context_optimization.reasoning_target_effort'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Target reasoning effort')}</FormLabel>
                <Select
                  items={[
                    { value: 'low', label: t('Low') },
                    { value: 'medium', label: t('Medium') },
                    { value: 'high', label: t('High') },
                  ]}
                  value={field.value}
                  onValueChange={field.onChange}
                  disabled={!enabled || !reasoningEnabled}
                >
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent alignItemWithTrigger={false}>
                    <SelectGroup>
                      <SelectItem value='low'>{t('Low')}</SelectItem>
                      <SelectItem value='medium'>{t('Medium')}</SelectItem>
                      <SelectItem value='high'>{t('High')}</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='long_context_optimization.apply_to_user_ids'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('User ID scope')}</FormLabel>
                <FormControl>
                  <Input {...field} placeholder='20, 21' disabled={!enabled} />
                </FormControl>
                <FormDescription>
                  {t('Blank applies to all users')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='long_context_optimization.apply_to_token_ids'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Token ID scope')}</FormLabel>
                <FormControl>
                  <Input {...field} placeholder='15' disabled={!enabled} />
                </FormControl>
                <FormDescription>
                  {t('Blank applies to all tokens')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name='long_context_optimization.apply_to_groups'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Group scope')}</FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder='default, vip'
                    disabled={!enabled}
                  />
                </FormControl>
                <FormDescription>
                  {t('Blank applies to all groups')}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
