import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { appApi, type ProfileEditView } from '@/api/app'
import { PetForm } from '@/features/app/PetForm'
import { fullName } from '@/features/app/ProfileCards'
import { ProfileEditForm } from '@/features/app/ProfileEditForm'
import { useRequireAppSession } from '@/features/app/session'
import { useT } from '@/i18n'
import { useInvalidate, useView } from '@/lib/query'
import { Button, LoadingState, Muted, QueryView, Screen, confirm, useAction } from '@/ui'

function DeleteProfile({ data }: { data: ProfileEditView }) {
  const pet = data.type === 'pet'
  const t = useT(pet ? 'Pets' : 'Memorialized')
  const tc = useT('Mobile.common')
  const router = useRouter()
  const invalidate = useInvalidate('app')
  const { run, pending } = useAction()
  const { profile } = data

  async function remove() {
    const confirmed = await confirm({
      title: t('delete.title'),
      message: t('delete.description', { name: fullName(profile) }),
      confirmLabel: t('delete.button'),
      cancelLabel: tc('cancel'),
      destructive: true,
    })
    if (!confirmed) return
    await run(() => (pet ? appApi.deletePet(profile.id) : appApi.deleteMemorial(profile.id)), {
      success: t('toasts.deleted'),
      onSuccess: async () => {
        await invalidate()
        if (router.canDismiss()) router.dismissAll()
        router.replace('/home')
      },
    })
  }

  return <Button label={t('delete.button')} variant="danger-soft" icon="trash-outline" loading={pending} onPress={() => void remove()} fullWidth />
}

/** Edit a memorial, a pet or the signed-in user's own profile. Managers only (the view answers 403 otherwise). */
export default function EditProfile() {
  const user = useRequireAppSession()
  const t = useT('Memorialized')
  const tp = useT('Pets')
  const tc = useT('Common')
  const params = useLocalSearchParams<{ id: string }>()
  const id = params.id ?? ''
  const invalidate = useInvalidate('app')
  const edit = useView('app', ['profileEdit', id], () => appApi.profileEdit(id), { enabled: !!user && !!id })

  if (!user) return <LoadingState />

  const saved = async () => {
    await invalidate(['profileEdit', id], ['profile'], ['home'], ['me'], ['header'], ['memorialized'], ['pets'], ['favorites'], ['tree'])
  }

  return (
    <Screen refreshing={edit.isRefetching} onRefresh={() => void edit.refetch()}>
      <Stack.Screen options={{ title: t('editPage.title') }} />
      <QueryView query={edit}>
        {(data) => (
          <>
            <Muted>{data.type === 'pet' ? t('editPage.subtitlePet') : data.type === 'memorialized' ? t('editPage.subtitleMemorial') : t('editPage.subtitleLiving')}</Muted>
            {data.type === 'pet' && data.pet ? (
              <PetForm
                profileId={data.profile.id}
                initial={{
                  firstName: data.profile.firstName,
                  species: data.profile.petSpecies,
                  breed: data.profile.petBreed,
                  gender: data.profile.gender,
                  birthDate: data.profile.birthDate,
                  deathDate: data.profile.deathDate,
                  avatarUrl: data.profile.avatarUrl,
                  ownerIds: data.pet.ownerIds,
                }}
                ownerOptions={data.pet.ownerOptions}
                submitLabel={tc('save')}
                successMessage={tp('toasts.saved')}
                submit={(payload) => appApi.updatePet(data.profile.id, payload, data.pet?.rootId)}
                onSaved={saved}
              />
            ) : (
              <ProfileEditForm profile={data.profile} memorial={data.type === 'memorialized'} onSaved={saved} />
            )}
            {data.type !== 'living' ? <DeleteProfile data={data} /> : null}
          </>
        )}
      </QueryView>
    </Screen>
  )
}
