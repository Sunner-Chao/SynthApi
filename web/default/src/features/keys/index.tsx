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
import { useTranslation } from 'react-i18next'
import { SectionPageLayout } from '@/components/layout'
import { ApiKeysDialogs } from './components/api-keys-dialogs'
import { ApiKeysPrimaryButtons } from './components/api-keys-primary-buttons'
import { ApiKeysProvider, useApiKeys } from './components/api-keys-provider'
import { ApiKeysTable } from './components/api-keys-table'

type ApiKeysProps = {
  initialCreate?: boolean
  initialGroup?: string
}

function ApiKeysContent({
  initialCreate = false,
  initialGroup = '',
}: ApiKeysProps) {
  const { t } = useTranslation()
  const { setOpen, setPreferredGroup } = useApiKeys()

  useEffect(() => {
    if (!initialCreate) return

    setPreferredGroup(initialGroup.trim())
    setOpen('create')
  }, [initialCreate, initialGroup, setOpen, setPreferredGroup])

  return (
    <>
      <SectionPageLayout>
        <SectionPageLayout.Title>{t('API Keys')}</SectionPageLayout.Title>
        <SectionPageLayout.Actions>
          <ApiKeysPrimaryButtons />
        </SectionPageLayout.Actions>
        <SectionPageLayout.Content>
          <ApiKeysTable />
        </SectionPageLayout.Content>
      </SectionPageLayout>

      <ApiKeysDialogs />
    </>
  )
}

export function ApiKeys(props: ApiKeysProps) {
  return (
    <ApiKeysProvider>
      <ApiKeysContent {...props} />
    </ApiKeysProvider>
  )
}
