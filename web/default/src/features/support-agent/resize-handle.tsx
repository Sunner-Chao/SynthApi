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
import { PANEL_WIDTH, PANEL_WIDTH_VAR } from './storage'

// Keep some of the page visible next to the panel.
const limit = (value: number) =>
  Math.round(
    Math.min(
      Math.max(value, PANEL_WIDTH.min),
      Math.min(PANEL_WIDTH.max, window.innerWidth - 240)
    )
  )

// The panel's left edge: drag it, or focus it and use the arrow keys, to change
// the width; double-click restores the default. While dragging only the CSS
// variable changes, so the conversation is not re-rendered on every move.
export function ResizeHandle(props: {
  width: number
  onCommit: (width: number) => void
}) {
  const { t } = useTranslation()
  // The panel can close mid-drag (Escape, a notification); never leave the page
  // stuck with the resize cursor and text selection turned off.
  useEffect(
    () => () => document.documentElement.classList.remove('agent-resizing'),
    []
  )
  return (
    <div
      role='separator'
      aria-orientation='vertical'
      aria-label={t('Resize panel')}
      aria-valuemin={PANEL_WIDTH.min}
      aria-valuemax={PANEL_WIDTH.max}
      aria-valuenow={props.width}
      tabIndex={0}
      className='agent-resize-handle'
      onPointerDown={(event) => {
        if (event.button !== 0) return
        event.preventDefault()
        const handle = event.currentTarget
        const panel = handle.closest<HTMLElement>('.support-agent-panel')
        let width = props.width
        const move = (next: PointerEvent) => {
          width = limit(window.innerWidth - next.clientX)
          panel?.style.setProperty(PANEL_WIDTH_VAR, `${width}px`)
        }
        const end = () => {
          handle.removeEventListener('pointermove', move)
          handle.removeEventListener('pointerup', end)
          handle.removeEventListener('pointercancel', end)
          document.documentElement.classList.remove('agent-resizing')
          props.onCommit(width)
        }
        handle.setPointerCapture(event.pointerId)
        handle.addEventListener('pointermove', move)
        handle.addEventListener('pointerup', end)
        handle.addEventListener('pointercancel', end)
        document.documentElement.classList.add('agent-resizing')
      }}
      onKeyDown={(event) => {
        const step = event.shiftKey ? 80 : 24
        if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
        event.preventDefault()
        props.onCommit(
          limit(props.width + (event.key === 'ArrowLeft' ? step : -step))
        )
      }}
      onDoubleClick={() => props.onCommit(PANEL_WIDTH.normal)}
    />
  )
}
