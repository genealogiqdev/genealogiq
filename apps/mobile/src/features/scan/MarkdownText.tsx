import { useMemo } from 'react'
import { Text as RNText, View } from 'react-native'
import { openInBrowser } from '@/lib/share'
import { parseMarkdown, safeHttpUrl, type Span } from './markdown'

function Spans({ spans }: { spans: Span[] }) {
  return (
    <>
      {spans.map((span, index) => {
        const style = `${span.bold ? 'font-semibold ' : ''}${span.italic ? 'italic ' : ''}`
        // The parser only keeps http(s) targets; checked again at the point of use.
        const href = span.href ? safeHttpUrl(span.href) : null
        if (!href) {
          return (
            <RNText key={index} className={style}>
              {span.text}
            </RNText>
          )
        }
        return (
          <RNText key={index} className={`${style}text-link underline`} accessibilityRole="link" onPress={() => void openInBrowser(href).catch(() => undefined)}>
            {span.text}
          </RNText>
        )
      })}
    </>
  )
}

/** Agent-written Markdown as plain native text: paragraphs, headings, list items, bold, italic, http(s) links. */
export function Markdown({ source }: { source: string }) {
  const blocks = useMemo(() => parseMarkdown(source), [source])
  return (
    <View className="gap-2">
      {blocks.map((block, index) =>
        block.kind === 'bullet' ? (
          <View key={index} className="flex-row gap-2">
            <RNText className="text-base text-muted">•</RNText>
            <RNText className="flex-1 text-base leading-6 text-foreground">
              <Spans spans={block.spans} />
            </RNText>
          </View>
        ) : (
          <RNText
            key={index}
            accessibilityRole={block.kind === 'heading' ? 'header' : undefined}
            className={block.kind === 'heading' ? 'text-base font-semibold leading-6 text-foreground' : 'text-base leading-6 text-foreground'}
          >
            <Spans spans={block.spans} />
          </RNText>
        ),
      )}
    </View>
  )
}
