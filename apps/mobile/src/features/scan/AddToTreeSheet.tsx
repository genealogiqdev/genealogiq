import { useEffect, useState } from 'react'
import { Pressable, ScrollView, Text as RNText, View } from 'react-native'
import { appApi } from '@/api/app'
import type { ScanNode } from '@/api/scan'
import { useErrorMessage, useT } from '@/i18n'
import { useInvalidate } from '@/lib/query'
import { Button, confirm, Field, Icon, Muted, Sheet, Text } from '@/ui'
import { parseYears, readYearField, splitPersonLabel, yearToDate } from './tree-import'

/** The `kind` values of the server's addGhostRelative: who this person is to the anchor (the user). */
const KINDS = ['parent', 'child', 'spouse', 'sibling'] as const
type Kind = (typeof KINDS)[number]
const NAME_MAX = 64

interface Props {
  /** The person note to add; null closes the sheet. */
  node: ScanNode | null
  /** The signed-in user: both the tree root and the person the relation is to. */
  userId: string
  onClose: () => void
}

/**
 * "Add to my tree": creates a new person in the user's own family tree from a
 * scan note. Nothing is saved until the user has picked the relation, reviewed
 * the prefilled fields and confirmed.
 */
export function AddToTreeSheet({ node, userId, onClose }: Props) {
  const t = useT('Mobile.scan')
  const tc = useT('Mobile.common')
  const errorMessage = useErrorMessage()
  const invalidate = useInvalidate('app')

  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [kind, setKind] = useState<Kind | null>(null)
  const [birthYear, setBirthYear] = useState('')
  const [deathYear, setDeathYear] = useState('')
  const [approximate, setApproximate] = useState(false)
  const [showIssues, setShowIssues] = useState(false)
  const [pending, setPending] = useState(false)
  const [failure, setFailure] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

  const nodeId = node?.id ?? null
  useEffect(() => {
    if (!node) return
    const name = splitPersonLabel(node.label)
    const years = parseYears(node.years)
    setFirstName(name.firstName)
    setLastName(name.lastName)
    setBirthYear(years.birthYear === null ? '' : String(years.birthYear))
    setDeathYear(years.deathYear === null ? '' : String(years.deathYear))
    setApproximate(years.approximate)
    setKind(null)
    setShowIssues(false)
    setFailure(null)
    setDone(null)
    // Prefill once per note, not on every poll that re-creates the node object.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId])

  const birth = readYearField(birthYear)
  const death = readYearField(deathYear)
  const issues = {
    firstName: firstName.trim() ? null : t('tree.required'),
    lastName: lastName.trim() ? null : t('tree.required'),
    kind: kind ? null : t('tree.relationRequired'),
    birthYear: birth === 'invalid' ? t('tree.invalidYear') : null,
    deathYear: death === 'invalid' ? t('tree.invalidYear') : typeof birth === 'number' && typeof death === 'number' && death < birth ? t('tree.deathBeforeBirth') : null,
  }
  const valid = Object.values(issues).every((issue) => issue === null)

  async function submit() {
    setShowIssues(true)
    setFailure(null)
    if (!node || !valid || !kind || birth === 'invalid' || death === 'invalid') return
    const name = `${firstName.trim()} ${lastName.trim()}`
    const lines = [t('tree.confirmBody', { name, relation: t(`tree.kinds.${kind}`) })]
    if (birth !== null || death !== null) lines.push(t('tree.yearNote'))
    // A lead that no source supports must never slip into the tree unnoticed.
    if (node.confidence === 'speculative') lines.push(t('tree.speculativeWarning'))
    const accepted = await confirm({
      title: t('tree.confirmTitle'),
      message: lines.join('\n\n'),
      confirmLabel: t('tree.confirm'),
      cancelLabel: tc('cancel'),
    })
    if (!accepted) return

    setPending(true)
    try {
      const response = await appApi.addGhostRelative(userId, {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        anchorId: userId,
        kind,
        birthDate: yearToDate(birth),
        deathDate: yearToDate(death),
      })
      if (!response.ok) {
        // Already localised by the server (not authorised, tree limit reached, rate limit…).
        setFailure(response.message)
        return
      }
      await invalidate(['tree'], ['me'])
      setDone(response.message || t('tree.added', { name }))
    } catch (error) {
      setFailure(errorMessage(error))
    } finally {
      setPending(false)
    }
  }

  return (
    <Sheet visible={node !== null} onClose={onClose} title={t('tree.title')}>
      {done ? (
        <View className="items-center gap-3 py-6">
          <Icon name="checkmark-circle-outline" size={40} />
          <Text className="text-center" accessibilityLiveRegion="polite">
            {done}
          </Text>
          <Button label={tc('done')} onPress={onClose} />
        </View>
      ) : (
        <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 14, paddingBottom: 8 }}>
          <Muted>{t('tree.explain')}</Muted>
          {node?.confidence === 'speculative' ? (
            <View className="flex-row gap-2 rounded-xl border border-border bg-default p-3">
              <Icon name="warning-outline" size={18} />
              <Text className="flex-1 text-sm">{t('tree.speculativeWarning')}</Text>
            </View>
          ) : null}

          <Field label={t('tree.firstName')} value={firstName} onChangeText={setFirstName} maxLength={NAME_MAX} required autoCapitalize="words" error={showIssues ? issues.firstName : null} />
          <Field label={t('tree.lastName')} value={lastName} onChangeText={setLastName} maxLength={NAME_MAX} required autoCapitalize="words" error={showIssues ? issues.lastName : null} />

          <View className="gap-2" accessibilityRole="radiogroup" accessibilityLabel={t('tree.relation')}>
            <RNText className="text-sm font-medium text-foreground">{t('tree.relation')}</RNText>
            <View className="flex-row flex-wrap gap-2">
              {KINDS.map((option) => {
                const selected = option === kind
                return (
                  <Pressable
                    key={option}
                    onPress={() => setKind(option)}
                    accessibilityRole="radio"
                    accessibilityState={{ selected, checked: selected }}
                    className={`min-h-11 justify-center rounded-full border px-4 ${selected ? 'border-accent bg-accent' : 'border-border bg-surface'}`}
                  >
                    <RNText className={`text-sm font-medium ${selected ? 'text-accent-foreground' : 'text-foreground'}`}>{t(`tree.kinds.${option}`)}</RNText>
                  </Pressable>
                )
              })}
            </View>
            {showIssues && issues.kind ? <RNText className="text-sm text-danger">{issues.kind}</RNText> : null}
          </View>

          <View className="flex-row gap-3">
            <View className="flex-1">
              <Field label={t('tree.birthYear')} value={birthYear} onChangeText={setBirthYear} keyboardType="number-pad" maxLength={4} error={showIssues ? issues.birthYear : null} />
            </View>
            <View className="flex-1">
              <Field label={t('tree.deathYear')} value={deathYear} onChangeText={setDeathYear} keyboardType="number-pad" maxLength={4} error={showIssues ? issues.deathYear : null} />
            </View>
          </View>
          <Muted>{approximate ? `${t('tree.approximate')} ${t('tree.yearNote')}` : t('tree.yearNote')}</Muted>

          {failure ? (
            <Text className="text-sm text-danger" accessibilityRole="alert" accessibilityLiveRegion="assertive">
              {failure}
            </Text>
          ) : null}
          <Button label={t('tree.action')} icon="git-network-outline" onPress={() => void submit()} loading={pending} fullWidth />
        </ScrollView>
      )}
    </Sheet>
  )
}
