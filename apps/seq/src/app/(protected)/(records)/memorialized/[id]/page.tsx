import { notFound } from 'next/navigation'
import { getDeceased } from '@/queries/deceased'
import { getCustomer } from '@/queries/customers'
import { MemorializedForm } from '@/components/memorialized/memorialized-form'
import { QrCodeDownloadDialog } from '@/components/memorialized/qr-code-download-dialog'
import { QrStatusCard } from '@/components/memorialized/qr-status-card'
import type { DeceasedFormValues } from '@/schemas/deceased.schema'

export default async function MemorializedDetailPage({ params, searchParams }: {
  params: Promise<{ id: string }>
  searchParams: Promise<{ customerId?: string }>
}) {
  const { id } = await params
  const deceased = await getDeceased(id)
  if (!deceased) notFound()
  const { customerId: requestedCustomerId } = await searchParams
  if (requestedCustomerId && !deceased.guardianCustomerIds.includes(requestedCustomerId)) notFound()
  const customerId = requestedCustomerId ?? deceased.guardianCustomerIds[0]
  const customer = customerId ? await getCustomer(customerId) : null
  const qrProfile = customer?.guardiansOf.find(({ appUser }) => appUser.id === id)?.appUser

  const defaultValues: DeceasedFormValues = {
    firstName:          deceased.firstName,
    lastName:           deceased.lastName,
    gender:             (deceased.gender as DeceasedFormValues['gender']) ?? null,
    birthDate:          deceased.birthDate ? deceased.birthDate.toISOString().slice(0, 10) : '',
    birthCity:          deceased.birthCity          ?? '',
    birthState:         deceased.birthState         ?? '',
    birthCountry:       deceased.birthCountry       ?? '',
    deathDate:          deceased.deathDate ? deceased.deathDate.toISOString().slice(0, 10) : '',
    deathCause:         deceased.deathCause         ?? '',
    deathCity:          deceased.deathCity          ?? '',
    deathState:         deceased.deathState         ?? '',
    deathCountry:       deceased.deathCountry       ?? '',
    burialDate:         deceased.burialDate,
    burialLatitude:     deceased.burialLatitude  !== null ? Number(deceased.burialLatitude)  : null,
    burialLongitude:    deceased.burialLongitude !== null ? Number(deceased.burialLongitude) : null,
    burialSite:         deceased.burialSite         ?? '',
    burialZip:          deceased.burialZip          ?? '',
    burialStreet:       deceased.burialStreet       ?? '',
    burialNumber:       deceased.burialNumber       ?? '',
    burialComplement:   deceased.burialComplement   ?? '',
    burialNeighborhood: deceased.burialNeighborhood ?? '',
    burialCity:         deceased.burialCity         ?? '',
    burialState:        deceased.burialState        ?? '',
    burialCountry:      deceased.burialCountry      ?? '',
    fb:                 deceased.fb                 ?? '',
    instagram:          deceased.instagram          ?? '',
    linkedin:           deceased.linkedin           ?? '',
    tiktok:             deceased.tiktok             ?? '',
    x:                  deceased.x                  ?? '',
    youtube:            deceased.youtube            ?? '',
    otherSocial:        deceased.otherSocial        ?? '',
    website:            deceased.website            ?? '',
    notes:              deceased.notes              ?? '',
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="scroll-m-20 text-4xl font-semibold tracking-tight text-balance">
        {deceased.firstName} {deceased.lastName}
      </h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <MemorializedForm id={id} defaultValues={defaultValues} />
        </div>
        <aside className="lg:col-span-1 flex flex-col gap-4">
          <div className="lg:sticky lg:top-20 flex flex-col gap-4">
            {deceased.qrCode && (
              <QrStatusCard appUserId={id} qrCode={deceased.qrCode} />
            )}
            {qrProfile && <QrCodeDownloadDialog
              name={`${deceased.firstName} ${deceased.lastName}`.trim()}
              customerId={qrProfile.customerId}
              profileId={id}
              access={qrProfile.qrAccess}
            />}
          </div>
        </aside>
      </div>
    </div>
  )
}
