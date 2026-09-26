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
import { Loader2 } from 'lucide-react'
import { useTranslation } from 'react-i18next'
import { SourcesRow } from './answer-extras'
import { AnswerMarkdown } from './answer-markdown'
import './answer.css'
import type { AgentRun } from './types'

// The answer while it is still being written. The service only sends text after
// the model has declared it supported by sources it actually retrieved.
export function StreamingAnswer(props: {
  runId: string
  partial: NonNullable<AgentRun['partial']>
}) {
  const { t } = useTranslation()
  // Same prefix as the finished turn, so citations keep pointing at the same sources.
  const prefix = `support-source-${props.runId}-`
  return (
    <div className='agent-answer' aria-busy='true'>
      <p className='agent-writing' role='status'>
        <Loader2 className='size-3.5 shrink-0 animate-spin' />
        {t('Writing the answer…')}
      </p>
      <AnswerMarkdown
        text={props.partial.answer}
        sources={props.partial.sources}
        prefix={prefix}
        streaming
      />
      <SourcesRow sources={props.partial.sources} prefix={prefix} />
    </div>
  )
}
