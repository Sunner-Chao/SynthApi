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
import { SidebarInset, SidebarProvider } from '@/components/ui/sidebar'
import { AnimatedOutlet } from '@/components/page-transition'
import { RewardBenefitNotice } from '@/components/reward-benefit-notice'
import { SkipToMain } from '@/components/skip-to-main'
import '@/features/reward-center/experience.css'
import { SupportAgentRoot } from '@/features/support-agent'
import { AppHeader } from './app-header'
import { AppSidebar } from './app-sidebar'

type AuthenticatedLayoutProps = {
  children?: React.ReactNode
}

export function AuthenticatedLayout(props: AuthenticatedLayoutProps) {
  const isAdminPortal =
    typeof window !== 'undefined' &&
    window.location.hostname === 'admin.synthapi.asia'
  // The administrator portal has a dedicated operations entry at the top of
  // the sidebar. Do not let a stale per-subdomain collapsed-state cookie hide
  // that entry on the management host.
  const defaultOpen = isAdminPortal || getCookie('sidebar_state') !== 'false'
  const pathname = useLocation({ select: (location) => location.pathname })
  const normalizedPathname = pathname.replace(/\/+$/, '')
  const isImmersive =
    normalizedPathname === '/usage-logs/common' ||
    normalizedPathname === '/intelligence-radar' ||
    normalizedPathname === '/rewards/referral' ||
    normalizedPathname === '/rewards/recharge'
  let rewardScene: 'referral' | 'recharge' | undefined
  if (normalizedPathname === '/rewards/referral') {
    rewardScene = 'referral'
  } else if (normalizedPathname === '/rewards/recharge') {
    rewardScene = 'recharge'
  }
  const isImageWorkbench = normalizedPathname === '/image-workbench'

  return (
    <LayoutProvider>
      <SearchProvider>
        <SidebarProvider
          defaultOpen={defaultOpen}
          className={cn('flex-col', rewardScene && 'reward-experience')}
          data-reward-scene={rewardScene}
        >
          <SkipToMain />
          <SupportAgentRoot />
          <RewardBenefitNotice />
          {isImageWorkbench ? (
            <div className='flex h-svh min-h-0 w-full flex-1 overflow-hidden'>
              <AppSidebar />
              <main className='relative flex h-svh min-h-0 min-w-0 flex-1 flex-col overflow-hidden'>
                {props.children ?? <AnimatedOutlet />}
              </main>
            </div>
          ) : isImmersive ? (
            <>
              <AppHeader />
              <div className='flex min-h-0 w-full flex-1'>
                <AppSidebar />
                <SidebarInset className='@container/content min-h-0 overflow-hidden'>
                  {props.children ?? <AnimatedOutlet />}
                </SidebarInset>
              </div>
            </>
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
