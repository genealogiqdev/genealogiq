import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { Clock, Heart, BrickWall, User, ArrowRight } from "lucide-react"
import { verifySession } from "@/lib/dal"
import { GlassIcon } from "@/components/glass-icon"
import { AuroraBackdrop } from "@/components/aurora-backdrop"
import { HomeSearch } from "@/components/home-search"
import { HomeFavorites, VISIBLE as FAVORITES_VISIBLE } from "@/components/home-favorites"
import { HomeMemorials } from "@/components/home-memorials"
import { RecentlyViewedSection } from "@/components/recently-viewed-section"
import { RecentlyViewedCount } from "@/components/recently-viewed-count"
import { Greeting } from "@/components/greeting"
import { ScanQrButton } from "@/components/scan-qr-button"
import { InstallBanner } from "@/components/install-banner"
import { prisma } from "@/lib/prisma"
import { getFavoritesByUserId } from "@/queries/favorite"
import { getGuardedProfilesByGuardianId } from "@/queries/memorial"

export default async function HomePage() {
  const session = await verifySession()
  const userId = session.user.id
  const t = await getTranslations("Home")

  const [favorites, memorials, currentUser] = await Promise.all([
    getFavoritesByUserId(userId, userId),
    getGuardedProfilesByGuardianId(userId),
    prisma.appUser.findUnique({ where: { id: userId }, select: { firstName: true } }),
  ])

  const firstName = currentUser?.firstName ?? t("greetingFallbackName")

  return (
    <div className="relative overflow-x-hidden">
      <AuroraBackdrop />

      <main className="container relative pt-24 pb-32">
        {/* Hero */}
        <div className="mb-8 animate-fade-in">
          <h1 className="text-4xl font-semibold tracking-tight">
            <Greeting firstName={firstName} />
          </h1>
          <p className="text-muted-foreground mt-2 italic">
            {t("tagline")}
          </p>
        </div>

        <InstallBanner />

        {/* Action row */}
        <section className="relative z-10 mb-8 flex flex-col-reverse lg:flex-row gap-3 md:gap-4 animate-fade-in" style={{ animationDelay: "80ms" }}>
          <HomeSearch />

          <ScanQrButton />
        </section>

        {/* Quick actions */}
        <section className="mb-[4.5rem] grid grid-cols-2 md:grid-cols-4 gap-3 animate-fade-in" style={{ animationDelay: "160ms" }}>
          <Link href="/profile" className="glass-card flex items-center gap-3 px-4 py-3">
            <GlassIcon icon={User} size="sm" />
            <div className="min-w-0">
              <p className="text-sm font-semibold leading-tight truncate">{t("myProfileTitle")}</p>
              <p className="text-xs text-muted-foreground truncate">{t("myProfileSubtitle")}</p>
            </div>
          </Link>

          <a href="#recently-viewed" className="glass-card flex items-center gap-3 px-4 py-3">
            <GlassIcon icon={Clock} size="sm" />
            <div className="min-w-0">
              <p className="text-lg font-semibold leading-tight"><RecentlyViewedCount /></p>
              <p className="text-xs text-muted-foreground truncate">{t("recentlyViewedShort")}</p>
            </div>
          </a>

          <a href="#favorites" className="glass-card flex items-center gap-3 px-4 py-3">
            <GlassIcon icon={Heart} size="sm" />
            <div className="min-w-0">
              <p className="text-lg font-semibold leading-tight">{favorites.length}</p>
              <p className="text-xs text-muted-foreground truncate">{t("favoritesShort")}</p>
            </div>
          </a>

          <a href="#guarded" className="glass-card flex items-center gap-3 px-4 py-3">
            <GlassIcon icon={BrickWall} size="sm" />
            <div className="min-w-0">
              <p className="text-lg font-semibold leading-tight">{memorials.length}</p>
              <p className="text-xs text-muted-foreground truncate">{t("guardedShort")}</p>
            </div>
          </a>
        </section>

        {/* Recently viewed — client-side (localStorage) */}
        <HomeSection
          id="recently-viewed"
          icon={Clock}
          title={t("recentlyViewedTitle")}
          subtitle={t("recentlyViewedSubtitle")}
          seeAllLabel={t("seeAll")}
          delay={200}
        >
          <RecentlyViewedSection />
        </HomeSection>

        {/* My favorites */}
        <HomeSection
          id="favorites"
          icon={Heart}
          title={t("favoritesTitle")}
          subtitle={t("favoritesSubtitle")}
          seeAllLabel={t("seeAll")}
          delay={260}
          // Only worth offering once there is more than this section shows.
          seeMoreHref={favorites.length > FAVORITES_VISIBLE ? `/profile/${userId}/favorites` : undefined}
          emptyIcon={Heart}
          emptyText={t("favoritesEmpty")}
        >
          {favorites.length > 0 ? <HomeFavorites items={favorites} /> : undefined}
        </HomeSection>

        {/* Profiles I guard */}
        <HomeSection
          id="guarded"
          icon={BrickWall}
          title={t("guardedTitle")}
          subtitle={t("guardedSubtitle")}
          seeAllLabel={t("manageGuarded")}
          delay={320}
          seeMoreHref={`/profile/${userId}/memorialized`}
          emptyIcon={BrickWall}
          emptyText={t("guardedEmpty")}
        >
          {memorials.length > 0 ? <HomeMemorials items={memorials} /> : undefined}
        </HomeSection>
      </main>
    </div>
  )
}

interface HomeSectionProps {
  id: string
  icon: typeof Clock
  title: string
  subtitle: string
  seeAllLabel: string
  delay: number
  seeMoreHref?: string
  emptyIcon?: typeof Clock
  emptyText?: string
  children?: React.ReactNode
}

function HomeSection({ id, icon, title, subtitle, seeAllLabel, delay, seeMoreHref, emptyIcon: EmptyIcon, emptyText, children }: HomeSectionProps) {
  return (
    <section id={id} className="mb-[3.75rem] last:mb-0 animate-fade-in scroll-mt-24" style={{ animationDelay: `${delay}ms` }}>
      {/* Icon spans both text lines; "see all" sits at the far right of the subtitle row. */}
      <div className="mb-4 flex items-center gap-3">
        <GlassIcon icon={icon} size="sm" />
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-semibold tracking-tight truncate">{title}</h2>
          <div className="flex items-end justify-between gap-3">
            <p className="text-xs text-muted-foreground truncate">{subtitle}</p>
            {seeMoreHref && (
              <Link
                href={seeMoreHref}
                className="shrink-0 inline-flex items-center gap-1 text-xs md:text-sm font-medium text-[hsl(var(--brand-indigo-deep))] dark:text-[hsl(var(--brand-slate-soft))] hover:opacity-80 transition-opacity"
              >
                {seeAllLabel}
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        </div>
      </div>
      {children ?? (
        EmptyIcon && emptyText ? (
          <div className="glass-card no-sheen px-6 py-10 flex flex-col items-center justify-center gap-3 text-center">
            <EmptyIcon className="h-10 w-10 text-muted-foreground/50" />
            <p className="text-sm text-muted-foreground">{emptyText}</p>
          </div>
        ) : null
      )}
    </section>
  )
}
