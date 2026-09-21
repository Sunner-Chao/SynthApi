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
import { AlertTriangle, Mail, ShieldCheck } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
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
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import {
  SettingsForm,
  SettingsSwitchContent,
  SettingsSwitchItem,
} from '../components/settings-form-layout'
import { SettingsPageFormActions } from '../components/settings-page-context'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const sensitiveSchema = z.object({
  CheckSensitiveEnabled: z.boolean(),
  CheckSensitiveOnPromptEnabled: z.boolean(),
  SensitiveNotifyAdminEmailEnabled: z.boolean(),
  SensitiveNotifyUserEmailEnabled: z.boolean(),
  SensitiveRiskScanEnabled: z.boolean(),
  SensitiveRiskThreshold: z.number().min(1).max(1000),
  SensitiveWords: z.string().optional(),
  SensitiveIntentRules: z.string().optional(),
  SensitiveRegexRules: z.string().optional(),
  SensitiveRiskAllowRules: z.string().optional(),
})

type SensitiveFormValues = z.infer<typeof sensitiveSchema>

type SensitiveWordsSectionProps = {
  defaultValues: SensitiveFormValues
}

export function SensitiveWordsSection({
  defaultValues,
}: SensitiveWordsSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const form = useForm<SensitiveFormValues>({
    resolver: zodResolver(sensitiveSchema),
    defaultValues,
  })

  useEffect(() => {
    form.reset(defaultValues)
  }, [defaultValues, form])

  const onSubmit = async (values: SensitiveFormValues) => {
    const updates = Object.entries(values).filter(
      ([key, value]) =>
        value !== defaultValues[key as keyof SensitiveFormValues]
    )

    for (const [key, value] of updates) {
      await updateOption.mutateAsync({ key, value: value ?? '' })
    }
  }

  return (
    <SettingsSection title={t('Sensitive Words')}>
      <Form {...form}>
        <SettingsForm onSubmit={form.handleSubmit(onSubmit)}>
          <SettingsPageFormActions
            onSave={form.handleSubmit(onSubmit)}
            isSaving={updateOption.isPending}
            saveLabel='Save sensitive words'
          />

          <Alert data-settings-form-span='full' className='border-amber-200'>
            <AlertTriangle className='h-4 w-4 text-amber-600' />
            <AlertTitle>{t('Risk control reminder')}</AlertTitle>
            <AlertDescription>
              {t(
                'Matched requests are blocked before upstream forwarding. Administrator emails include the full prompt for audit, while user emails only contain compliance reminders.'
              )}
            </AlertDescription>
          </Alert>

          <div
            data-settings-form-span='full'
            className='grid min-w-0 gap-3 md:grid-cols-3'
          >
            <div className='border-border/70 bg-card min-w-0 rounded-lg border p-3'>
              <div className='flex items-center gap-2 text-sm font-medium'>
                <ShieldCheck className='text-primary size-4 shrink-0' />
                <span>{t('Prompt gate')}</span>
              </div>
              <p className='text-muted-foreground mt-1 text-xs'>
                {t('Scan user input before it reaches upstream channels.')}
              </p>
            </div>
            <div className='border-border/70 bg-card min-w-0 rounded-lg border p-3'>
              <div className='flex items-center gap-2 text-sm font-medium'>
                <Mail className='text-primary size-4 shrink-0' />
                <span>{t('Admin email audit')}</span>
              </div>
              <p className='text-muted-foreground mt-1 text-xs'>
                {t('Send complete risk details to the root administrator email.')}
              </p>
            </div>
            <div className='border-border/70 bg-card min-w-0 rounded-lg border p-3'>
              <div className='flex items-center gap-2 text-sm font-medium'>
                <Mail className='text-primary size-4 shrink-0' />
                <span>{t('User email')}</span>
              </div>
              <p className='text-muted-foreground mt-1 text-xs'>
                {t('Email the affected user after a request is blocked.')}
              </p>
            </div>
          </div>

          <div
            data-settings-form-span='full'
            className='border-border/70 bg-card min-w-0 rounded-lg border'
          >
            <div className='border-border/70 border-b px-4 py-3'>
              <h4 className='text-sm font-medium'>{t('Detection policy')}</h4>
              <p className='text-muted-foreground mt-1 text-xs'>
                {t('Control when prompt content is inspected and blocked.')}
              </p>
            </div>
            <div className='px-4'>
              <FormField
                control={form.control}
                name='CheckSensitiveEnabled'
                render={({ field }) => (
                  <SettingsSwitchItem>
                    <SettingsSwitchContent>
                      <FormLabel>{t('Enable filtering')}</FormLabel>
                      <FormDescription>
                        {t(
                          'Blocks messages when sensitive keywords are detected.'
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
                name='CheckSensitiveOnPromptEnabled'
                render={({ field }) => (
                  <SettingsSwitchItem>
                    <SettingsSwitchContent>
                      <FormLabel>{t('Inspect user prompts')}</FormLabel>
                      <FormDescription>
                        {t(
                          'When enabled, prompts are scanned before reaching upstream models.'
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
                name='SensitiveRiskScanEnabled'
                render={({ field }) => (
                  <SettingsSwitchItem>
                    <SettingsSwitchContent>
                      <FormLabel>{t('Enable intelligent risk scan')}</FormLabel>
                      <FormDescription>
                        {t(
                          'Combines normalized keyword matching, regex rules, and intent rules to detect illegal or abusive requests.'
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
            </div>
          </div>

          <div
            data-settings-form-span='full'
            className='border-border/70 bg-card min-w-0 rounded-lg border'
          >
            <div className='border-border/70 border-b px-4 py-3'>
              <h4 className='text-sm font-medium'>{t('Alert policy')}</h4>
              <p className='text-muted-foreground mt-1 text-xs'>
                {t(
                  'Choose who receives a notification when a prompt is blocked.'
                )}
              </p>
            </div>
            <div className='px-4'>
              <FormField
                control={form.control}
                name='SensitiveNotifyAdminEmailEnabled'
                render={({ field }) => (
                  <SettingsSwitchItem>
                    <SettingsSwitchContent>
                      <FormLabel>{t('Email administrator')}</FormLabel>
                      <FormDescription>
                        {t(
                          'Send the same complete risk audit content to the root administrator email address.'
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
                name='SensitiveNotifyUserEmailEnabled'
                render={({ field }) => (
                  <SettingsSwitchItem>
                    <SettingsSwitchContent>
                      <FormLabel>{t('Email affected user')}</FormLabel>
                      <FormDescription>
                        {t(
                          'Send a compliance reminder to the affected user by email after the request is blocked.'
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
            </div>
          </div>

          <FormField
            control={form.control}
            name='SensitiveWords'
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('Blocked keywords')}</FormLabel>
                <FormControl>
                  <Textarea
                    rows={12}
                    placeholder={t('Enter one keyword per line')}
                    {...field}
                  />
                </FormControl>
                <FormDescription>
                  {t(
                    'Each line represents one keyword. Leave blank to disable the list but keep the switch states.'
                  )}
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <div
            data-settings-form-span='full'
            className='border-border/70 bg-card min-w-0 rounded-lg border'
          >
            <div className='border-border/70 border-b px-4 py-3'>
              <h4 className='text-sm font-medium'>{t('Intelligent risk rules')}</h4>
              <p className='text-muted-foreground mt-1 text-xs'>
                {t(
                  'Intent rules use grouped terms. A rule blocks only when every group has at least one match.'
                )}
              </p>
            </div>
            <div className='grid gap-4 p-4'>
              <FormField
                control={form.control}
                name='SensitiveRiskThreshold'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Risk score threshold')}</FormLabel>
                    <FormControl>
                      <Input
                        type='number'
                        min={1}
                        max={1000}
                        step={1}
                        value={field.value}
                        onChange={(event) =>
                          field.onChange(Number(event.target.value))
                        }
                      />
                    </FormControl>
                    <FormDescription>
                      {t('Requests are blocked when the highest matched rule score reaches this threshold.')}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='SensitiveIntentRules'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Illegal intent rules')}</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={12}
                        placeholder={t('Rule name@score: term1|term2 + target1|target2')}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Use one rule per line. The plus sign separates required groups, and the vertical bar separates alternatives.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='SensitiveRegexRules'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Regex risk rules')}</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={8}
                        placeholder={t('Rule name@score: regular expression')}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'Use regex rules for credential leaks, private keys, and structured sensitive data.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name='SensitiveRiskAllowRules'
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>{t('Defensive context rules')}</FormLabel>
                    <FormControl>
                      <Textarea
                        rows={6}
                        placeholder={t('Rule name@score: defensive term + project term')}
                        {...field}
                      />
                    </FormControl>
                    <FormDescription>
                      {t(
                        'These rules reduce risk scores for authorized debugging, local project fixes, and defensive security work, but do not override hard illegal categories.'
                      )}
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
          </div>
        </SettingsForm>
      </Form>
    </SettingsSection>
  )
}
