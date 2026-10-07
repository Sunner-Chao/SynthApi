import { useEffect, useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { CheckCircle2, CreditCard, LockKeyhole, Save, Zap } from 'lucide-react'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import { getAlipayProfiles, saveAlipayProfile, activateAlipayProfile, type AlipayProfileConfigRequest } from '../api'
import type { AlipayProfileView } from '../types'
import { SettingsSection } from '../components/settings-section'

type ProfileDraft = AlipayProfileConfigRequest

function toDraft(profile: AlipayProfileView): ProfileDraft {
  return {
    id: profile.id,
    name: profile.name,
    enabled: profile.enabled,
    app_id: profile.app_id,
    seller_id: profile.seller_id,
    private_key: '',
    platform_public_key: '',
    sandbox: profile.sandbox,
    notify_url: profile.notify_url,
    return_url: profile.return_url,
    min_topup: profile.min_topup || 1,
  }
}

export function AlipayProfilesSection() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()
  const profilesQuery = useQuery({ queryKey: ['alipay-profiles'], queryFn: getAlipayProfiles })
  const [drafts, setDrafts] = useState<Record<string, ProfileDraft>>({})
  const saveMutation = useMutation({ mutationFn: saveAlipayProfile })
  const activateMutation = useMutation({ mutationFn: activateAlipayProfile })

  useEffect(() => {
    const profiles = profilesQuery.data?.data?.profiles ?? []
    setDrafts(Object.fromEntries(profiles.map((profile) => [profile.id, toDraft(profile)])))
  }, [profilesQuery.data])

  const updateDraft = (id: string, key: keyof ProfileDraft, value: string | boolean | number) => {
    setDrafts((current) => ({ ...current, [id]: { ...current[id], [key]: value } }))
  }

  const handleSave = async (draft: ProfileDraft) => {
    try {
      const result = await saveMutation.mutateAsync(draft)
      if (!result.success) throw new Error(result.message || t('Request failed'))
      toast.success(t('Alipay payment profile saved'))
      await queryClient.invalidateQueries({ queryKey: ['alipay-profiles'] })
      await queryClient.invalidateQueries({ queryKey: ['system-options'] })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('Request failed'))
    }
  }

  const handleActivate = async (id: string) => {
    if (!window.confirm(t('Switching payment profiles affects new orders. Existing orders keep their original profile. Continue?'))) return
    try {
      const result = await activateMutation.mutateAsync(id)
      if (!result.success) throw new Error(result.message || t('Request failed'))
      toast.success(t('Alipay payment profile activated'))
      await queryClient.invalidateQueries({ queryKey: ['alipay-profiles'] })
      await queryClient.invalidateQueries({ queryKey: ['system-options'] })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : t('Request failed'))
    }
  }

  const profiles = profilesQuery.data?.data?.profiles ?? []
  const active = profilesQuery.data?.data?.active_profile

  return (
    <SettingsSection title={t('Alipay payment profiles')}>
      <Alert>
        <CreditCard />
        <AlertTitle>{t('Two payment profiles with safe switching')}</AlertTitle>
        <AlertDescription>{t('The existing configuration is preserved. New orders use the active profile, while callbacks and status checks use the profile captured when each order was created.')}</AlertDescription>
      </Alert>
      <div className='grid gap-4 lg:grid-cols-2'>
        {profiles.map((profile) => {
          const draft = drafts[profile.id]
          if (!draft) return null
          const ready = profile.configuration_ready
          return (
            <Card key={profile.id}>
              <CardHeader>
                <div className='flex items-start justify-between gap-3'>
                  <div>
                    <CardTitle>{draft.name}</CardTitle>
                    <CardDescription>{profile.id === 'legacy' ? t('Existing Alipay configuration') : t('Secondary Alipay configuration')}</CardDescription>
                  </div>
                  <div className='flex gap-2'>
                    {active === profile.id && <Badge><CheckCircle2 data-icon='inline-start' />{t('Active')}</Badge>}
                    <Badge variant={ready ? 'secondary' : 'outline'}>{ready ? t('Ready') : t('Incomplete')}</Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className='flex flex-col gap-4'>
                <div className='grid gap-3 sm:grid-cols-2'>
                  <label className='flex flex-col gap-1.5'><Label>{t('Profile name')}</Label><Input value={draft.name} onChange={(event) => updateDraft(profile.id, 'name', event.target.value)} /></label>
                  <label className='flex flex-col gap-1.5'><Label>{t('App ID')}</Label><Input value={draft.app_id} onChange={(event) => updateDraft(profile.id, 'app_id', event.target.value)} /></label>
                  <label className='flex flex-col gap-1.5'><Label>{t('Seller ID')}</Label><Input value={draft.seller_id} onChange={(event) => updateDraft(profile.id, 'seller_id', event.target.value)} /></label>
                  <label className='flex flex-col gap-1.5'><Label>{t('Minimum top-up')}</Label><Input type='number' min='0.01' step='0.01' value={draft.min_topup} onChange={(event) => updateDraft(profile.id, 'min_topup', Number(event.target.value))} /></label>
                </div>
                <label className='flex flex-col gap-1.5'><Label>{t('Application private key')} {profile.private_key_configured && <span className='text-muted-foreground'>({t('configured; leave blank to keep')})</span>}</Label><Textarea rows={3} value={draft.private_key} onChange={(event) => updateDraft(profile.id, 'private_key', event.target.value)} autoComplete='new-password' /></label>
                <label className='flex flex-col gap-1.5'><Label>{t('Alipay platform public key')} {profile.platform_public_key_configured && <span className='text-muted-foreground'>({t('configured; leave blank to keep')})</span>}</Label><Textarea rows={3} value={draft.platform_public_key} onChange={(event) => updateDraft(profile.id, 'platform_public_key', event.target.value)} /></label>
                <div className='grid gap-3 sm:grid-cols-2'>
                  <label className='flex flex-col gap-1.5'><Label>{t('Notify URL')}</Label><Input value={draft.notify_url} onChange={(event) => updateDraft(profile.id, 'notify_url', event.target.value)} /></label>
                  <label className='flex flex-col gap-1.5'><Label>{t('Return URL')}</Label><Input value={draft.return_url} onChange={(event) => updateDraft(profile.id, 'return_url', event.target.value)} /></label>
                </div>
                <div className='flex items-center justify-between rounded-lg border p-3'><div className='flex flex-col gap-1'><div className='flex items-center gap-2'><Zap />{t('Alipay sandbox')}</div><span className='text-muted-foreground text-xs'>{t('Use the official sandbox gateway for testing')}</span></div><Switch checked={draft.sandbox} onCheckedChange={(checked) => updateDraft(profile.id, 'sandbox', checked)} /></div>
                <div className='flex items-center justify-between rounded-lg border p-3'><div className='flex items-center gap-2'><Zap />{t('Enable this profile')}</div><Switch checked={draft.enabled} onCheckedChange={(checked) => updateDraft(profile.id, 'enabled', checked)} /></div>
                <div className='flex items-center gap-2 text-muted-foreground text-xs'><LockKeyhole />{t('Private keys are never returned by the API.')}</div>
              </CardContent>
              <Separator />
              <CardFooter className='justify-between gap-2'><Button type='button' variant='outline' onClick={() => handleSave(draft)} disabled={saveMutation.isPending}><Save data-icon='inline-start' />{t('Save profile')}</Button><Button type='button' onClick={() => handleActivate(profile.id)} disabled={active === profile.id || !ready || !draft.enabled || activateMutation.isPending}>{t('Activate')}</Button></CardFooter>
            </Card>
          )
        })}
      </div>
    </SettingsSection>
  )
}
