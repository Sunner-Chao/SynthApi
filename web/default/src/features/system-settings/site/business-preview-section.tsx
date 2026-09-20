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
import { useEffect } from 'react'
import * as z from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormLabel,
  FormMessage,
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

const businessPreviewSchema = z.object({
  PublicBusinessPreviewEnabled: z.boolean(),
})

type BusinessPreviewFormValues = z.infer<typeof businessPreviewSchema>

type BusinessPreviewSectionProps = {
  defaultValue: boolean
}

export function BusinessPreviewSection({
  defaultValue,
}: BusinessPreviewSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const form = useForm<BusinessPreviewFormValues>({
    resolver: zodResolver(businessPreviewSchema),
    defaultValues: { PublicBusinessPreviewEnabled: defaultValue },
  })

  useEffect(() => {
    form.reset({ PublicBusinessPreviewEnabled: defaultValue })
  }, [defaultValue, form])

  const onSubmit = async (values: BusinessPreviewFormValues) => {
    if (values.PublicBusinessPreviewEnabled === defaultValue) return
    await updateOption.mutateAsync({
      key: 'PublicBusinessPreviewEnabled',
      value: values.PublicBusinessPreviewEnabled,
    })
  }

  return (
    <SettingsSection title={t('Public business preview')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            onReset={() =>
              form.reset({ PublicBusinessPreviewEnabled: defaultValue })
            }
            isSaving={updateOption.isPending}
            isResetDisabled={!form.formState.isDirty}
          />

          <Alert>
            <AlertTitle>{t('Anonymous access is read-only')}</AlertTitle>
            <AlertDescription>
              {t(
                'Visitors can view payment methods, top-up options, and plans. Balances, orders, subscriptions, and payment actions remain protected by login.'
              )}
            </AlertDescription>
          </Alert>

          <FormField
            control={form.control}
            name='PublicBusinessPreviewEnabled'
            render={({ field }) => (
              <SettingsSwitchItem>
                <SettingsSwitchContent>
                  <FormLabel>
                    {t('Allow public wallet and plan preview')}
                  </FormLabel>
                  <FormDescription>
                    {t(
                      'Adds a public Wallet & Plans page and redirects signed-out wallet visitors to the safe preview.'
                    )}
                  </FormDescription>
                </SettingsSwitchContent>
                <FormControl>
                  <Switch
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                </FormControl>
                <FormMessage />
              </SettingsSwitchItem>
            )}
          />
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
