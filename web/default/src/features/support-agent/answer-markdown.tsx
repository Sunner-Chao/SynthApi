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
import { memo } from 'react'
import { ExternalLink } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { cn } from '@/lib/utils'
import { isPlainClick, resolveLink, useOpenInternal } from './links'
import type { Source } from './types'

// Convert verified numeric references in prose, without touching code or links.
interface MarkdownNode {
  type: string
  value?: string
  url?: string
  children?: MarkdownNode[]
}
function citationPlugin(validNumbers: Set<number>, prefix: string) {
  return () => (tree: MarkdownNode) => {
    const walk = (node: MarkdownNode) => {
      if (
        !node.children ||
        ['link', 'linkReference', 'code', 'inlineCode'].includes(node.type)
      )
        return
      node.children = node.children.flatMap((child) => {
        if (child.type !== 'text' || !child.value) {
          walk(child)
          return [child]
        }
        const parts: MarkdownNode[] = []
        let cursor = 0
        for (const match of child.value.matchAll(/\[(\d{1,3})\]/g)) {
          if (!validNumbers.has(Number(match[1]))) continue
          const start = match.index
          if (start > cursor)
            parts.push({
              type: 'text',
              value: child.value.slice(cursor, start),
            })
          parts.push({
            type: 'link',
            url: `#${prefix}${match[1]}`,
            children: [{ type: 'text', value: match[1] }],
          })
          cursor = start + match[0].length
        }
        if (cursor < child.value.length)
          parts.push({ type: 'text', value: child.value.slice(cursor) })
        return parts
      })
    }
    walk(tree)
  }
}

function focusSource(id: string) {
  const target = document.getElementById(id)
  target?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  target?.focus({ preventScroll: true })
}

// Markdown of an answer: [n] become links to its sources, site links stay in the app.
// Memoised: the panel re-renders on every poll while an answer is written, and
// finished answers should not be parsed again each time.
export const AnswerMarkdown = memo(function AnswerMarkdown(props: {
  text: string
  sources: Source[]
  prefix: string
  streaming?: boolean
}) {
  const { t } = useTranslation()
  const open = useOpenInternal()
  const titles = new Map(
    props.sources.map((source) => [String(source.number), source.title])
  )
  return (
    <div className={cn('agent-markdown', props.streaming && 'is-streaming')}>
      <ReactMarkdown
        remarkPlugins={[
          remarkGfm,
          citationPlugin(
            new Set(props.sources.map((source) => source.number)),
            props.prefix
          ),
        ]}
        components={{
          a: ({ href, children }) => {
            if (href?.startsWith(`#${props.prefix}`)) {
              const number = href.slice(props.prefix.length + 1)
              return (
                <a
                  href={href}
                  className='agent-citation'
                  title={titles.get(number)}
                  aria-label={t('Source {{number}}', { number })}
                  onClick={(event) => {
                    event.preventDefault()
                    focusSource(href.slice(1))
                  }}
                >
                  {children}
                </a>
              )
            }
            const target = resolveLink(href)
            if (!target) return <span>{children}</span>
            if (target.kind === 'external')
              return (
                <a
                  href={target.href}
                  className='agent-link'
                  target='_blank'
                  rel='noopener noreferrer'
                >
                  {children}
                  <ExternalLink className='agent-link-icon' />
                </a>
              )
            return (
              <a
                href={target.href}
                className='agent-link'
                onClick={(event) => {
                  if (!isPlainClick(event)) return
                  event.preventDefault()
                  open(target.href)
                }}
              >
                {children}
              </a>
            )
          },
          table: (tableProps) => (
            <div className='agent-table-scroll'>
              <table {...tableProps} />
            </div>
          ),
        }}
      >
        {props.text}
      </ReactMarkdown>
    </div>
  )
})
