/*
Copyright (C) 2023-2026 QuantumNous

This program is free software: you can redistribute it and/or modify
it under the terms of the GNU Affero General Public License as
published by the Free Software Foundation, either version 3 of the
License, or (at your option) any later version.
*/
import { useForm } from 'react-hook-form'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormLabel,
} from '@/components/ui/form'
import { Switch } from '@/components/ui/switch'
import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

type RewardProgramValues = {
  AffiliateMilestoneRewardEnabled: boolean
  RechargeBenefitEnabled: boolean
}

export function RewardProgramSettingsSection(props: {
  defaultValues: RewardProgramValues
}) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const form = useForm<RewardProgramValues>({
    defaultValues: props.defaultValues,
  })

  async function onSubmit(values: RewardProgramValues) {
    const updates = (Object.keys(values) as Array<keyof RewardProgramValues>)
      .filter((key) => values[key] !== props.defaultValues[key])
      .map((key) => ({ key, value: String(values[key]) }))

    if (updates.length === 0) {
      toast.info(t('No changes to save'))
      return
    }
    for (const update of updates) {
      await updateOption.mutateAsync(update)
    }
    form.reset(values)
  }

  return (
    <SettingsSection title={t('Reward Programs')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending || form.formState.isSubmitting}
            isSaveDisabled={!form.formState.isDirty}
            saveLabel='Save reward programs'
          />
          <FormField
            control={form.control}
            name='AffiliateMilestoneRewardEnabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Invitation rebate program')}</FormLabel>
                  <FormDescription>
                    {t(
                      'Show the invitation rebate page and settle new successful invited-user top-ups. Historical ledger entries remain unchanged when disabled.'
                    )}
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
            name='RechargeBenefitEnabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>{t('Thousand-yuan recharge benefit')}</FormLabel>
                  <FormDescription>
                    {t(
                      'Show the recharge benefit page and allow new claims or reviews. Historical claims remain available in the database when disabled.'
                    )}
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
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
