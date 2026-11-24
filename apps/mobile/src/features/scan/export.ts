// Pure: the scan as one Markdown document, a section per note with its links
// and sources (the same content as the note sheets).
import type { ScanConfidence, ScanGraph, ScanNodeType, ScanRelation } from '@/api/scan'
import { buildIndex, linkGroups, nodeSources, NODE_TYPES, type LinkDirection } from './graph'

/** Localised words the document needs; the screen supplies them from the catalogue. */
export interface ExportLabels {
  title: string
  type: string
  years: string
  confidence: string
  links: string
  sources: string
  types: Record<ScanNodeType, string>
  confidences: Record<ScanConfidence, string>
  relation: (relation: ScanRelation, direction: LinkDirection) => string
}

const oneLine = (text: string) => text.replace(/\s+/g, ' ').trim()

export function exportMarkdown(graph: ScanGraph, labels: ExportLabels): string {
  const index = buildIndex(graph)
  const lines: string[] = [`# ${oneLine(labels.title)}`, '']
  if (graph.summary.trim()) lines.push(graph.summary.trim(), '')

  // Notes in type order (surname first), keeping the agent's order inside a type.
  const ordered = NODE_TYPES.flatMap((type) => graph.nodes.filter((node) => node.type === type))
  for (const node of ordered) {
    lines.push(`## ${oneLine(node.label)}`, '')
    lines.push(`- ${labels.type}: ${labels.types[node.type]}`)
    if (node.years.trim()) lines.push(`- ${labels.years}: ${oneLine(node.years)}`)
    lines.push(`- ${labels.confidence}: ${labels.confidences[node.confidence]}`, '')
    if (node.summary.trim()) lines.push(node.summary.trim(), '')

    const groups = linkGroups(index, node.id)
    if (groups.length > 0) {
      lines.push(`### ${labels.links}`, '')
      for (const group of groups) {
        for (const link of group.items) {
          const note = link.label.trim() ? ` (${oneLine(link.label)})` : ''
          lines.push(`- ${labels.relation(group.relation, group.direction)}: ${oneLine(link.node.label)}${note}`)
        }
      }
      lines.push('')
    }

    const sources = nodeSources(graph, node)
    if (sources.length > 0) {
      lines.push(`### ${labels.sources}`, '')
      // The autolink form survives URLs that contain parentheses.
      for (const source of sources) lines.push(`- ${oneLine(source.title)}: <${source.url}>`)
      lines.push('')
    }
  }
  return `${lines.join('\n').trimEnd()}\n`
}

/** A file name that is safe on every platform, e.g. `genealogy-scan-silva.md`. */
export function exportFileName(surname: string): string {
  const slug = surname
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `genealogy-scan${slug ? `-${slug}` : ''}.md`
}
