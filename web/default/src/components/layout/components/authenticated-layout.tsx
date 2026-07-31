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
import { useLocation } from '@tanstack/react-router'
import { getCookie } from '@/lib/cookies'
import { cn } from '@/lib/utils'
import { LayoutProvider } from '@/context/layout-provider'
import { SearchProvider } from '@/context/search-provider'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { AnimatedOutlet } from '@/components/page-transition'
import { SkipToMain } from '@/components/skip-to-main'
import { AppHeader } from './app-header'
import { AppSidebar } from './app-sidebar'

type AuthenticatedLayoutProps = {
  children?: React.ReactNode
}

export function AuthenticatedLayout(props: AuthenticatedLayoutProps) {
  const defaultOpen = getCookie('sidebar_state') !== 'false'
  const pathname = useLocation({ select: (location) => location.pathname })
  const isCommonLogsImmersive =
    pathname.replace(/\/+$/, '') === '/usage-logs/common'

  return (
    <LayoutProvider>
      <SearchProvider>
        <SidebarProvider defaultOpen={defaultOpen} className='flex-col'>
          <SkipToMain />
          {isCommonLogsImmersive ? (
            <div className='flex h-svh min-h-0 w-full flex-1 overflow-hidden'>
              <AppSidebar />
              <main className='@container/content relative flex h-svh min-h-0 min-w-0 flex-1 flex-col overflow-hidden'>
                <SidebarTrigger
                  variant='ghost'
                  className='bg-background/80 hover:bg-accent absolute top-3 left-3 z-50 size-8 border shadow-sm backdrop-blur-sm'
                />
                {props.children ?? <AnimatedOutlet />}
              </main>
            </div>
          ) : (
            <>
              <AppHeader />
              <div className='flex min-h-0 w-full flex-1'>
                <AppSidebar />
                <SidebarInset
                  className={cn(
                    '@container/content',
                    'h-[calc(100svh-var(--app-header-height,0px))]',
                    'min-h-0 overflow-hidden',
                    'peer-data-[variant=inset]:h-[calc(100svh-var(--app-header-height,0px)-(var(--spacing)*4))]'
                  )}
                >
                  {props.children ?? <AnimatedOutlet />}
                </SidebarInset>
              </div>
            </>
          )}
        </SidebarProvider>
      </SearchProvider>
    </LayoutProvider>
  )
}
