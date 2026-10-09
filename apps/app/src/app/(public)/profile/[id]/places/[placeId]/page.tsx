import { notFound, redirect } from "next/navigation"
import Link from "next/link"
import { getTranslations, getLocale } from "next-intl/server"
import { getCountryName } from "@genealogiq/core"
import { Map, MapPin, SquarePen, CalendarDays } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AuroraBackdrop } from "@/components/aurora-backdrop"
import { BackButton } from "@/components/back-button"
import { PlacePhotoGrid } from "@/components/place-photo-grid"
import { PlaceQrTrigger } from "@/components/place-qr-trigger"
import { PlaceQrDisplay } from "@/components/place-qr-display"
import { SignupPrompt } from "@/components/auth/signup-prompt"
import { auth } from "@/auth"
import { getPlaceById, ANON_PLACES_LIMIT } from "@/queries/places"
import { getProfileById } from "@/queries/profile"
import { canManageProfile } from "@/lib/profile"
import { assertPublicMemorialAccess } from "@/lib/public-profile-access"
import { formatDateProse } from "@/lib/format-date"
import { getMemorialFeatures } from "@/lib/subscription"

interface Props {
  params: Promise<{ id: string; placeId: string }>
}

export default async function PlaceDetailPage({ params }: Props) {
  const { id, placeId } = await params
  const session = await auth()
  const viewerId = session?.user?.id
  const isAnon = !viewerId
  const locale = await getLocale()
  const t = await getTranslations("Places")
  const tc = await getTranslations("Common")

  const profile = await getProfileById(id)
  assertPublicMemorialAccess(profile, viewerId, id)

  const isOwn = viewerId ? canManageProfile(profile, viewerId) : false
  const place = await getPlaceById(id, placeId, isAnon ? ANON_PLACES_LIMIT : undefined)
  if (!place) {
    // For anon, a null here is ambiguous by design (doesn't exist vs. exists
    // but past the anon limit) — send them to the list, which already shows
    // the correct truncated view and its own wall, instead of inventing a
    // second "you've hit the limit" UI just for this route.
    if (isAnon) redirect(`/profile/${id}/places`)
    notFound()
  }

  const canDownloadQr = viewerId && place.qrGenerated
    ? (await getMemorialFeatures(viewerId)).code === "PREMIUM"
    : false

  const addressLine = [place.neighborhood, place.city, place.state, getCountryName(place.country, locale)]
    .filter(Boolean)
    .join(", ")
  const hasCoordinates = place.lat !== 0 || place.lon !== 0
  const hasDates = Boolean(place.startDate || place.endDate)
  const coordFormat = new Intl.NumberFormat(locale, { minimumFractionDigits: 4, maximumFractionDigits: 4 })

  return (
    <div className="relative overflow-x-hidden">
      <AuroraBackdrop variant="page" intensity="bold" />

      <main className="container relative pt-24 pb-32">
        {/* Header — title+back left, actions right, same line, mirrors the
            list page's title row. The QR trigger only shows up while the
            code hasn't been generated yet; once place.qrGenerated persists,
            it's gone for good and the code itself shows up in the content
            grid below instead. Not gated to isOwn (unlike Edit) — generating
            a place's QR has always been open to any viewer. The title can
            wrap (no whitespace-nowrap) once space gets tight. */}
        <div className="flex items-start justify-between gap-3 mb-2 animate-fade-in">
          <div className="flex items-start gap-3 md:gap-4 min-w-0">
            <BackButton href={`/profile/${id}/places`} label={t("backToPlaces")} />
            <div className="min-w-0">
              <h1 className="text-4xl font-semibold tracking-tight">{place.title}</h1>
            </div>
          </div>
          {/* h-9 md:h-10 matches BackButton's own responsive size, which in
              turn matches text-4xl's 40px line-height at md+ — so this box's
              vertical center lands on the center of the title's first line
              even if the title wraps to a second line below it. */}
          <div className="h-9 md:h-10 flex items-center gap-2 shrink-0">
            {!place.qrGenerated && <PlaceQrTrigger profileId={id} placeId={placeId} />}
            {isOwn && (
              <Button asChild className="gap-2">
                <Link href={`/profile/${id}/places/${placeId}/edit`}>
                  <SquarePen className="h-4 w-4" />
                  <span className="sr-only md:not-sr-only">{tc("edit")}</span>
                </Link>
              </Button>
            )}
          </div>
        </div>

        <p className="text-muted-foreground italic mb-3 animate-fade-in">{t("detailTitle")}</p>

        {/* Content grid: description 2/3-3/4, geolocation data 1/3-1/4.
            Single column below md, geo data first. Extra mt- here (vs. the
            mb-2/mb-3 above) is the deliberately larger gap between the
            title/subtitle/actions area and this. */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-3 lg:grid-cols-4 gap-8 animate-fade-in">
          <div className="order-2 md:order-1 md:col-span-2 lg:col-span-3 min-w-0">
            {place.description && (
              <p className="leading-relaxed whitespace-pre-wrap">{place.description}</p>
            )}

            {place.photos.length > 0 && (
              <div className="mt-8 animate-fade-in" style={{ animationDelay: "80ms" }}>
                <PlacePhotoGrid photos={place.photos} title={place.title} />
              </div>
            )}
          </div>

          <div className="order-1 md:order-2 md:col-span-1 lg:col-span-1 flex flex-col">
            <div className="items-end flex flex-col gap-6">
              {place.qrGenerated && (
                <PlaceQrDisplay profileId={id} placeId={placeId} canDownload={canDownloadQr} />
              )}

              <div className="w-fit items-start flex flex-col gap-1 text-sm text-muted-foreground">
                {hasCoordinates && (
                  <>
                    <div className="flex gap-2">
                      <MapPin className="h-4 w-4 text-primary shrink-0" />
                      <div className="flex flex-col gap-1">
                        <span className="tabular-nums">{coordFormat.format(place.lat)} {coordFormat.format(place.lon)}</span>
                        {addressLine && <p>{addressLine}</p>}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pb-6">
                      <Map className="h-4 w-4 text-primary shrink-0" />
                      <Link href={`/profile/${id}/places/map`} className="text-primary hover:underline">
                        {t("viewMap")}
                      </Link>
                    </div>
                  </>
                )}

                {hasDates && (
                  <div className="flex gap-2">
                    <CalendarDays className="h-4 w-4 text-primary shrink-0" />
                    <div className="flex flex-col gap-1">
                      {place.startDate && <span>{formatDateProse(place.startDate, locale)}</span>}
                      {place.endDate && <span>{formatDateProse(place.endDate, locale)}</span>}
                    </div>
                  </div>
                )}
              </div>

              {place.categories.length > 0 && (
                <div className="flex flex-wrap justify-end gap-1.5">
                  {place.categories.map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center rounded-full bg-primary text-primary-foreground text-xs font-semibold px-2.5 py-0.5 lowercase"
                    >
                      {t(`cat_${c}`)}
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>

      {isAnon && <SignupPrompt />}
    </div>
  )
}
