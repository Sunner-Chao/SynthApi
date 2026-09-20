import { createFileRoute, redirect } from '@tanstack/react-router'
export const Route = createFileRoute('/console/r2-monitor')({
  beforeLoad: () => { throw redirect({ to: '/r2-monitor' }) },
})
