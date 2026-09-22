import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { redirect } from "next/navigation"
import { getTranslations } from "next-intl/server"
import {
  ArrowDown,
  ArrowRight,
  BookOpenText,
  Check,
  FileText,
  Fingerprint,
  Heart,
  Images,
  Infinity as InfinityIcon,
  LockKeyhole,
  MapPin,
  Network,
  PawPrint,
  QrCode,
  ScanLine,
  ShieldCheck,
  Sparkles,
  WandSparkles,
  type LucideIcon,
} from "lucide-react"
import { auth } from "@/auth"
import { Button } from "@/components/ui/button"
import { FamilyTreeDemo } from "@/components/marketing/family-tree-demo"
import { PricingCards, type MarketingPlan } from "@/components/marketing/pricing-cards"
import { Reveal } from "@/components/marketing/reveal"
import { StoryMetrics } from "@/components/marketing/story-metrics"
import { getActiveSubscriptions } from "@/queries/subscriptions"

export async function generateMetadata(): Promise<Metadata> {
  const tMeta = await getTranslations("Marketing")

  return {
    title: tMeta("meta.title"),
    description: tMeta("meta.description"),
    openGraph: {
      title: tMeta("meta.title"),
      description: tMeta("meta.description"),
      images: [{ url: "/landing/family-memorial.png", width: 1472, height: 828 }],
      type: "website",
    },
  }
}

const FEATURES: { key: string; icon: LucideIcon; className: string }[] = [
  { key: "tree", icon: Network, className: "md:col-span-2 md:row-span-2" },
  { key: "biography", icon: BookOpenText, className: "" },
  { key: "gallery", icon: Images, className: "" },
  { key: "places", icon: MapPin, className: "" },
  { key: "documents", icon: FileText, className: "" },
  { key: "tributes", icon: Heart, className: "" },
  { key: "pets", icon: PawPrint, className: "" },
]

const BENEFITS: { key: string; icon: LucideIcon }[] = [
  { key: "family", icon: Network },
  { key: "identity", icon: Fingerprint },
  { key: "future", icon: InfinityIcon },
  { key: "privacy", icon: ShieldCheck },
]

export default async function MarketingHomePage() {
  const session = await auth()
  if (session?.user) redirect("/home")

  const [t, subscriptions] = await Promise.all([
    getTranslations("Marketing"),
    getActiveSubscriptions(),
  ])

  const plans: MarketingPlan[] = subscriptions.map((plan) => ({
    code: plan.code,
    currency: plan.currency,
    id: plan.id,
    monthlyPrice: plan.monthlyPrice,
    name: plan.name,
    price: plan.price,
    quotas: {
      bioMaxChars: plan.quotas.bioMaxChars,
      documentsMax: plan.quotas.documentsMax,
      geoPlacesMax: plan.quotas.geoPlacesMax,
      mediaMaxImages: plan.quotas.mediaMaxImages,
      mediaMaxVideos: plan.quotas.mediaMaxVideos,
      memorialsMax: plan.quotas.memorialsMax,
      petsMax: plan.quotas.petsMax,
      qrCodeMax: plan.quotas.qrCodeMax,
      treeMaxMembers: plan.quotas.treeMaxMembers,
    },
    termLength: plan.termLength,
  }))

  return (
    <main id="top" className="overflow-clip bg-[#070812] text-white">
      <section className="marketing-hero relative flex min-h-svh items-center overflow-hidden px-6 pb-20 pt-32 sm:px-8 lg:pb-24 lg:pt-36">
        <div aria-hidden className="marketing-hero-grid absolute inset-0" />
        <div aria-hidden className="marketing-orb marketing-orb-a" />
        <div aria-hidden className="marketing-orb marketing-orb-b" />

        <div className="relative mx-auto grid w-full max-w-[1240px] items-center gap-14 lg:grid-cols-[0.9fr_1.1fr] lg:gap-8">
          <div className="relative z-10 max-w-2xl">
            <div className="marketing-hero-item inline-flex items-center gap-2 rounded-full border border-violet-300/20 bg-violet-300/8 px-3.5 py-2 text-xs font-semibold text-violet-200">
              <Sparkles className="h-3.5 w-3.5" />
              {t("hero.badge")}
            </div>

            <h1 className="marketing-hero-item marketing-hero-delay-1 mt-7 text-[clamp(3.25rem,7vw,6.9rem)] font-semibold leading-[0.91] tracking-[-0.065em]">
              <span className="block text-white">{t("hero.titleLead")}</span>
              <span className="marketing-gradient-text block pb-2">{t("hero.titleAccent")}</span>
            </h1>
            <p className="marketing-hero-item marketing-hero-delay-2 mt-7 max-w-xl text-base leading-relaxed text-white/55 sm:text-lg">
              {t("hero.description")}
            </p>

            <div className="marketing-hero-item marketing-hero-delay-3 mt-9 flex flex-col gap-3 sm:flex-row">
              <Button asChild size="lg" className="h-12 rounded-full px-7 text-sm shadow-[0_20px_50px_rgba(71,53,170,0.35)]">
                <Link href="/sign-up">
                  {t("hero.primaryCta")}
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button
                asChild
                size="lg"
                variant="outline"
                className="h-12 rounded-full border-white/12 bg-white/5 px-7 text-sm text-white hover:bg-white/10 hover:text-white"
              >
                <Link href="#create">
                  {t("hero.secondaryCta")}
                  <ArrowDown className="h-4 w-4" />
                </Link>
              </Button>
            </div>

            <div className="marketing-hero-item marketing-hero-delay-4 mt-9 flex flex-wrap gap-x-5 gap-y-2 text-xs text-white/40">
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-violet-300" />{t("hero.trust.free")}</span>
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-violet-300" />{t("hero.trust.private")}</span>
              <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-violet-300" />{t("hero.trust.anywhere")}</span>
            </div>
          </div>

          <div className="marketing-hero-item marketing-hero-delay-2 relative mx-auto w-full max-w-[680px] lg:ml-auto">
            <div aria-hidden className="absolute inset-8 rounded-full bg-violet-500/20 blur-[90px]" />
            <div className="marketing-product-window relative rounded-[2rem] border border-white/12 bg-[#111322]/88 p-3 shadow-[0_45px_120px_rgba(0,0,0,0.55)] backdrop-blur-2xl sm:p-4">
              <div className="flex items-center justify-between border-b border-white/8 px-2 pb-3">
                <div className="flex gap-1.5">
                  <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/10" />
                  <span className="h-2.5 w-2.5 rounded-full bg-white/7" />
                </div>
                <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/25">{t("hero.previewLabel")}</span>
                <span className="h-5 w-5 rounded-full bg-gradient-to-br from-violet-300 to-indigo-500" />
              </div>

              <div className="grid gap-3 pt-3 sm:grid-cols-[0.62fr_1.38fr]">
                <aside className="hidden rounded-2xl border border-white/8 bg-white/[0.035] p-3 sm:block">
                  <div className="h-2 w-16 rounded-full bg-white/12" />
                  <div className="mt-5 space-y-2">
                    {[0, 1, 2, 3, 4].map((item) => (
                      <div key={item} className={`flex items-center gap-2 rounded-xl px-2 py-2 ${item === 1 ? "bg-violet-300/12" : ""}`}>
                        <span className={`h-6 w-6 rounded-lg ${item === 1 ? "bg-violet-300/35" : "bg-white/7"}`} />
                        <span className={`h-1.5 rounded-full ${item === 1 ? "w-14 bg-violet-200/45" : "w-12 bg-white/10"}`} />
                      </div>
                    ))}
                  </div>
                </aside>

                <div className="marketing-product-canvas relative min-h-[410px] overflow-hidden rounded-2xl border border-white/8 bg-[radial-gradient(circle_at_50%_32%,rgba(132,116,226,0.18),transparent_43%),rgba(255,255,255,0.025)] sm:min-h-[470px]">
                  <div className="absolute left-5 top-5">
                    <p className="text-[10px] uppercase tracking-[0.16em] text-white/30">{t("hero.previewEyebrow")}</p>
                    <p className="mt-1 text-sm font-semibold text-white/80">{t("hero.previewTitle")}</p>
                  </div>
                  <svg aria-hidden viewBox="0 0 420 360" className="absolute inset-x-[4%] top-16 h-[74%] w-[92%] text-violet-300/35">
                    <g fill="none" stroke="currentColor" strokeWidth="1.5">
                      <path className="marketing-draw-line" d="M110 66 H310" />
                      <path className="marketing-draw-line" d="M210 66 V150" />
                      <path className="marketing-draw-line" d="M80 150 H340" />
                      <path className="marketing-draw-line" d="M80 150 V208 M210 150 V208 M340 150 V208" />
                      <path className="marketing-draw-line" d="M210 260 V310 H310 V326" />
                    </g>
                  </svg>
                  {[
                    ["12%", "18%", "HM", "hero.previewPeople.grandmother"],
                    ["62%", "18%", "JA", "hero.previewPeople.grandfather"],
                    ["5%", "51%", "LP", "hero.previewPeople.aunt"],
                    ["38%", "51%", "MP", "hero.previewPeople.father"],
                    ["72%", "51%", "TP", "hero.previewPeople.mother"],
                    ["61%", "79%", "CP", "hero.previewPeople.you"],
                  ].map(([left, top, initials, key], index) => (
                    <div
                      key={key}
                      className={`marketing-preview-node absolute w-[112px] -translate-x-1/2 rounded-xl border px-2.5 py-2.5 ${index === 5 ? "border-violet-300/45 bg-violet-300/15" : "border-white/9 bg-[#171927]/90"}`}
                      style={{ left, top, animationDelay: `${900 + index * 130}ms` }}
                    >
                      <div className="flex items-center gap-2">
                        <span className={`grid h-7 w-7 place-items-center rounded-lg text-[9px] font-bold ${index === 5 ? "bg-violet-300 text-violet-950" : "bg-white/8 text-white/55"}`}>{initials}</span>
                        <span className="min-w-0">
                          <span className="block truncate text-[10px] font-medium text-white/75">{t(key)}</span>
                          <span className="mt-1 block h-1 w-8 rounded-full bg-white/9" />
                        </span>
                      </div>
                    </div>
                  ))}
                  <div className="absolute inset-x-4 bottom-4 flex items-center justify-between rounded-xl border border-white/8 bg-black/25 px-3 py-2.5 backdrop-blur-xl">
                    <span className="flex items-center gap-2 text-[10px] text-white/45">
                      <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-300" />
                      {t("hero.previewStatus")}
                    </span>
                    <span className="rounded-full bg-white/7 px-2 py-1 text-[9px] text-white/35">{t("hero.previewMembers")}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-y border-white/6 bg-white/[0.018] px-6 py-10 sm:px-8">
        <div className="mx-auto flex max-w-[1240px] flex-wrap items-center justify-center gap-x-10 gap-y-5 text-xs font-medium text-white/40 lg:justify-between">
          {[
            [LockKeyhole, "hero.strip.private"],
            [ScanLine, "hero.strip.scannable"],
            [WandSparkles, "hero.strip.intuitive"],
            [InfinityIcon, "hero.strip.enduring"],
          ].map(([Icon, key]) => {
            const FeatureIcon = Icon as LucideIcon
            return (
              <span key={key as string} className="flex items-center gap-2.5">
                <FeatureIcon className="h-4 w-4 text-violet-300/75" />
                {t(key as string)}
              </span>
            )
          })}
        </div>
      </section>

      <section className="px-6 py-24 sm:px-8 sm:py-32">
        <div className="mx-auto max-w-[1240px]">
          <Reveal>
            <SectionIntro
              eyebrow={t("problem.eyebrow")}
              title={t("problem.title")}
              description={t("problem.description")}
            />
          </Reveal>
          <div className="mt-14 grid gap-5 md:grid-cols-3">
            {(["time", "voice", "place"] as const).map((key, index) => (
              <Reveal key={key} delay={index * 90}>
                <article className="marketing-panel group h-full p-6 sm:p-8">
                  <span className="text-xs font-semibold text-violet-300/70">0{index + 1}</span>
                  <h3 className="mt-8 text-xl font-semibold text-white">{t(`problem.cards.${key}.title`)}</h3>
                  <p className="mt-3 text-sm leading-relaxed text-white/45">{t(`problem.cards.${key}.description`)}</p>
                  <div className="mt-8 h-px origin-left scale-x-30 bg-gradient-to-r from-violet-300/70 to-transparent transition-transform duration-700 group-hover:scale-x-100" />
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="create" className="scroll-mt-24 px-6 py-24 sm:px-8 sm:py-32">
        <div className="mx-auto max-w-[1240px]">
          <Reveal>
            <SectionIntro
              eyebrow={t("features.eyebrow")}
              title={t("features.title")}
              description={t("features.description")}
            />
          </Reveal>

          <div className="mt-14 grid gap-4 md:grid-cols-4">
            {FEATURES.map(({ key, icon: Icon, className }, index) => (
              <Reveal key={key} delay={(index % 4) * 70} className={className}>
                <article className="marketing-feature-card group flex h-full min-h-64 flex-col rounded-[1.75rem] border border-white/9 bg-white/[0.035] p-6 transition-all duration-500 hover:-translate-y-1 hover:border-violet-300/25 hover:bg-white/[0.06] sm:p-7">
                  <span className="grid h-11 w-11 place-items-center rounded-2xl border border-violet-300/15 bg-violet-300/8 text-violet-200 transition-transform duration-500 group-hover:scale-105">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div className="mt-auto pt-10">
                    <h3 className="text-lg font-semibold text-white">{t(`features.items.${key}.title`)}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/42">{t(`features.items.${key}.description`)}</p>
                  </div>
                  {key === "tree" && (
                    <div aria-hidden className="mt-7 hidden flex-1 items-end md:flex">
                      <div className="relative h-32 w-full">
                        <span className="absolute left-1/2 top-0 h-8 w-24 -translate-x-1/2 rounded-xl border border-violet-300/25 bg-violet-300/10" />
                        <span className="absolute left-1/2 top-8 h-9 w-px bg-violet-300/25" />
                        <span className="absolute left-[18%] right-[18%] top-16 h-px bg-violet-300/25" />
                        {[18, 50, 82].map((left) => (
                          <span key={left} className="absolute top-16 h-8 w-px bg-violet-300/25" style={{ left: `${left}%` }} />
                        ))}
                        {[18, 50, 82].map((left) => (
                          <span key={left} className="absolute top-24 h-8 w-16 -translate-x-1/2 rounded-lg border border-white/10 bg-white/5" style={{ left: `${left}%` }} />
                        ))}
                      </div>
                    </div>
                  )}
                </article>
              </Reveal>
            ))}
          </div>

          <Reveal className="mt-8">
            <StoryMetrics />
          </Reveal>
        </div>
      </section>

      <section className="px-6 py-24 sm:px-8 sm:py-32">
        <div className="mx-auto max-w-[1240px]">
          <Reveal>
            <SectionIntro
              eyebrow={t("tree.eyebrow")}
              title={t("tree.title")}
              description={t("tree.description")}
            />
          </Reveal>
          <Reveal className="mt-14">
            <FamilyTreeDemo />
          </Reveal>
        </div>
      </section>

      <section id="gencode" className="scroll-mt-24 px-6 py-24 sm:px-8 sm:py-32">
        <div className="mx-auto grid max-w-[1240px] items-center gap-14 lg:grid-cols-2 lg:gap-20">
          <Reveal className="relative order-2 lg:order-1">
            <div aria-hidden className="absolute inset-12 rounded-full bg-violet-500/20 blur-[90px]" />
            <div className="marketing-gencode-stage relative mx-auto flex min-h-[570px] max-w-xl items-center justify-center overflow-hidden rounded-[2.5rem] border border-white/10 bg-[radial-gradient(circle_at_50%_35%,rgba(154,137,244,0.2),transparent_42%),rgba(255,255,255,0.025)] p-8">
              <div className="marketing-orbit marketing-orbit-one" />
              <div className="marketing-orbit marketing-orbit-two" />
              <div className="marketing-gencode-card relative z-10 overflow-hidden rounded-[1.9rem] border border-white/15 bg-[#151625] p-2 shadow-[0_35px_80px_rgba(0,0,0,0.5)]">
                <Image
                  src="/landing/gencode-card.png"
                  alt={t("gencode.imageAlt")}
                  width={253}
                  height={372}
                  className="h-auto w-[230px] rounded-[1.45rem] sm:w-[260px]"
                />
                <div aria-hidden className="marketing-scan-line absolute inset-x-3 h-px bg-violet-200 shadow-[0_0_22px_5px_rgba(196,181,253,0.75)]" />
              </div>
              <span className="absolute bottom-8 left-1/2 flex -translate-x-1/2 items-center gap-2 whitespace-nowrap rounded-full border border-white/10 bg-black/30 px-4 py-2 text-xs text-white/50 backdrop-blur-xl">
                <QrCode className="h-4 w-4 text-violet-300" />
                {t("gencode.scanLabel")}
              </span>
            </div>
          </Reveal>

          <Reveal className="order-1 lg:order-2">
            <SectionIntro
              align="left"
              eyebrow={t("gencode.eyebrow")}
              title={t("gencode.title")}
              description={t("gencode.description")}
            />
            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {(["memorial", "frame", "jewelry", "gift"] as const).map((key) => (
                <div key={key} className="flex items-center gap-3 rounded-2xl border border-white/8 bg-white/[0.035] px-4 py-3 text-sm text-white/55">
                  <span className="h-1.5 w-1.5 rounded-full bg-violet-300" />
                  {t(`gencode.uses.${key}`)}
                </div>
              ))}
            </div>
            <Button asChild size="lg" className="mt-9 h-12 rounded-full px-7">
              <Link href="/activate">
                {t("gencode.cta")}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
          </Reveal>
        </div>
      </section>

      <section className="px-6 py-24 sm:px-8 sm:py-32">
        <div className="mx-auto max-w-[1240px]">
          <Reveal>
            <SectionIntro
              eyebrow={t("legacy.eyebrow")}
              title={t("legacy.title")}
              description={t("legacy.description")}
            />
          </Reveal>
          <div className="mt-14 grid gap-px overflow-hidden rounded-[2rem] border border-white/8 bg-white/8 md:grid-cols-2">
            {BENEFITS.map(({ key, icon: Icon }, index) => (
              <Reveal key={key} delay={index * 60} className="marketing-benefit bg-[#090a15]">
                <article className="group flex h-full gap-5 p-7 transition-colors duration-500 hover:bg-white/[0.025] sm:p-9">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/5 text-violet-300">
                    <Icon className="h-5 w-5" />
                  </span>
                  <div>
                    <h3 className="text-lg font-semibold text-white">{t(`legacy.items.${key}.title`)}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-white/42">{t(`legacy.items.${key}.description`)}</p>
                  </div>
                </article>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="plans" className="scroll-mt-24 px-6 py-24 sm:px-8 sm:py-32">
        <div className="mx-auto max-w-[1240px]">
          <Reveal>
            <SectionIntro
              eyebrow={t("plans.eyebrow")}
              title={t("plans.title")}
              description={t("plans.description")}
            />
          </Reveal>
          <Reveal className="mt-14">
            <PricingCards plans={plans} />
          </Reveal>
        </div>
      </section>

      <section id="families" className="scroll-mt-24 px-6 py-24 sm:px-8 sm:py-32">
        <div className="mx-auto grid max-w-[1240px] items-center gap-12 lg:grid-cols-[1.05fr_0.95fr] lg:gap-20">
          <Reveal>
            <div className="relative overflow-hidden rounded-[2.25rem] border border-white/10">
              <Image
                src="/landing/family-memorial.png"
                alt={t("families.imageAlt")}
                width={1472}
                height={828}
                className="aspect-[4/3] h-full w-full object-cover"
              />
              <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-[#090a15]/85 via-transparent to-transparent" />
              <div className="absolute inset-x-6 bottom-6 rounded-2xl border border-white/10 bg-black/25 p-4 backdrop-blur-xl sm:inset-x-8 sm:bottom-8">
                <p className="text-sm font-medium text-white">{t("families.photoTitle")}</p>
                <p className="mt-1 text-xs text-white/45">{t("families.photoCaption")}</p>
              </div>
            </div>
          </Reveal>
          <Reveal>
            <SectionIntro
              align="left"
              eyebrow={t("families.eyebrow")}
              title={t("families.title")}
              description={t("families.description")}
            />
            <ul className="mt-8 space-y-4">
              {(["shared", "simple", "lasting"] as const).map((key) => (
                <li key={key} className="flex gap-3 text-sm leading-relaxed text-white/55">
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-violet-300" />
                  {t(`families.points.${key}`)}
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      <section className="px-6 pb-24 pt-20 sm:px-8 sm:pb-32 sm:pt-28">
        <Reveal>
          <div className="marketing-final-cta relative mx-auto max-w-[1240px] overflow-hidden rounded-[2.75rem] border border-violet-300/20 px-6 py-20 text-center sm:px-10 sm:py-28">
            <div aria-hidden className="absolute inset-0 bg-[radial-gradient(circle_at_50%_0%,rgba(159,139,255,0.3),transparent_50%),linear-gradient(145deg,rgba(98,82,190,0.14),rgba(255,255,255,0.025))]" />
            <div aria-hidden className="marketing-final-rings absolute left-1/2 top-1/2 h-[520px] w-[520px] -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/7" />
            <div className="relative mx-auto max-w-3xl">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300">{t("closing.eyebrow")}</p>
              <h2 className="mt-5 text-[clamp(2.4rem,5vw,5.25rem)] font-semibold leading-[0.98] tracking-[-0.05em] text-white">{t("closing.title")}</h2>
              <p className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-white/50">{t("closing.description")}</p>
              <div className="mt-9 flex flex-col justify-center gap-3 sm:flex-row">
                <Button asChild size="lg" className="h-12 rounded-full px-8">
                  <Link href="/sign-up">
                    {t("closing.primaryCta")}
                    <ArrowRight className="h-4 w-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline" className="h-12 rounded-full border-white/15 bg-white/5 px-8 text-white hover:bg-white/10 hover:text-white">
                  <Link href="#plans">{t("closing.secondaryCta")}</Link>
                </Button>
              </div>
            </div>
          </div>
        </Reveal>
      </section>
    </main>
  )
}

function SectionIntro({
  align = "center",
  description,
  eyebrow,
  title,
}: {
  align?: "center" | "left"
  description: string
  eyebrow: string
  title: string
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-3xl text-center" : "max-w-xl"}>
      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-violet-300/80">{eyebrow}</p>
      <h2 className="mt-5 text-[clamp(2.35rem,4.8vw,4.8rem)] font-semibold leading-[0.99] tracking-[-0.05em] text-white">{title}</h2>
      <p className="mt-6 text-base leading-relaxed text-white/48 sm:text-lg">{description}</p>
    </div>
  )
}
