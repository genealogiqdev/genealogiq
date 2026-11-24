import { Stack, useLocalSearchParams, useRouter } from 'expo-router'
import { useState } from 'react'
import { appApi } from '@/api/app'
import { LimitReachedSheet } from '@/features/app/LimitReached'
import { PetForm } from '@/features/app/PetForm'
import { useRequireAppSession } from '@/features/app/session'
import { useT } from '@/i18n'
import { useInvalidate, useView } from '@/lib/query'
import { Button, EmptyState, LoadingState, Muted, QueryView, Screen } from '@/ui'

/** Register a pet for a person the viewer manages (403 otherwise), within the plan's pet limit. */
export default function NewPet() {
  const user = useRequireAppSession()
  const t = useT('Pets')
  const tl = useT('LimitReached')
  const router = useRouter()
  const params = useLocalSearchParams<{ id: string }>()
  const id = params.id ?? ''
  const invalidate = useInvalidate('app')
  const status = useView('app', ['petNew', id], () => appApi.petNew(id), { enabled: !!user && !!id })
  // The plan code decides the wording of a refusal (pets are Premium-only on FREE).
  const me = useView('app', ['me'], appApi.me, { enabled: !!user && status.data?.allowed === false })
  const [limitOpen, setLimitOpen] = useState(false)

  if (!user) return <LoadingState />

  return (
    <Screen refreshing={status.isRefetching} onRefresh={() => void status.refetch()}>
      <Stack.Screen options={{ title: t('newPage.title') }} />
      <QueryView query={status}>
        {(data) => {
          if (data.allowed) {
            return (
              <>
                <Muted>{t('newPage.subtitle')}</Muted>
                <PetForm
                  initial={{ firstName: '', species: null, breed: null, gender: null, birthDate: null, deathDate: null, avatarUrl: null, ownerIds: [data.ownerId] }}
                  ownerOptions={data.ownerOptions}
                  submitLabel={t('actions.createProfile')}
                  successMessage={t('toasts.created')}
                  submit={(payload) => appApi.createPet(payload, data.ownerId)}
                  onSaved={async (response) => {
                    await invalidate()
                    const created = (response.data as { id?: string } | undefined)?.id
                    router.replace(created ? `/profile/${created}` : `/profile/${id}/pets`)
                  }}
                />
              </>
            )
          }
          const tier = me.data?.plan.code ?? (data.limit === 0 ? 'FREE' : 'PREMIUM')
          const locked = tier === 'FREE' && data.limit === 0
          return (
            <>
              <EmptyState
                icon="paw-outline"
                title={locked ? tl('title.petsLocked') : tl('title.pets')}
                description={locked ? tl('description.petsLocked') : tl('description.pets', { limit: data.limit })}
                action={<Button label={tl(tier === 'FREE' ? 'cta.upgrade' : 'cta.maxedOut')} onPress={() => setLimitOpen(true)} />}
              />
              <LimitReachedSheet visible={limitOpen} onClose={() => setLimitOpen(false)} context="pets" limit={data.limit} tier={tier} returnPath={`/profile/${id}/pets`} />
            </>
          )
        }}
      </QueryView>
    </Screen>
  )
}
