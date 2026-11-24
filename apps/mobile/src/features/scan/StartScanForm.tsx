import { useRef, useState } from 'react'
import { View } from 'react-native'
import { scanApi, type AnchorRelation } from '@/api/scan'
import { useT } from '@/i18n'
import { Button, Card, Field, Heading, IconButton, Muted, SelectField, useAction, type Option } from '@/ui'
import { ANCHOR_RELATIONS, ANCHOR_TEXT_MAX, MAX_ANCHORS, newRequestId, NOTES_MAX, SURNAME_MAX, validateScanForm, type AnchorDraft, type FieldIssue, type ScanFormIssues } from './form'

interface Props {
  onStarted: (id: string) => void
  /** Called after a refused start so the access state (limit, running scan) is read again. */
  onRefused: () => void
}

let anchorSeed = 0
const blankAnchor = (): AnchorDraft => ({ key: `anchor-${++anchorSeed}`, relation: 'parent', name: '', place: '', year: '' })

export function StartScanForm({ onStarted, onRefused }: Props) {
  const t = useT('Mobile.scan')
  const { run, pending } = useAction()

  const [surname, setSurname] = useState('')
  const [anchors, setAnchors] = useState<AnchorDraft[]>([])
  const [notes, setNotes] = useState('')
  const [issues, setIssues] = useState<ScanFormIssues>({ anchors: {} })

  // One id per attempt: a retry after a timeout or a lost answer presents the
  // same id, so the server returns the scan it already started instead of
  // starting (and counting) a second one. Replaced only after a success.
  const requestId = useRef<string | null>(null)

  const relationOptions: Option<AnchorRelation>[] = ANCHOR_RELATIONS.map((relation) => ({ value: relation, label: t(`form.relations.${relation}`) }))
  const issueText = (issue: FieldIssue | undefined, max: number) => (issue ? t(`issues.${issue}`, { max }) : null)
  const patchAnchor = (key: string, patch: Partial<AnchorDraft>) => setAnchors((current) => current.map((anchor) => (anchor.key === key ? { ...anchor, ...patch } : anchor)))

  async function submit() {
    const result = validateScanForm({ surname, anchors, notes })
    if (!result.ok) {
      setIssues(result.issues)
      return
    }
    setIssues({ anchors: {} })
    requestId.current ??= newRequestId()
    const response = await run(() => scanApi.start({ requestId: requestId.current as string, ...result.value }))
    if (!response) {
      onRefused()
      return
    }
    requestId.current = null
    const id = response.data?.id
    if (id) onStarted(id)
    else onRefused()
  }

  return (
    <Card>
      <Heading>{t('form.heading')}</Heading>
      <Field
        label={t('form.surname')}
        value={surname}
        onChangeText={setSurname}
        maxLength={SURNAME_MAX}
        required
        autoCapitalize="words"
        autoCorrect={false}
        hint={t('form.surnameHint')}
        error={issueText(issues.surname, SURNAME_MAX)}
      />

      <View className="gap-1 pt-2">
        <Heading className="text-base">{t('form.anchorsTitle')}</Heading>
        <Muted>{t('form.anchorsHint')}</Muted>
      </View>
      {anchors.map((anchor, position) => {
        const found = issues.anchors[anchor.key] ?? {}
        return (
          <View key={anchor.key} className="gap-3 rounded-2xl border border-border bg-background p-3">
            <View className="flex-row items-center justify-between">
              <Muted>{t('form.anchorN', { n: position + 1 })}</Muted>
              <IconButton icon="trash-outline" label={t('form.removeAnchor', { n: position + 1 })} onPress={() => setAnchors((current) => current.filter((other) => other.key !== anchor.key))} />
            </View>
            <SelectField label={t('form.relation')} value={anchor.relation} options={relationOptions} onChange={(relation) => patchAnchor(anchor.key, { relation })} />
            <Field
              label={t('form.name')}
              value={anchor.name}
              onChangeText={(name) => patchAnchor(anchor.key, { name })}
              maxLength={ANCHOR_TEXT_MAX}
              autoCapitalize="words"
              autoCorrect={false}
              error={issueText(found.name, ANCHOR_TEXT_MAX)}
            />
            <Field label={t('form.place')} value={anchor.place} onChangeText={(place) => patchAnchor(anchor.key, { place })} maxLength={ANCHOR_TEXT_MAX} error={issueText(found.place, ANCHOR_TEXT_MAX)} />
            <Field
              label={t('form.year')}
              value={anchor.year}
              onChangeText={(year) => patchAnchor(anchor.key, { year })}
              keyboardType="number-pad"
              maxLength={4}
              hint={t('form.yearHint')}
              error={issueText(found.year, 4)}
            />
          </View>
        )
      })}
      {anchors.length < MAX_ANCHORS ? (
        <Button label={t('form.addAnchor')} icon="add" variant="secondary" onPress={() => setAnchors((current) => [...current, blankAnchor()])} />
      ) : (
        <Muted>{t('form.maxAnchors', { max: MAX_ANCHORS })}</Muted>
      )}

      <Field
        label={t('form.notes')}
        value={notes}
        onChangeText={setNotes}
        multiline
        maxLength={NOTES_MAX}
        hint={t('form.notesHint', { count: notes.trim().length, max: NOTES_MAX })}
        error={issueText(issues.notes, NOTES_MAX)}
      />

      <Muted>{t('form.consent')}</Muted>
      <Button label={t('form.start')} icon="sparkles-outline" onPress={() => void submit()} loading={pending} fullWidth />
    </Card>
  )
}
