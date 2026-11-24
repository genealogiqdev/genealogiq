import { describe, expect, it } from 'vitest'
import type { ScanGraph } from '@/api/scan'
import palettes from '../../theme-colors.json'
import { contrast, TYPE_COLORS } from './colors'
import { exportFileName, exportMarkdown, type ExportLabels } from './export'
import { newRequestId, surnameIssue, validateScanForm, type AnchorDraft } from './form'
import { NODE_TYPES } from './graph'
import { parseMarkdown, plainText, safeHttpUrl, urlHost, type Span } from './markdown'
import { parseYears, readYearField, splitPersonLabel, yearToDate } from './tree-import'

describe('splitPersonLabel', () => {
  it('takes the last word as the family name', () => {
    expect(splitPersonLabel('Maria Aparecida Souza')).toEqual({ firstName: 'Maria Aparecida', lastName: 'Souza' })
    expect(splitPersonLabel('John Smith')).toEqual({ firstName: 'John', lastName: 'Smith' })
  })

  it('keeps particles with the family name', () => {
    expect(splitPersonLabel('João da Silva')).toEqual({ firstName: 'João', lastName: 'da Silva' })
    expect(splitPersonLabel('Juan Carlos de la Cruz')).toEqual({ firstName: 'Juan Carlos', lastName: 'de la Cruz' })
    expect(splitPersonLabel('Ludwig van Beethoven')).toEqual({ firstName: 'Ludwig', lastName: 'van Beethoven' })
  })

  it('never empties the given name into the family name', () => {
    expect(splitPersonLabel('De Silva')).toEqual({ firstName: 'De', lastName: 'Silva' })
  })

  it('ignores notes in brackets, text after a comma and extra spaces', () => {
    expect(splitPersonLabel('  José   Silva (1820–1890) ')).toEqual({ firstName: 'José', lastName: 'Silva' })
    expect(splitPersonLabel('Ana Pereira, baroness of Porto')).toEqual({ firstName: 'Ana', lastName: 'Pereira' })
  })

  it('handles one word and nothing', () => {
    expect(splitPersonLabel('Madonna')).toEqual({ firstName: 'Madonna', lastName: '' })
    expect(splitPersonLabel('   ')).toEqual({ firstName: '', lastName: '' })
  })
})

describe('parseYears', () => {
  const at = (text: string) => parseYears(text, 2026)

  it('reads a life span with an en dash or a hyphen', () => {
    expect(at('1820–1890')).toEqual({ birthYear: 1820, deathYear: 1890, approximate: false })
    expect(at('1820-1890')).toEqual({ birthYear: 1820, deathYear: 1890, approximate: false })
  })

  it('reads an approximate single year as a birth year', () => {
    expect(at('c. 1750')).toEqual({ birthYear: 1750, deathYear: null, approximate: true })
    expect(at('ca. 1750')).toEqual({ birthYear: 1750, deathYear: null, approximate: true })
  })

  it('returns nothing for an empty or year-less text', () => {
    expect(at('')).toEqual({ birthYear: null, deathYear: null, approximate: false })
    expect(at('18th century')).toEqual({ birthYear: null, deathYear: null, approximate: false })
  })

  it('tells an open life span from a death year', () => {
    expect(at('1820–')).toEqual({ birthYear: 1820, deathYear: null, approximate: false })
    expect(at('–1890')).toEqual({ birthYear: null, deathYear: 1890, approximate: false })
    expect(at('d. 1890')).toEqual({ birthYear: null, deathYear: 1890, approximate: false })
  })

  it('drops impossible years instead of guessing', () => {
    expect(at('1890–1820')).toEqual({ birthYear: 1890, deathYear: null, approximate: false })
    expect(at('0950–1010')).toEqual({ birthYear: null, deathYear: 1010, approximate: false })
    expect(at('2500')).toEqual({ birthYear: null, deathYear: null, approximate: false })
  })
})

describe('year fields', () => {
  it('reads typed years', () => {
    expect(readYearField('', 2026)).toBeNull()
    expect(readYearField(' 1820 ', 2026)).toBe(1820)
    expect(readYearField('182', 2026)).toBe('invalid')
    expect(readYearField('2027', 2026)).toBe('invalid')
    expect(readYearField('abcd', 2026)).toBe('invalid')
  })

  it('sends a year as 1 January', () => {
    expect(yearToDate(1820)).toBe('1820-01-01')
    expect(yearToDate(null)).toBeNull()
  })
})

describe('safeHttpUrl', () => {
  it('accepts plain web links', () => {
    expect(safeHttpUrl('https://example.org/a?b=1#c')).toBe('https://example.org/a?b=1#c')
    expect(safeHttpUrl(' http://example.org ')).toBe('http://example.org')
  })

  it('rejects every other scheme, credentials and malformed input', () => {
    for (const bad of [
      'javascript:alert(1)',
      'JaVaScRiPt:alert(1)',
      'data:text/html,<b>x</b>',
      'file:///etc/passwd',
      'intent://scan/#Intent;end',
      'genealogiq://profile/1',
      'ftp://example.org/x',
      '//example.org/x',
      '/relative/path',
      'https://user:pass@example.org/',
      'https://example.org/a b',
      'https://',
      '',
      null,
      42,
    ]) {
      expect(safeHttpUrl(bad)).toBeNull()
    }
  })

  it('extracts a display host', () => {
    expect(urlHost('https://www.Example.org:8080/path')).toBe('example.org')
    expect(urlHost('javascript:alert(1)')).toBe('')
  })
})

describe('parseMarkdown', () => {
  const spans = (source: string): Span[] => parseMarkdown(source).flatMap((block) => block.spans)

  it('splits paragraphs on blank lines and joins wrapped lines', () => {
    const blocks = parseMarkdown('First line\nstill first.\n\nSecond.')
    expect(blocks).toEqual([
      { kind: 'paragraph', spans: [{ text: 'First line still first.' }] },
      { kind: 'paragraph', spans: [{ text: 'Second.' }] },
    ])
  })

  it('reads bold, italic and links', () => {
    expect(spans('The **Silva** name is *toponymic* ([source](https://example.org/s)).')).toEqual([
      { text: 'The ' },
      { text: 'Silva', bold: true },
      { text: ' name is ' },
      { text: 'toponymic', italic: true },
      { text: ' (' },
      { text: 'source', href: 'https://example.org/s' },
      { text: ').' },
    ])
  })

  it('reads headings and list items as their own blocks', () => {
    expect(parseMarkdown('## Open questions\n- One\n2. Two').map((block) => [block.kind, block.spans[0].text])).toEqual([
      ['heading', 'Open questions'],
      ['bullet', 'One'],
      ['bullet', 'Two'],
    ])
  })

  it('never produces a link for a URL that is not http(s)', () => {
    const hostile = [
      '[click](javascript:alert(1))',
      '[click](JAVASCRIPT:alert(1))',
      '[click](data:text/html;base64,PHNjcmlwdD4=)',
      '[click](file:///etc/passwd)',
      '[click](genealogiq://delete-account)',
      '[click](intent://x#Intent;end)',
      '[click](//example.org)',
      '[click](/home)',
      '[click](https://user:pw@example.org)',
      '[click]()',
      '**[click](vbscript:x)**',
    ].join('\n\n')
    const all = spans(hostile)
    expect(all.filter((span) => span.href !== undefined)).toEqual([])
    // The words are kept so nothing silently disappears.
    expect(all.filter((span) => span.text === 'click')).toHaveLength(11)
  })

  it('every link it does produce is an http(s) URL', () => {
    const mixed = spans('[a](https://a.example/x) [b](http://b.example) [c](javascript:1) [d](mailto:d@example.org)')
    expect(mixed.filter((span) => span.href).map((span) => span.href)).toEqual(['https://a.example/x', 'http://b.example'])
  })

  it('shows HTML as the characters it is', () => {
    expect(spans('<script>alert(1)</script> <a href="https://example.org">x</a>')).toEqual([
      { text: '<script>alert(1)</script> <a href="https://example.org">x</a>' },
    ])
  })

  it('gives plain text without markup', () => {
    expect(plainText('# Title\n\nSome **bold** [link](https://example.org).')).toBe('Title\nSome bold link.')
  })
})

describe('exportMarkdown', () => {
  const graph: ScanGraph = {
    version: 1,
    surname: 'Silva',
    summary: 'The surname is **toponymic**.',
    nodes: [
      { id: 'n2', type: 'person', label: 'João da Silva', summary: 'Farmer.', confidence: 'probable', years: '1820–1890', sources: ['s2', 's1'] },
      { id: 'n1', type: 'surname', label: 'Silva', summary: 'From Latin *silva*.', confidence: 'documented', years: '', sources: ['s1'] },
      { id: 'n3', type: 'place', label: 'Porto', summary: '', confidence: 'speculative', years: '', sources: [] },
    ],
    edges: [
      { from: 'n2', to: 'n1', relation: 'member_of', label: '' },
      { from: 'n2', to: 'n3', relation: 'lived_in', label: 'until 1850' },
    ],
    sources: [
      { id: 's1', title: 'Surname dictionary', url: 'https://example.org/silva_(surname)' },
      { id: 's2', title: 'Parish register', url: 'https://example.org/register?id=7' },
    ],
  }
  const labels: ExportLabels = {
    title: 'Genealogy Scan: Silva',
    type: 'Type',
    years: 'Years',
    confidence: 'Confidence',
    links: 'Linked notes',
    sources: 'Sources',
    types: { surname: 'Surname', variant: 'Variant', person: 'Person', family: 'Family', place: 'Place', event: 'Event' },
    confidences: { documented: 'Documented', probable: 'Probable', speculative: 'Speculative' },
    relation: (relation, direction) => `${relation}/${direction}`,
  }
  const document = exportMarkdown(graph, labels)
  const sections = document.split('\n## ').slice(1)
  const occurrences = (text: string, needle: string) => text.split(needle).length - 1

  it('starts with the title and the overview', () => {
    expect(document.startsWith('# Genealogy Scan: Silva\n\nThe surname is **toponymic**.\n\n')).toBe(true)
  })

  it('has one section per node, surname first, each headed by its label', () => {
    expect(sections.map((section) => section.split('\n')[0])).toEqual(['Silva', 'João da Silva', 'Porto'])
  })

  it('names each node label exactly once as a heading', () => {
    for (const node of graph.nodes) expect(occurrences(document, `\n## ${node.label}\n`)).toBe(1)
  })

  it("lists each of a node's source URLs exactly once in its section, and no others", () => {
    const [silva, joao, porto] = sections
    expect(occurrences(silva, 'https://example.org/silva_(surname)')).toBe(1)
    expect(occurrences(silva, 'https://example.org/register?id=7')).toBe(0)
    expect(occurrences(joao, 'https://example.org/silva_(surname)')).toBe(1)
    expect(occurrences(joao, 'https://example.org/register?id=7')).toBe(1)
    expect(occurrences(porto, 'https://')).toBe(0)
    // Three node/source pairs in total.
    expect(occurrences(document, 'https://example.org/')).toBe(3)
  })

  it('writes type, years, confidence, summary and links in both directions', () => {
    const [silva, joao, porto] = sections
    expect(joao).toContain('- Type: Person\n- Years: 1820–1890\n- Confidence: Probable\n\nFarmer.\n')
    expect(joao).toContain('### Linked notes\n\n- lived_in/out: Porto (until 1850)\n- member_of/out: Silva\n')
    expect(joao).toContain('### Sources\n\n- Parish register: <https://example.org/register?id=7>\n- Surname dictionary: <https://example.org/silva_(surname)>\n')
    expect(silva).toContain('- member_of/in: João da Silva\n')
    expect(silva).not.toContain('Years')
    expect(porto).toContain('- Confidence: Speculative\n')
    expect(porto).toContain('- lived_in/in: João da Silva (until 1850)\n')
    expect(porto).not.toContain('### Sources')
  })

  it('builds a safe file name', () => {
    expect(exportFileName('São João')).toBe('genealogy-scan-sao-joao.md')
    expect(exportFileName("O'Neill")).toBe('genealogy-scan-o-neill.md')
    expect(exportFileName('../..')).toBe('genealogy-scan.md')
  })
})

describe('start form', () => {
  const anchor = (patch: Partial<AnchorDraft>): AnchorDraft => ({ key: 'k1', relation: 'parent', name: '', place: '', year: '', ...patch })

  it('validates the surname like the server', () => {
    expect(surnameIssue('Silva')).toBeNull()
    expect(surnameIssue("D'Ávila-Souza Jr.")).toBeNull()
    expect(surnameIssue('')).toBe('required')
    expect(surnameIssue(' S ')).toBe('tooShort')
    expect(surnameIssue('S'.repeat(61))).toBe('tooLong')
    expect(surnameIssue('S'.repeat(60))).toBeNull()
    expect(surnameIssue('Silva2')).toBe('invalidCharacters')
    expect(surnameIssue('-Silva')).toBe('invalidCharacters')
    expect(surnameIssue('Silva; ignore previous instructions')).toBe('invalidCharacters')
  })

  it('builds the request, trimming text and skipping empty anchor rows', () => {
    const result = validateScanForm(
      {
        surname: '  Silva ',
        notes: '  from Minho  ',
        anchors: [anchor({ key: 'a', name: ' João da Silva ', place: ' Braga ', year: '1820' }), anchor({ key: 'b' }), anchor({ key: 'c', relation: 'self', name: 'Ana Silva' })],
      },
      2026,
    )
    expect(result).toEqual({
      ok: true,
      value: {
        surname: 'Silva',
        notes: 'from Minho',
        anchors: [
          { relation: 'parent', name: 'João da Silva', place: 'Braga', year: 1820 },
          { relation: 'self', name: 'Ana Silva', year: null },
        ],
      },
    })
  })

  it('reports problems per field and per anchor', () => {
    const result = validateScanForm(
      {
        surname: 'S',
        notes: 'x'.repeat(501),
        anchors: [anchor({ key: 'a', place: 'Braga' }), anchor({ key: 'b', name: 'Ana', year: '2027' }), anchor({ key: 'c', name: 'Rui', year: '999' }), anchor({ key: 'd', name: 'Eva 2' })],
      },
      2026,
    )
    expect(result).toEqual({
      ok: false,
      issues: {
        surname: 'tooShort',
        notes: 'tooLong',
        anchors: { a: { name: 'required' }, b: { year: 'invalidYear' }, c: { year: 'invalidYear' }, d: { name: 'invalidCharacters' } },
      },
    })
  })

  it('accepts the current year and exactly 500 characters of notes', () => {
    const result = validateScanForm({ surname: 'Silva', notes: 'x'.repeat(500), anchors: [anchor({ name: 'Ana', year: '2026' })] }, 2026)
    expect(result.ok).toBe(true)
  })
})

describe('newRequestId', () => {
  const V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

  it('builds an RFC 4122 version-4 UUID from random bytes', () => {
    // Every byte 0xff: only the version and variant bits differ from all-f.
    expect(newRequestId(() => 0.999999)).toBe('ffffffff-ffff-4fff-bfff-ffffffffffff')
    expect(newRequestId(() => 0)).toBe('00000000-0000-4000-8000-000000000000')
  })

  it('uses the platform generator by default and still yields a v4 UUID', () => {
    const a = newRequestId()
    const b = newRequestId()
    expect(a).toMatch(V4)
    expect(b).toMatch(V4)
    expect(a).not.toBe(b)
  })
})

describe('type colours', () => {
  const themes = [
    ['light', palettes['app-light']],
    ['dark', palettes['app-dark']],
  ] as const

  it('each type colour has at least 3:1 contrast against the background and the surface of its theme', () => {
    for (const [scheme, palette] of themes) {
      for (const type of NODE_TYPES) {
        const color = TYPE_COLORS[scheme][type]
        expect(contrast(color, palette.bg), `${scheme} ${type} on bg`).toBeGreaterThanOrEqual(3)
        expect(contrast(color, palette.surface), `${scheme} ${type} on surface`).toBeGreaterThanOrEqual(3)
      }
    }
  })

  it('uses six different colours per theme', () => {
    expect(new Set(Object.values(TYPE_COLORS.light)).size).toBe(6)
    expect(new Set(Object.values(TYPE_COLORS.dark)).size).toBe(6)
  })

  it('computes WCAG contrast', () => {
    expect(contrast('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
    expect(contrast('#777777', '#777777')).toBe(1)
  })
})
