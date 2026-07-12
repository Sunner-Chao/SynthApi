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
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { ensureUnlimitedPlanPresets } from '../api'
import { useSubscriptions } from './subscriptions-provider'

export function SubscriptionsPrimaryButtons() {
  const { t } = useTranslation()
  const { setOpen, complianceConfirmed, triggerRefresh } = useSubscriptions()
  const [ensuringPresets, setEnsuringPresets] = useState(false)

  const handleEnsureUnlimitedPresets = async () => {
    setEnsuringPresets(true)
    try {
      const res = await ensureUnlimitedPlanPresets()
      if (res.success) {
        toast.success(t('Unlimited plans are ready'))
        triggerRefresh()
      } else {
        toast.error(res.message || t('Request failed'))
      }
    } catch {
      toast.error(t('Request failed'))
    } finally {
      setEnsuringPresets(false)
    }
  }

  return (
    <div className='flex gap-2'>
      <Button
        size='sm'
        variant='outline'
        onClick={handleEnsureUnlimitedPresets}
        disabled={!complianceConfirmed || ensuringPresets}
      >
        <Plus className='h-4 w-4' />
        {t('Add Unlimited Plans')}
      </Button>
      <Button
        size='sm'
        onClick={() => setOpen('create')}
        disabled={!complianceConfirmed}
      >
        <Plus className='h-4 w-4' />
        {t('Create Plan')}
      </Button>
    </div>
  )
}
