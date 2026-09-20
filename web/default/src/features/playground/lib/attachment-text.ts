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
import type { PlaygroundAttachment } from '../types'

const MAX_EXTRACTED_TEXT_CHARS = 40_000
const MAX_ATTACHMENT_TEXT_BLOCK_CHARS = 80_000
const MAX_WORKSHEET_ROWS = 500
const MAX_WORKSHEET_COLS = 60

const TEXT_EXTENSIONS = new Set([
  'txt',
  'md',
  'markdown',
  'csv',
  'tsv',
  'json',
  'jsonl',
  'yaml',
  'yml',
  'xml',
  'html',
  'htm',
  'css',
  'scss',
  'less',
  'js',
  'jsx',
  'ts',
  'tsx',
  'mjs',
  'cjs',
  'py',
  'go',
  'java',
  'c',
  'cc',
  'cpp',
  'h',
  'hpp',
  'cs',
  'rs',
  'php',
  'rb',
  'swift',
  'kt',
  'kts',
  'sql',
  'sh',
  'bash',
  'zsh',
  'ps1',
  'toml',
  'ini',
  'conf',
  'log',
])

export function attachmentExtension(name: string): string {
  const match = /\.([^.]+)$/.exec(name.trim().toLowerCase())
  return match?.[1] || ''
}

export function supportsTextExtraction(file: File): boolean {
  const ext = attachmentExtension(file.name)
  const type = file.type.toLowerCase()
  return (
    file.type.startsWith('text/') ||
    TEXT_EXTENSIONS.has(ext) ||
    ext === 'pdf' ||
    ext === 'docx' ||
    ext === 'xlsx' ||
    ext === 'xls' ||
    type.includes('pdf') ||
    type.includes('wordprocessingml.document') ||
    type.includes('spreadsheetml.sheet') ||
    type.includes('ms-excel')
  )
}

export async function extractAttachmentText(file: File): Promise<{
  text: string
  status: PlaygroundAttachment['extractionStatus']
  error?: string
}> {
  try {
    const ext = attachmentExtension(file.name)
    const type = file.type.toLowerCase()

    if (file.type.startsWith('text/') || TEXT_EXTENSIONS.has(ext)) {
      return {
        text: limitExtractedText(await file.text()),
        status: 'ready',
      }
    }

    if (ext === 'pdf' || type.includes('pdf')) {
      return {
        text: limitExtractedText(await extractPdfText(file)),
        status: 'ready',
      }
    }

    if (ext === 'docx' || type.includes('wordprocessingml.document')) {
      return {
        text: limitExtractedText(await extractDocxText(file)),
        status: 'ready',
      }
    }

    if (
      ext === 'xlsx' ||
      ext === 'xls' ||
      type.includes('spreadsheetml.sheet') ||
      type.includes('ms-excel')
    ) {
      return {
        text: limitExtractedText(await extractWorkbookText(file)),
        status: 'ready',
      }
    }

    return {
      text: '',
      status: 'unsupported',
      error: 'Unsupported file type',
    }
  } catch (error) {
    return {
      text: '',
      status: 'failed',
      error: error instanceof Error ? error.message : String(error || 'Unknown error'),
    }
  }
}

export function buildAttachmentTextBlock(
  attachments: PlaygroundAttachment[]
): string {
  const blocks = attachments
    .filter((item) => item.kind === 'file')
    .map((item, index) => {
      if (item.extractedText?.trim()) {
        return [
          `附件 ${index + 1}: ${item.name}`,
          `类型: ${item.type || 'application/octet-stream'}`,
          '内容:',
          item.extractedText.trim(),
        ].join('\n')
      }

      const reason =
        item.extractionStatus === 'unsupported'
          ? '暂不支持直接解析该类型，请用户改传 PDF、Word、Excel、CSV、TXT、Markdown、JSON 或代码文本。'
          : item.extractionStatus === 'failed'
            ? `解析失败：${item.extractionError || '未知错误'}`
            : '未提取到可读文本。'
      return [
        `附件 ${index + 1}: ${item.name}`,
        `类型: ${item.type || 'application/octet-stream'}`,
        reason,
      ].join('\n')
    })

  if (blocks.length === 0) return ''
  const content = blocks.join('\n\n---\n\n')
  const limitedContent =
    content.length <= MAX_ATTACHMENT_TEXT_BLOCK_CHARS
      ? content
      : `${content.slice(0, MAX_ATTACHMENT_TEXT_BLOCK_CHARS)}\n\n...附件合并内容过长，已截断前 ${MAX_ATTACHMENT_TEXT_BLOCK_CHARS.toLocaleString()} 字符。`

  return [
    '',
    '---',
    '以下是用户上传的文档附件内容，请在回答时结合这些内容；如果附件内容不足或解析失败，请明确说明。',
    limitedContent,
  ].join('\n')
}

async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc ||= new URL(
    'pdfjs-dist/build/pdf.worker.mjs',
    import.meta.url
  ).toString()
  const data = await file.arrayBuffer()
  const task = pdfjs.getDocument({
    data,
    useWorkerFetch: false,
  })
  const pdf = await task.promise
  const pages: string[] = []
  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const content = await page.getTextContent()
    const pageText = content.items
      .map((item) => ('str' in item ? item.str : ''))
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim()
    if (pageText) pages.push(`第 ${pageNumber} 页:\n${pageText}`)
  }
  return pages.join('\n\n')
}

async function extractDocxText(file: File): Promise<string> {
  const mammoth = await import('mammoth/mammoth.browser')
  const arrayBuffer = await file.arrayBuffer()
  const result = await mammoth.extractRawText({ arrayBuffer })
  return result.value || ''
}

async function extractWorkbookText(file: File): Promise<string> {
  const XLSX = await import('xlsx')
  const data = await file.arrayBuffer()
  const workbook = XLSX.read(data, { type: 'array' })
  const sheets = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName]
    const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean | null>>(sheet, {
      header: 1,
      blankrows: false,
      defval: '',
    })
    const limitedRows = rows.slice(0, MAX_WORKSHEET_ROWS).map((row) =>
      row
        .slice(0, MAX_WORKSHEET_COLS)
        .map((cell) => String(cell ?? '').trim())
        .join('\t')
    )
    const suffix =
      rows.length > MAX_WORKSHEET_ROWS ? `\n...已截断，原表共 ${rows.length} 行` : ''
    return `工作表: ${sheetName}\n${limitedRows.join('\n')}${suffix}`
  })
  return sheets.join('\n\n---\n\n')
}

function limitExtractedText(text: string): string {
  const normalized = String(text || '')
    .replace(/\r\n/g, '\n')
    .replace(/\u0000/g, '')
    .trim()
  if (normalized.length <= MAX_EXTRACTED_TEXT_CHARS) return normalized
  return `${normalized.slice(0, MAX_EXTRACTED_TEXT_CHARS)}\n\n...附件内容过长，已截断前 ${MAX_EXTRACTED_TEXT_CHARS.toLocaleString()} 字符。`
}
