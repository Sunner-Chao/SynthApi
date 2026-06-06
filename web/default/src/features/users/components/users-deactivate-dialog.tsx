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
import { manageUser } from '../api'
import { ERROR_MESSAGES } from '../constants'
import { useUsers } from './users-provider'

export function UsersDeactivateDialog() {
  const { t } = useTranslation()
  const { open, setOpen, currentRow, triggerRefresh } = useUsers()
  const [isDeactivating, setIsDeactivating] = useState(false)

  const handleDeactivate = async () => {
    if (!currentRow) return

    setIsDeactivating(true)
    try {
      const result = await manageUser(currentRow.id, 'delete')
      if (result.success) {
        toast.success(t('User deactivated successfully'))
        setOpen(null)
        triggerRefresh()
      } else {
        toast.error(result.message || t('Failed to deactivate user'))
      }
    } catch (_error) {
      toast.error(t(ERROR_MESSAGES.UNEXPECTED))
    } finally {
      setIsDeactivating(false)
    }
  }

  return (
    <AlertDialog
      open={open === 'deactivate'}
      onOpenChange={(open) => !open && setOpen(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('Deactivate User')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('This will deactivate user')}{' '}
            <span className='font-semibold'>{currentRow?.username}</span>
            {t('. The user will not be able to log in.')}{' '}
            <span className='text-muted-foreground'>
              {t(
                'You can permanently remove them later from the user management page.'
              )}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeactivating}>
            {t('Cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleDeactivate}
            disabled={isDeactivating}
            className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
          >
            {isDeactivating ? t('Deactivating...') : t('Deactivate')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
