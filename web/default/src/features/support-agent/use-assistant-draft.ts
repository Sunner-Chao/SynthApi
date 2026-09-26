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

export type AssistantDraft = {
  text: string
  target: 'image' | 'video'
  applied: boolean
}
export function useAssistantDraft(
  target: 'image' | 'video',
  apply: (text: string) => void,
  disabled: boolean
) {
  useEffect(() => {
    const listener = (event: Event) => {
      if (!(event instanceof CustomEvent) || disabled) return
      const detail = event.detail as AssistantDraft
      if (
        detail?.target !== target ||
        typeof detail.text !== 'string' ||
        !detail.text.trim() ||
        detail.text.length > 3000
      )
        return
      apply(detail.text)
      detail.applied = true
    }
    window.addEventListener('synthapi:assistant-draft', listener)
    return () =>
      window.removeEventListener('synthapi:assistant-draft', listener)
  }, [target, apply, disabled])
}
