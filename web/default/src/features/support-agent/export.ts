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
import { getHistory } from './api'
import type { Turn } from './types'

export type ExportLabels = {
  you: string
  assistant: string
  support: string
  sources: string
}

function toMarkdown(title: string, turns: Turn[], labels: ExportLabels) {
  const lines = [`# ${title}`, '']
  for (const turn of turns) {
    const when = new Date(turn.created * 1000).toLocaleString()
    if (turn.question)
      lines.push(`**${labels.you}** · ${when}`, '', turn.question, '')
    const speaker = turn.response.human_reply
      ? labels.support
      : labels.assistant
    lines.push(`**${speaker}**`, '', turn.response.answer, '')
    if (turn.response.sources.length)
      lines.push(
        `${labels.sources}: ${turn.response.sources
          .map((source) => `[${source.number}] ${source.title}`)
          .join('; ')}`,
        ''
      )
    lines.push('---', '')
  }
  return lines.join('\n')
}

// Downloads the whole conversation as Markdown, paging back through history.
export async function exportConversation(
  conversation: string,
  title: string,
  labels: ExportLabels
) {
  const turns: Turn[] = []
  let before = ''
  do {
    const page = await getHistory(conversation, before)
    turns.unshift(...page.turns)
    before = page.next_before || ''
  } while (before)
  const url = URL.createObjectURL(
    new Blob([toMarkdown(title, turns, labels)], {
      type: 'text/markdown;charset=utf-8',
    })
  )
  const link = document.createElement('a')
  link.href = url
  link.download = `synthapi-conversation-${conversation}.md`
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
