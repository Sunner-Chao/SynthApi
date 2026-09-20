import { Link, useLocation } from '@tanstack/react-router'
import { Gift, Sparkles } from 'lucide-react'
import {
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'

export function AdminRewardSidebarPanel() {
  const pathname = useLocation({ select: (location) => location.pathname })
  const { setOpenMobile } = useSidebar()

  // The admin hostname is the presentation boundary. Both links below are
  // protected by AdminAuth/RootAuth on the server, so a stale browser role
  // must not make the admin portal navigation disappear during hydration.
  const isAdminPortal =
    typeof window !== 'undefined' &&
    window.location.hostname === 'admin.synthapi.asia'

  if (!isAdminPortal) return null

  return (
    <SidebarHeader className='admin-reward-sidebar-panel border-sidebar-border border-b px-2 py-2.5'>
      <div className='admin-reward-sidebar-label flex items-center justify-between gap-2 px-2 pb-1.5'>
        <span className='flex min-w-0 items-center gap-1.5 truncate text-[10px] font-bold'>
          <Sparkles className='size-3 shrink-0' aria-hidden='true' />
          福利运营舱
        </span>
        <span className='admin-reward-live'>LIVE</span>
      </div>
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton
            isActive={pathname === '/rewards/admin'}
            tooltip='福利中心管理'
            className='sidebar-reward-link sidebar-reward-link--persistent'
            render={
              <Link
                to='/rewards/admin'
                onClick={() => setOpenMobile(false)}
              />
            }
          >
            <Gift className='size-4 shrink-0' aria-hidden='true' />
            <span className='min-w-0 flex-1'>
              <strong className='block truncate text-xs'>福利中心管理</strong>
              <small className='admin-reward-sidebar-note block truncate'>
                申请审核与用户福利
              </small>
            </span>
            <span className='sidebar-reward-badge shrink-0 rounded px-1.5 text-[10px] font-bold'>
              ADMIN
            </span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </SidebarHeader>
  )
}
