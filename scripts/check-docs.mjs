import { readFile, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const guides = ['AGENTS.md', 'apps/app/AGENTS.md', 'apps/bms/AGENTS.md', 'apps/seq/AGENTS.md']
const sections = ['How it works', 'Rules and why', 'Contracts and data', 'How to test it (AI-runnable)', 'Runbooks', 'Gaps and fixes', 'Verification log', 'Related']
const crossCutting = ['LOCAL-DEVELOPMENT', 'DATABASE', 'CONFIGURATION', 'TESTING', 'OBSERVABILITY', 'RUNBOOKS', 'GAPS', 'HISTORY', 'audits/AGENT-MEMORY-2026-10-03']
const failures = []
let links = 0
let sourceReferences = 0
let localEvidenceLinks = 0
const currentDocs = new Set([...guides, ...crossCutting.map(name => 'docs/' + name + '.md'), 'apps/app/docs/CONVENTIONS.md', 'docs/FLUXO-COMERCIAL-ATUAL.md', 'e2e/README.md', 'packages/db/README.md'])
const featureDocs = new Set()
const exists = async target => { try { return await stat(target) } catch { return null } }

// Markdown destinations may contain balanced parentheses in App Router groups.
function destinations(text) {
  const found = []
  for (let start = text.indexOf(']('); start >= 0; start = text.indexOf('](', start + 2)) {
    let depth = 1
    let end = start + 2
    for (; end < text.length && depth; end++) {
      if (text[end] === '(') depth++
      if (text[end] === ')') depth--
    }
    if (!depth) found.push(text.slice(start + 2, end - 1).trim())
  }
  return found
}
function resolveDestination(owner, destination) {
  if (/^(https?:|mailto:|app:|codex:|#)/.test(destination)) return null
  const target = decodeURIComponent(destination.split('#')[0].replace(/^<|>$/g, ''))
  if (!target) return null
  const resolved = path.resolve(root, path.dirname(owner), target)
  // Ignored QA evidence is local to its run and is not required in a fresh clone.
  if (path.relative(root, resolved).split(path.sep)[0] === '.local-qa') { localEvidenceLinks++; return null }
  return resolved
}

for (const guide of guides) {
  const text = await readFile(path.join(root, guide), 'utf8')
  if (!text.includes('## Session protocol')) failures.push(guide + ': missing session protocol')
  if (!text.includes('Update rule') || !text.includes('Completion rule')) failures.push(guide + ': missing update/completion rules')
  if (text.split('\n').length > 500) failures.push(guide + ': exceeds 500-line guide budget')
  if (guide !== 'AGENTS.md' && (!text.includes('<!-- BEGIN:nextjs-agent-rules -->') || !text.includes('<!-- END:nextjs-agent-rules -->'))) failures.push(guide + ': lost installed Next rules')
  for (const destination of destinations(text)) {
    const abs = resolveDestination(guide, destination)
    if (!abs || !(await exists(abs))) continue
    const rel = path.relative(root, abs).split(path.sep).join('/')
    const content = abs.endsWith('.md') ? await readFile(abs, 'utf8') : ''
    if (content.includes('> **Code:**') && content.includes('## Rules and why') && content.includes('## Contracts and data')) featureDocs.add(rel)
  }
}
for (const feature of featureDocs) {
  currentDocs.add(feature)
  const text = await readFile(path.join(root, feature), 'utf8')
  for (const section of sections) if (!text.includes('## ' + section)) failures.push(feature + ': missing ' + section)
  for (const metadata of ['**Code:**', '**Entry points:**', '**Depends on:**', '**Last verified against code:**']) if (!text.includes(metadata)) failures.push(feature + ': missing ' + metadata)
  if (!/Last verified against code:.*\d{4}-\d{2}-\d{2}/.test(text)) failures.push(feature + ': missing verification date')
  if (!text.includes('Expected answers:') || !text.includes('Acceptance:') || !text.includes('Telling failures apart:') || !text.includes('### Manual scenarios') || !text.includes('### QA evidence')) failures.push(feature + ': missing independent expectations or QA evidence')
  if (!text.includes('pnpm test') && !text.includes('testability')) failures.push(feature + ': missing runnable test/testability record')
  const scope = feature.startsWith('apps/') ? feature.split('/').slice(0, 2).join('/') : ''
  const symbols = text.match(/\| \[([^\n]+?)\]\(([^\n]+?)\) \| ([^|]+) \| (?:Input validation|Scoped data|Authenticated mutation|HTTP entry|Browser worker|Routed product|Visible interaction|Shared policy)/g) ?? []
  for (const row of symbols) {
    const destination = destinations(row)[0]
    const abs = destination && resolveDestination(feature, destination)
    if (!abs || !(await exists(abs)) || !(await stat(abs)).isFile()) continue
    const content = await readFile(abs, 'utf8')
    const named = [...row.matchAll(/`([A-Za-z_]\w*)`/g)].map(match => match[1])
    for (const symbol of named) {
      sourceReferences++
      if (!new RegExp('\\b' + symbol + '\\b').test(content)) failures.push(feature + ': symbol ' + symbol + ' missing from ' + path.relative(root, abs))
    }
  }
  // A new feature file must also be indexed; the directory scan below detects omissions.
  if (scope && !guideHasFeature(scope, feature)) failures.push(feature + ': indexed under the wrong app')
}
function guideHasFeature(scope, feature) { return feature.startsWith(scope + '/docs/') }
for (const dir of ['docs', 'apps/app/docs', 'apps/bms/docs', 'apps/seq/docs']) {
  for (const entry of await readdir(path.join(root, dir), { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.md')) continue
    const rel = dir + '/' + entry.name
    const text = await readFile(path.join(root, rel), 'utf8')
    if (text.includes('> **Code:**') && text.includes('## Rules and why') && text.includes('## Contracts and data') && !featureDocs.has(rel)) failures.push(rel + ': feature doc not indexed by an AGENTS.md')
  }
}
for (const doc of currentDocs) {
  if (!(await exists(path.join(root, doc)))) { failures.push(doc + ': document missing'); continue }
  let text = await readFile(path.join(root, doc), 'utf8')
  // Preserved historical content is not asserted as a current contract.
  if (doc === 'packages/db/README.md') text = text.split('\n---\n')[0]
  for (const destination of destinations(text)) {
    const abs = resolveDestination(doc, destination)
    if (!abs) continue
    links++
    if (!(await exists(abs))) failures.push(doc + ': broken local link ' + destination)
  }
  const entries = [...text.matchAll(/^### [A-Z][A-Z0-9-]*-G\d+:[\s\S]*?(?=^### |^## |$(?![\s\S]))/gm)]
  for (const entry of entries) if (!entry[0].includes('- **Status:**') || !entry[0].includes('- **Evidence:**') || !entry[0].includes('- **Resolution:**')) failures.push(doc + ': incomplete permanent gap fields')
}
console.log('Documentation check: ' + guides.length + ' guides, ' + featureDocs.size + ' indexed features, ' + links + ' local links, ' + sourceReferences + ' named source references; ' + localEvidenceLinks + ' optional local evidence links.')
if (failures.length) {
  for (const failure of failures) console.error(failure)
  process.exitCode = 1
} else console.log('Required metadata/sections, guide budgets, feature indexes and local link/source checks passed.')
