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

// Page names reuse the navigation labels. Starters only ask about topics the
// customer knowledge base covers, so a suggested question never lands in the
// human queue for lack of sources.
export type PageContext = { prefix: string; label: string; starters: string[] }

const GENERAL = [
  'How do I start using the API?',
  'Which model should I choose?',
  'Why did my API request fail?',
]
const KEYS = [
  'How do I create an API key and choose a group?',
  'Why does my key say the model is unavailable?',
  'Can a key have a quota, expiry or IP limit?',
]
const LOGS = [
  'What do 401, 429 and 502 errors mean?',
  'How is token usage billed?',
  'What do the dots in the cost column mean?',
]
const WALLET = [
  'How do I top up my balance?',
  'I paid but my balance did not update.',
  'How does the recharge benefit work?',
]
const CHAT = [
  'Which model should I choose?',
  'How do I configure the base URL in my client?',
  'What do 401, 429 and 502 errors mean?',
]
const IMAGES = [
  'Which image model should I use?',
  'Which image sizes and resolutions are supported?',
  'How do I save or download generated images?',
]
const VIDEOS = [
  'How do video tasks work?',
  'How do I query and download a video task?',
  'Which video model should I use?',
]
const REWARDS = [
  'How do referral rewards work?',
  'How do I share my invitation link?',
  'How does the recharge benefit work?',
]
const DOCS = [
  'How do I make my first API call?',
  'How do I set up CC Switch?',
  'What is the advanced integration path?',
]
const PRICING = [
  'How is token usage billed?',
  'How are standard and long context billed?',
  'Which model should I choose?',
]

// The support console can replace these for the Chinese interface, page by page.
export const PAGES: PageContext[] = [
  { prefix: '/keys', label: 'API Keys', starters: KEYS },
  { prefix: '/usage-logs', label: 'Usage Logs', starters: LOGS },
  { prefix: '/image-logs', label: 'Image Logs', starters: IMAGES },
  { prefix: '/video-logs', label: 'Video Logs', starters: VIDEOS },
  { prefix: '/image-workbench', label: 'Image Workbench', starters: IMAGES },
  { prefix: '/video-workbench', label: 'Video Workbench', starters: VIDEOS },
  { prefix: '/wallet', label: 'Wallet', starters: WALLET },
  { prefix: '/topup-orders', label: 'Recharge Orders', starters: WALLET },
  { prefix: '/rewards/recharge', label: 'Recharge Benefit', starters: REWARDS },
  { prefix: '/rewards/referral', label: 'Referral rewards', starters: REWARDS },
  { prefix: '/playground', label: 'Model playground', starters: CHAT },
  { prefix: '/chat', label: 'Chat', starters: CHAT },
  { prefix: '/dashboard', label: 'Dashboard', starters: GENERAL },
  { prefix: '/profile', label: 'Profile', starters: GENERAL },
  { prefix: '/docs', label: 'Docs', starters: DOCS },
  { prefix: '/pricing', label: 'Pricing', starters: PRICING },
  { prefix: '/channels', label: 'Channels', starters: GENERAL },
  { prefix: '/users', label: 'Users', starters: GENERAL },
  { prefix: '/models', label: 'Models', starters: PRICING },
  { prefix: '/system-settings', label: 'System Settings', starters: GENERAL },
]

export function pageContext(pathname: string): PageContext | null {
  const page = PAGES.find(
    (item) => pathname === item.prefix || pathname.startsWith(`${item.prefix}/`)
  )
  return page ?? null
}

export const generalStarters = GENERAL
