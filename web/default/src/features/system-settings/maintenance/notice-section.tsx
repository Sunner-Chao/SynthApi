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
import { useEffect, useMemo, useState } from 'react'
import * as z from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { Eye, Megaphone, Save, Trash2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Markdown } from '@/components/ui/markdown'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { SettingsSection } from '../components/settings-section'
import { useUpdateOption } from '../hooks/use-update-option'

const MAX_NOTICE_LENGTH = 2000

const noticeSchema = z.object({
  Notice: z
    .string()
    .max(MAX_NOTICE_LENGTH, 'Notice must be less than 2000 characters')
    .optional(),
})

type NoticeFormValues = z.infer<typeof noticeSchema>

type NoticeSectionProps = {
  defaultValue: string
}

export function NoticeSection({ defaultValue }: NoticeSectionProps) {
  const { t } = useTranslation()
  const updateOption = useUpdateOption()
  const [showPreview, setShowPreview] = useState(false)
  const [showClearDialog, setShowClearDialog] = useState(false)

  const form = useForm<NoticeFormValues>({
    resolver: zodResolver(noticeSchema),
    defaultValues: {
      Notice: defaultValue ?? '',
    },
  })

  useEffect(() => {
    form.reset({ Notice: defaultValue ?? '' })
  }, [defaultValue, form])

  const notice = form.watch('Notice') ?? ''
  const trimmedNotice = notice.trim()
  const isDirty = form.formState.isDirty
  const characterCount = notice.length
  const isNearLimit = characterCount > MAX_NOTICE_LENGTH * 0.9

  const statusLabel = useMemo(() => {
    if (trimmedNotice.length === 0) {
      return t('Not published')
    }
    return t('Published')
  }, [t, trimmedNotice.length])

  const onSubmit = async (values: NoticeFormValues) => {
    const normalized = values.Notice ?? ''
    if (normalized === (defaultValue ?? '')) {
      return
    }

    try {
      await updateOption.mutateAsync({
        key: 'Notice',
        value: normalized,
      })
      form.reset({ Notice: normalized })
      toast.success(t('Notice saved successfully'))
    } catch {
      toast.error(t('Failed to save notice'))
    }
  }

  const handleClearNotice = () => {
    form.setValue('Notice', '', {
      shouldDirty: true,
      shouldTouch: true,
      shouldValidate: true,
    })
    setShowClearDialog(false)
  }

  return (
    <SettingsSection title={t('System Notice')}>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)}>
          <Card className='border-border/70 shadow-sm'>
            <CardHeader className='border-b bg-muted/20'>
              <div className='flex items-start gap-3'>
                <div className='flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary'>
                  <Megaphone className='size-5' />
                </div>
                <div className='min-w-0 space-y-1'>
                  <CardTitle>{t('Platform Notice')}</CardTitle>
                  <CardDescription>
                    {t(
                      'Edit the site-wide notice shown to users. Leave it empty to hide the notice.'
                    )}
                  </CardDescription>
                </div>
              </div>
              <CardAction>
                <Badge
                  variant={trimmedNotice.length > 0 ? 'success' : 'neutral'}
                  className='whitespace-nowrap'
                >
                  {statusLabel}
                </Badge>
              </CardAction>
            </CardHeader>

            <CardContent className='space-y-4 pt-4'>
              <FormField
                control={form.control}
                name='Notice'
                render={({ field }) => (
                  <FormItem>
                    <div className='flex flex-wrap items-center justify-between gap-2'>
                      <FormLabel>{t('Notice Content')}</FormLabel>
                      <Button
                        type='button'
                        variant='ghost'
                        size='sm'
                        onClick={() => setShowPreview((value) => !value)}
                        className='h-8 gap-1.5 px-2'
                      >
                        <Eye className='size-3.5' />
                        {showPreview ? t('Hide Preview') : t('Show Preview')}
                      </Button>
                    </div>

                    {showPreview ? (
                      <div className='min-h-44 rounded-lg border bg-background p-4'>
                        {trimmedNotice.length > 0 ? (
                          <div className='prose prose-sm dark:prose-invert max-w-none text-foreground'>
                            <Markdown>{notice}</Markdown>
                          </div>
                        ) : (
                          <div className='flex min-h-36 items-center justify-center text-sm text-muted-foreground'>
                            {t('No notice content to preview')}
                          </div>
                        )}
                      </div>
                    ) : (
                      <FormControl>
                        <Textarea
                          rows={9}
                          placeholder={t(
                            'Planned maintenance on Friday at 22:00 UTC...'
                          )}
                          className='min-h-56 resize-y text-sm leading-6'
                          {...field}
                        />
                      </FormControl>
                    )}

                    <div className='flex flex-wrap items-center justify-between gap-2 text-xs'>
                      <span
                        className={cn(
                          isNearLimit
                            ? 'text-destructive'
                            : 'text-muted-foreground'
                        )}
                      >
                        {characterCount.toLocaleString()} /{' '}
                        {MAX_NOTICE_LENGTH.toLocaleString()}
                      </span>
                      <span className='text-muted-foreground'>
                        {t('Markdown supported')}
                      </span>
                    </div>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>

            <CardFooter className='flex flex-wrap justify-between gap-2'>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => setShowClearDialog(true)}
                disabled={notice.length === 0 || updateOption.isPending}
                className='gap-1.5'
              >
                <Trash2 className='size-3.5' />
                {t('Clear Notice')}
              </Button>
              <Button
                type='submit'
                size='sm'
                disabled={!isDirty || updateOption.isPending}
                className='gap-1.5'
              >
                <Save className='size-3.5' />
                {updateOption.isPending ? t('Saving...') : t('Save Notice')}
              </Button>
            </CardFooter>
          </Card>
        </form>
      </Form>

      <AlertDialog open={showClearDialog} onOpenChange={setShowClearDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('Clear Notice?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                'This will remove the current platform notice. Click save to publish the empty notice.'
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleClearNotice}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
            >
              {t('Clear')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </SettingsSection>
  )
}
