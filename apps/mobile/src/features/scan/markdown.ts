// A deliberately small Markdown reader for text written by the research agent:
// paragraphs, headings, list items, bold, italic and links. Everything else is
// shown as the characters it is. Nothing here interprets HTML.

/** The URL when it is a plain web link, else null (no javascript:, data:, file:, credentials or whitespace). */
export function safeHttpUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const url = value.trim()
  if (url.length === 0 || url.length > 2048) return null
  const match = /^https?:\/\/([^/?#\s]+)(?:[/?#]\S*)?$/i.exec(url)
  if (!match) return null
  const authority = match[1]
  if (authority.includes('@') || /[<>"'`\\]/.test(url)) return null
  return url
}

/** Host of an http(s) URL without a leading "www.", or '' when it is not one. */
export function urlHost(value: string): string {
  const url = safeHttpUrl(value)
  if (!url) return ''
  const host = /^https?:\/\/([^/?#:]+)/i.exec(url)?.[1] ?? ''
  return host.replace(/^www\./i, '').toLowerCase()
}

export interface Span {
  text: string
  bold?: boolean
  italic?: boolean
  /** Present only for http(s) links. */
  href?: string
}

export interface Block {
  kind: 'paragraph' | 'heading' | 'bullet'
  spans: Span[]
}

const INLINE = /\[([^\]\n]+)\]\(([^)\s]*)\)|\*\*([^*\n]+)\*\*|__([^_\n]+)__|\*([^*\s][^*\n]*)\*|\b_([^_\n]+)_\b|`([^`\n]+)`/g

function inline(text: string, style: Pick<Span, 'bold' | 'italic'> = {}): Span[] {
  const spans: Span[] = []
  const push = (span: Span) => {
    if (span.text) spans.push(span)
  }
  let last = 0
  for (const match of text.matchAll(INLINE)) {
    const start = match.index ?? 0
    push({ ...style, text: text.slice(last, start) })
    const [, linkText, linkUrl, strongA, strongB, emA, emB, code] = match
    if (linkText !== undefined) {
      const href = safeHttpUrl(linkUrl)
      // A link that is not plain http(s) keeps its words and loses its target.
      for (const span of inline(linkText, style)) push(href ? { ...span, href } : span)
    } else if (strongA !== undefined || strongB !== undefined) {
      for (const span of inline(strongA ?? strongB, { ...style, bold: true })) push(span)
    } else if (emA !== undefined || emB !== undefined) {
      for (const span of inline(emA ?? emB, { ...style, italic: true })) push(span)
    } else if (code !== undefined) {
      push({ ...style, text: code })
    }
    last = start + match[0].length
  }
  push({ ...style, text: text.slice(last) })
  return spans
}

export function parseMarkdown(source: string): Block[] {
  const blocks: Block[] = []
  let paragraph: string[] = []
  const flush = () => {
    if (paragraph.length > 0) blocks.push({ kind: 'paragraph', spans: inline(paragraph.join(' ')) })
    paragraph = []
  }
  for (const raw of source.replace(/\r\n?/g, '\n').split('\n')) {
    const line = raw.trim()
    if (!line) {
      flush()
      continue
    }
    const heading = /^#{1,6}\s+(.*)$/.exec(line)
    if (heading) {
      flush()
      blocks.push({ kind: 'heading', spans: inline(heading[1]) })
      continue
    }
    const bullet = /^(?:[-*+]|\d{1,3}[.)])\s+(.*)$/.exec(line)
    if (bullet) {
      flush()
      blocks.push({ kind: 'bullet', spans: inline(bullet[1]) })
      continue
    }
    paragraph.push(line)
  }
  flush()
  return blocks.filter((block) => block.spans.length > 0)
}

/** The text without any markup (for accessibility labels and previews). */
export function plainText(source: string): string {
  return parseMarkdown(source)
    .map((block) => block.spans.map((span) => span.text).join(''))
    .join('\n')
}
