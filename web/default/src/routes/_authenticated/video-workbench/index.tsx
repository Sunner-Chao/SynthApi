import { createFileRoute } from '@tanstack/react-router'
import { VideoWorkbench } from '@/features/video-workbench'

export const Route = createFileRoute('/_authenticated/video-workbench/')({
  component: VideoWorkbench,
})
