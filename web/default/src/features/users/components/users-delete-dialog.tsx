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
import { deleteUser } from '../api'
import { ERROR_MESSAGES, isUserDeleted } from '../constants'
import { getUserActionMessage } from '../lib'
import { useUsers } from './users-provider'

export function UsersDeleteDialog() {
  const { t } = useTranslation()
  const { open, setOpen, currentRow, triggerRefresh } = useUsers()
  const [isDeleting, setIsDeleting] = useState(false)

  // 判断用户是否已注销（软删除）
  const isDeleted = currentRow ? isUserDeleted(currentRow) : false

  // 硬删除（仅用于已注销用户）
  const handleHardDelete = async () => {
    if (!currentRow) return

    setIsDeleting(true)
    try {
      const result = await deleteUser(currentRow.id)
      if (result.success) {
        toast.success(t('User permanently removed'))
        setOpen(null)
        triggerRefresh()
      } else {
        toast.error(result.message || t(ERROR_MESSAGES.DELETE_FAILED))
      }
    } catch (_error) {
      toast.error(t(ERROR_MESSAGES.UNEXPECTED))
    } finally {
      setIsDeleting(false)
    }
  }

  // 这个对话框仅用于已注销用户的硬删除
  // 正常用户的注销操作在 data-table-row-actions.tsx 中直接调用 manageUser API
  if (!isDeleted) {
    return null
  }

  return (
    <AlertDialog
      open={open === 'delete'}
      onOpenChange={(open) => !open && setOpen(null)}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t('Remove Deactivated User')}</AlertDialogTitle>
          <AlertDialogDescription>
            {t('This will permanently remove deactivated user')}{' '}
            <span className='font-semibold'>{currentRow?.username}</span>
            {t(' from the database.')}{' '}
            <span className='font-medium text-orange-600'>
              {t('This will free up the email/username for re-registration.')}
            </span>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isDeleting}>
            {t('Cancel')}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={handleHardDelete}
            disabled={isDeleting}
            className='bg-orange-600 text-white hover:bg-orange-700'
          >
            {isDeleting ? t('Removing...') : t('Remove Permanently')}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
