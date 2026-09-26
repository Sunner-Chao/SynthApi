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
import { useEffect, useSyncExternalStore } from 'react'

// The page keeps at least this much room next to a docked panel (the top
// navigation needs about this much to stay on one line); below that the panel
// covers the page as before. In practice: docked on 1920px screens, not on laptops.
const MIN_PAGE_WIDTH = 1120
const DOCKED_CLASS = 'support-docked'
const DOCK_VAR = '--support-dock'

const subscribe = (onChange: () => void) => {
  window.addEventListener('resize', onChange)
  return () => window.removeEventListener('resize', onChange)
}
const viewportWidth = () => window.innerWidth

// On wide screens the signed-in layout makes room for the panel (styles.css),
// so the page stays usable beside it instead of sitting under it.
export function useDocking(panelWidth: number) {
  const viewport = useSyncExternalStore(subscribe, viewportWidth, () => 0)
  const docked = viewport - panelWidth >= MIN_PAGE_WIDTH
  useEffect(() => {
    if (!docked) return
    const root = document.documentElement
    root.classList.add(DOCKED_CLASS)
    root.style.setProperty(DOCK_VAR, `${panelWidth}px`)
    return () => {
      root.classList.remove(DOCKED_CLASS)
      root.style.removeProperty(DOCK_VAR)
    }
  }, [docked, panelWidth])
  return docked
}
