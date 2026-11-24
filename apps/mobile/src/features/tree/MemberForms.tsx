import { useRef, useState } from 'react'
import { View } from 'react-native'
import { appApi, type TreePerson, type TreeRelation } from '@/api/app'
import { useRequireAppSession } from '@/features/app/session'
import { useT } from '@/i18n'
import { Button, DateField, Field, Muted, SelectField, Text, confirm, useAction, useNotify, type Option } from '@/ui'
import { personName } from './PersonNode'
import { PortraitPicker } from './PortraitPicker'
import { TreeSheet } from './TreeSheet'
import type { Gender } from './wikitree'

// Subtype canon of the web schemas (`family-tree.schema.ts`); "blood" is a null subtype.
export const PARENT_OF_SUBTYPES = ['adopted', 'step'] as const
export const SPOUSE_SUBTYPES = ['married', 'divorced', 'partner', 'widowed'] as const
export const SIBLING_SUBTYPES = ['half', 'adopted', 'step'] as const
export type SpouseSubtype = (typeof SPOUSE_SUBTYPES)[number]

const STANDARD = '__standard'

export const toInputDate = (iso: string | null | undefined) => (iso ? iso.slice(0, 10) : '')

export function useGenderOptions(): Option<Gender>[] {
  const t = useT('FamilyTree')
  return [
    { value: 'FEMALE', label: t('gender.female') },
    { value: 'MALE', label: t('gender.male') },
    { value: 'OTHER', label: t('gender.other') },
  ]
}

/* ------------------------------ Identity fields ----------------------------- */

export interface IdentityValues {
  firstName: string
  lastName: string
  maidenName: string
  nickname: string
  gender: Gender | ''
  birthDate: string
  deathDate: string
  birthPlace: string
  deathPlace: string
}

export const emptyIdentity: IdentityValues = {
  firstName: '',
  lastName: '',
  maidenName: '',
  nickname: '',
  gender: '',
  birthDate: '',
  deathDate: '',
  birthPlace: '',
  deathPlace: '',
}

/** The payload shape shared by `addGhostRelative` and `updateMember`. */
export function identityPayload(values: IdentityValues) {
  return {
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    maidenName: values.maidenName.trim() || null,
    nickname: values.nickname.trim() || null,
    gender: values.gender || null,
    birthDate: values.birthDate || null,
    deathDate: values.deathDate || null,
    birthPlace: values.birthPlace.trim() || null,
    deathPlace: values.deathPlace.trim() || null,
  }
}

export function IdentityFields({ values, onChange }: { values: IdentityValues; onChange: (patch: Partial<IdentityValues>) => void }) {
  const t = useT('FamilyTree')
  const genders = useGenderOptions()
  return (
    <>
      <Field label={t('fields.firstName')} required value={values.firstName} onChangeText={(firstName) => onChange({ firstName })} maxLength={64} />
      <Field label={t('fields.lastName')} required value={values.lastName} onChangeText={(lastName) => onChange({ lastName })} maxLength={64} />
      <Field label={t('fields.maidenName')} value={values.maidenName} onChangeText={(maidenName) => onChange({ maidenName })} maxLength={64} />
      <Field label={t('fields.nickname')} value={values.nickname} onChangeText={(nickname) => onChange({ nickname })} maxLength={40} />
      <SelectField
        label={t('fields.gender')}
        placeholder={t('fields.genderSelect')}
        value={values.gender || null}
        options={genders}
        onChange={(gender) => onChange({ gender })}
      />
      <DateField label={t('fields.birthDate')} value={values.birthDate} onChange={(birthDate) => onChange({ birthDate })} maximumDate={new Date()} />
      <DateField label={t('fields.deathDate')} value={values.deathDate} onChange={(deathDate) => onChange({ deathDate })} maximumDate={new Date()} />
      <Field label={t('fields.birthPlace')} value={values.birthPlace} onChangeText={(birthPlace) => onChange({ birthPlace })} maxLength={100} />
      <Field label={t('fields.deathPlace')} value={values.deathPlace} onChangeText={(deathPlace) => onChange({ deathPlace })} maxLength={100} />
    </>
  )
}

/* -------------------------------- Edit member ------------------------------- */

interface EditMemberProps {
  rootId: string
  person: TreePerson
  onClose: () => void
  onSaved: () => void
}

/** Mounted only while open. */
export function EditMemberSheet({ rootId, person, onClose, onSaved }: EditMemberProps) {
  const t = useT('FamilyTree')
  const tc = useT('Common')
  const user = useRequireAppSession()
  const notify = useNotify()
  const { run, pending } = useAction()
  const saved = useRef(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(person.avatarUrl)
  const [uploading, setUploading] = useState(false)
  const [values, setValues] = useState<IdentityValues>({
    firstName: person.firstName,
    lastName: person.lastName,
    maidenName: person.maidenName ?? '',
    nickname: person.nickname ?? '',
    gender: (person.gender as Gender | null) ?? '',
    birthDate: toInputDate(person.birthDate),
    deathDate: toInputDate(person.deathDate),
    birthPlace: person.birthPlace ?? '',
    deathPlace: person.deathPlace ?? '',
  })

  if (!user) return null

  const save = () => {
    if (uploading) return notify.info(t('portrait.waitUploading'))
    if (!values.firstName.trim() || !values.lastName.trim()) return notify.error(t('toasts.nameRequired'))
    void run(() => appApi.updateMember(rootId, person.id, { ...identityPayload(values), avatarUrl }), {
      success: t('toasts.personUpdated'),
      onSuccess: () => {
        saved.current = true
        onSaved()
      },
    })
  }

  return (
    <TreeSheet
      visible
      onClose={pending || uploading ? () => undefined : onClose}
      title={t('editMember.title')}
      footer={<Button label={pending ? tc('saving') : tc('save')} onPress={save} loading={pending} disabled={uploading} fullWidth />}
    >
      <PortraitPicker
        value={avatarUrl}
        name={`${values.firstName} ${values.lastName}`.trim()}
        payload={{ profileId: person.id }}
        disabled={pending}
        savedRef={saved}
        onChange={setAvatarUrl}
        onUploadingChange={setUploading}
      />
      <IdentityFields values={values} onChange={(patch) => setValues((current) => ({ ...current, ...patch }))} />
    </TreeSheet>
  )
}

/* ------------------------------- Edit relation ------------------------------ */

interface EditRelationProps {
  rootId: string
  relation: TreeRelation
  persons: Record<string, TreePerson>
  sessionUserId: string | null
  /** Tree manager, or the requester of a still-pending invite: may edit and remove. */
  canEdit: boolean
  onClose: () => void
  onSaved: () => void
}

/**
 * Subtype and dates of one relation, its removal, and — for a pending request
 * addressed to the viewer — accept / decline. Mounted only while open.
 */
export function EditRelationSheet({ rootId, relation, persons, sessionUserId, canEdit, onClose, onSaved }: EditRelationProps) {
  const t = useT('FamilyTree')
  const tc = useT('Common')
  const tm = useT('Mobile.tree')
  const user = useRequireAppSession()
  const { run, pending } = useAction()
  const [subtype, setSubtype] = useState<string>(relation.subtype ?? (relation.type === 'SPOUSE' ? 'married' : STANDARD))
  const [startDate, setStartDate] = useState(toInputDate(relation.startDate))
  const [endDate, setEndDate] = useState(toInputDate(relation.endDate))

  if (!user) return null

  const from = persons[relation.fromId]
  const to = persons[relation.toId]
  const subtypes: readonly string[] =
    relation.type === 'SPOUSE' ? SPOUSE_SUBTYPES : relation.type === 'SIBLING' ? SIBLING_SUBTYPES : PARENT_OF_SUBTYPES
  const options: Option[] = [
    ...(relation.type !== 'SPOUSE' ? [{ value: STANDARD, label: t('subtypes.standard') }] : []),
    ...subtypes.map((value) => ({ value, label: t(`subtypes.${value}`) })),
  ]
  const showEnd = relation.type === 'SPOUSE' && (subtype === 'divorced' || subtype === 'widowed')
  const showStart = relation.type === 'SPOUSE' || (relation.type === 'PARENT_OF' && (subtype === 'adopted' || subtype === 'step'))

  // Same rule as the server: the request must touch the viewer and not come from them.
  const isIncomingRequest =
    relation.status === 'PENDING' &&
    !!sessionUserId &&
    (relation.fromId === sessionUserId || relation.toId === sessionUserId) &&
    relation.requestedById !== sessionUserId
  const requester = relation.requestedById ? persons[relation.requestedById] : null

  const save = () =>
    void run(
      () =>
        appApi.updateRelation(rootId, relation.id, {
          subtype: subtype === STANDARD ? null : subtype,
          startDate: showStart && startDate ? startDate : null,
          endDate: showEnd && endDate ? endDate : null,
        }),
      { success: t('toasts.relationUpdated'), onSuccess: onSaved },
    )

  const remove = async () => {
    const ok = await confirm({
      title: t('editRelation.removeRelation'),
      message: tm('removeRelationConfirm'),
      confirmLabel: tc('remove'),
      cancelLabel: tc('cancel'),
      destructive: true,
    })
    if (ok) void run(() => appApi.removeRelation(rootId, relation.id), { success: t('toasts.relationRemoved'), onSuccess: onSaved })
  }

  const accept = () => void run(() => appApi.acceptFamilyRequest(relation.id), { success: tm('requestAccepted'), onSuccess: onSaved })

  const decline = async () => {
    const ok = await confirm({
      title: tm('declineRequest'),
      message: tm('declineRequestConfirm'),
      confirmLabel: tm('declineRequest'),
      cancelLabel: tc('cancel'),
      destructive: true,
    })
    if (ok) void run(() => appApi.rejectFamilyRequest(relation.id), { success: tm('requestDeclined'), onSuccess: onSaved })
  }

  return (
    <TreeSheet
      visible
      onClose={pending ? () => undefined : onClose}
      title={t('editRelation.title')}
      footer={canEdit ? <Button label={pending ? tc('saving') : tc('save')} onPress={save} loading={pending} fullWidth /> : undefined}
    >
      {from && to ? (
        <Text>
          {personName(from)} · {personName(to)}
        </Text>
      ) : null}

      {isIncomingRequest ? (
        <View className="gap-2 rounded-2xl border border-border bg-surface p-3">
          <Muted>{requester ? tm('requestFrom', { name: personName(requester) }) : tm('requestPending')}</Muted>
          <View className="flex-row gap-2">
            <Button label={tm('acceptRequest')} icon="checkmark" onPress={accept} disabled={pending} className="flex-1" />
            <Button label={tm('declineRequest')} icon="close" variant="danger-soft" onPress={() => void decline()} disabled={pending} className="flex-1" />
          </View>
        </View>
      ) : null}

      {canEdit ? (
        <>
          <SelectField label={t('editRelation.typeLabel')} value={subtype} options={options} onChange={setSubtype} />
          {showStart ? (
            <DateField
              label={relation.type === 'SPOUSE' ? t('editRelation.married') : t('editRelation.started')}
              value={startDate}
              onChange={setStartDate}
              maximumDate={new Date()}
            />
          ) : null}
          {showEnd ? (
            <DateField
              label={subtype === 'widowed' ? t('editRelation.widowed') : t('editRelation.ended')}
              value={endDate}
              onChange={setEndDate}
              maximumDate={new Date()}
            />
          ) : null}
          <Button label={t('editRelation.removeRelation')} icon="trash-outline" variant="danger-soft" onPress={() => void remove()} disabled={pending} />
        </>
      ) : null}
    </TreeSheet>
  )
}
