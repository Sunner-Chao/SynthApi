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
import { Link } from '@tanstack/react-router'
import { ChartNoAxesCombined, KeyRound, Network, ServerCog } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { useSystemConfig } from '@/hooks/use-system-config'
import { Skeleton } from '@/components/ui/skeleton'

type AuthLayoutProps = {
  children: React.ReactNode
}

export function AuthLayout({ children }: AuthLayoutProps) {
  const { t } = useTranslation()
  const { systemName, logo, loading } = useSystemConfig()

  return (
    <div data-slot='auth-layout' className='relative grid h-svh max-w-none'>
      <div data-slot='auth-stage' className='flex items-center px-4 py-5'>
        <div
          data-slot='auth-shell'
          className='mx-auto flex w-full overflow-hidden'
        >
          <section data-slot='auth-showcase' aria-hidden='true'>
            <div data-slot='auth-showcase-brand'>
              {loading ? (
                <Skeleton className='size-8 rounded-md' />
              ) : (
                <img src={logo} alt='' className='size-8 object-cover' />
              )}
              <span>{loading ? 'SynthAPI' : systemName}</span>
            </div>
            <div data-slot='auth-showcase-visual'>
              <span data-node='network'>
                <Network />
              </span>
              <span data-node='key'>
                <KeyRound />
              </span>
              <span data-node='core'>
                {loading ? (
                  <ServerCog />
                ) : (
                  <img src={logo} alt='' className='size-full object-cover' />
                )}
              </span>
              <span data-node='server'>
                <ServerCog />
              </span>
              <span data-node='chart'>
                <ChartNoAxesCombined />
              </span>
            </div>
          </section>

          <div data-slot='auth-panel' className='flex w-full flex-col'>
            <Link
              to='/'
              data-slot='auth-brand'
              className='flex items-center gap-2 transition-opacity hover:opacity-80'
            >
              <div className='relative size-8 shrink-0'>
                {loading ? (
                  <Skeleton className='absolute inset-0 rounded-md' />
                ) : (
                  <img
                    src={logo}
                    alt={t('Logo')}
                    className='size-8 rounded-md object-cover'
                  />
                )}
              </div>
              {loading ? (
                <Skeleton className='h-6 w-24' />
              ) : (
                <h1 className='truncate text-xl font-semibold'>{systemName}</h1>
              )}
            </Link>
            <div data-slot='auth-form-content'>{children}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
