import type { Metadata } from "next"
import Image from "next/image"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import {
  ArrowRight,
  Check,
  ClipboardCheck,
  HeartHandshake,
  QrCode,
  ScanLine,
  UsersRound,
  type LucideIcon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { PartnerCapacityCalculator, PartnerHeroEstimator } from "@/components/marketing/partner-capacity-calculator"
import { PARTNER_CONTACT_HREF, PARTNER_PORTAL_HREF } from "@/components/marketing/partner-links"

const PARTNER_BENEFITS: { key: "care" | "connection" | "clarity" | "access"; icon: LucideIcon }[] = [
  { key: "care", icon: HeartHandshake },
  { key: "connection", icon: QrCode },
  { key: "clarity", icon: ClipboardCheck },
  { key: "access", icon: ScanLine },
]

const PARTNER_STEPS: { key: "plan" | "prepare" | "serve"; icon: LucideIcon }[] = [
  { key: "plan", icon: UsersRound },
  { key: "prepare", icon: QrCode },
  { key: "serve", icon: HeartHandshake },
]

export async function generateMetadata(): Promise<Metadata> {
  const tMeta = await getTranslations("PartnerLanding")
  return {
    title: tMeta("meta.title"),
    description: tMeta("meta.description"),
    openGraph: { title: tMeta("meta.title"), description: tMeta("meta.description"), type: "website" },
  }
}

export default async function PartnerLandingPage() {
  const t = await getTranslations("PartnerLanding")

  return (
    <main id="top" className="partner-page overflow-clip bg-[#f6f8f7] text-[#191c1e]">
      <section className="flex min-h-[calc(100svh-4rem)] scroll-mt-20 items-center px-6 pb-14 pt-24 sm:px-8 sm:pt-28">
        <div className="mx-auto w-full max-w-[930px] text-center">
          <p className="text-[11px] font-semibold uppercase tracking-[0.19em] text-[#737d7a]">{t("hero.eyebrow")}</p>
          <h1 className="mx-auto mt-6 max-w-[900px] text-[clamp(2.5rem,4.4vw,4.6rem)] font-semibold leading-[1.02] tracking-[-0.065em] text-[#171a1d]">
            <span className="block">{t("hero.titleLead")}</span>
            <span className="partner-highlight mt-1 inline-block">{t("hero.titleAccent")}</span>
          </h1>
          <p className="mx-auto mt-5 max-w-[680px] text-base leading-relaxed text-[#727b7e] sm:text-lg">{t("hero.description")}</p>
          <PartnerHeroEstimator />
          <div className="mx-auto mt-6 flex max-w-[720px] flex-wrap justify-center gap-x-7 gap-y-2 text-xs text-[#737d7e]">
            {(["codes", "plans", "families"] as const).map((key) => (
              <span key={key} className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-[#88b900]" />{t(`hero.trust.${key}`)}</span>
            ))}
          </div>
        </div>
      </section>

      <section id="gencode" className="scroll-mt-24 px-6 pb-20 pt-4 sm:px-8 sm:pb-28">
        <figure className="relative mx-auto aspect-[0.82/1] max-h-[610px] max-w-[1120px] overflow-hidden rounded-[1.5rem] border border-[#dfe4e1] bg-[#202426] shadow-[0_24px_72px_rgba(35,43,38,0.1)] sm:aspect-[1.9/1] sm:rounded-[1.8rem]">
          <Image
            src="/landing/family-memorial.png"
            alt={t("gencode.imageAlt")}
            fill
            priority
            sizes="(max-width: 768px) 100vw, 1120px"
            className="object-cover object-center"
          />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-[#111719]/78 via-[#111719]/30 to-transparent" />
          <figcaption className="absolute inset-x-0 bottom-0 flex flex-col items-start justify-between gap-6 p-6 text-white sm:flex-row sm:items-end sm:p-10">
            <div className="max-w-[590px]">
              <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-white/75">{t("gencode.eyebrow")}</p>
              <h2 className="mt-3 text-3xl font-semibold leading-tight tracking-[-0.045em] sm:text-4xl">{t("gencode.title")}</h2>
              <p className="mt-3 max-w-xl text-sm leading-relaxed text-white/80 sm:text-base">{t("gencode.description")}</p>
            </div>
            <Button asChild className="h-11 shrink-0 rounded-full bg-[#b9f000] px-6 text-sm font-semibold text-[#1b2115] shadow-none hover:bg-[#a9dd00]">
              <Link href="#create">{t("gencode.cta")}<ArrowRight className="h-4 w-4" /></Link>
            </Button>
          </figcaption>
        </figure>
      </section>

      <section id="create" className="scroll-mt-24 px-6 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-[1120px]">
          <SectionHeading
            eyebrow={t("value.eyebrow")}
            title={t("value.title")}
            description={t("value.description")}
            align="left"
          />
          <div className="mt-10 overflow-hidden rounded-[1.4rem] border border-[#dfe4e1] bg-white shadow-[0_18px_55px_rgba(35,43,38,0.045)]">
            <div className="hidden grid-cols-[0.72fr_1.6fr_0.7fr] items-center gap-6 border-b border-[#e8ece9] bg-[#fbfcfb] px-7 py-4 text-[10px] font-semibold uppercase tracking-[0.15em] text-[#87908e] sm:grid">
              <span>{t("value.table.labels.need")}</span><span>{t("value.table.labels.experience")}</span><span>{t("value.table.labels.included")}</span>
            </div>
            {PARTNER_BENEFITS.map(({ key, icon: Icon }) => (
              <article key={key} className="grid gap-3 border-b border-[#edf0ed] px-5 py-5 last:border-b-0 sm:grid-cols-[0.72fr_1.6fr_0.7fr] sm:items-center sm:gap-6 sm:px-7 sm:py-6">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#f1f5ed] text-[#64783b]"><Icon className="h-4 w-4" /></span>
                  <h3 className="text-sm font-semibold text-[#303638]">{t(`value.items.${key}.title`)}</h3>
                </div>
                <p className="text-sm leading-relaxed text-[#747d7f]">{t(`value.items.${key}.description`)}</p>
                <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-[#f1f7e6] px-3 py-1.5 text-[11px] font-medium text-[#607236]">
                  <Check className="h-3 w-3" />{t("value.included")}
                </span>
              </article>
            ))}
          </div>
        </div>
      </section>

      <PartnerCapacityCalculator />

      <section id="how" className="scroll-mt-24 px-6 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto grid max-w-[1120px] items-center gap-12 lg:grid-cols-[0.88fr_1.12fr] lg:gap-16">
          <div>
            <SectionHeading eyebrow={t("how.eyebrow")} title={t("how.title")} description={t("how.description")} align="left" />
            <ol className="mt-8 space-y-5">
              {PARTNER_STEPS.map(({ key, icon: Icon }, index) => (
                <li key={key} className="flex gap-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#e0e5e1] bg-white text-[#607236]">
                    <Icon className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-[#303638]">{t(`how.steps.${key}.title`)}</p>
                    <p className="mt-1 text-sm leading-relaxed text-[#778082]">{t(`how.steps.${key}.description`)}</p>
                  </div>
                </li>
              ))}
            </ol>
            <Button asChild className="mt-8 h-11 rounded-full bg-[#b9f000] px-6 text-sm font-semibold text-[#1b2115] shadow-none hover:bg-[#a9dd00]">
              <a href={PARTNER_CONTACT_HREF}>{t("how.cta")}<ArrowRight className="h-4 w-4" /></a>
            </Button>
          </div>
          <div className="relative overflow-hidden rounded-[1.5rem] border border-[#dfe4e1] bg-white p-3 shadow-[0_24px_70px_rgba(35,43,38,0.08)] sm:rounded-[1.8rem] sm:p-4">
            <div className="relative aspect-[1.28/1] overflow-hidden rounded-[1.15rem] bg-[#edf0ec]">
              <Image src="/landing/family-memorial.png" alt={t("how.imageAlt")} fill sizes="(max-width: 1024px) 100vw, 600px" className="object-cover" />
              <div className="absolute inset-0 bg-gradient-to-t from-[#151b19]/65 via-transparent to-transparent" />
            <p className="absolute bottom-5 left-5 max-w-[62%] text-sm font-medium leading-relaxed text-white sm:bottom-7 sm:left-7 sm:max-w-[360px] sm:text-base">{t("how.imageCaption")}</p>
          </div>
            <div className="absolute right-5 top-5 flex items-center gap-3 rounded-xl border border-[#e3e8e4] bg-white p-3 shadow-[0_10px_28px_rgba(30,40,34,0.12)] sm:right-7 sm:top-7 sm:p-4">
              <span className="grid h-10 w-10 place-items-center rounded-lg bg-[#f1f5ed] text-[#61793b]"><QrCode className="h-5 w-5" /></span>
              <span><span className="block text-xs font-semibold text-[#303638]">GenCode</span><span className="mt-1 block text-[10px] text-[#7c8586]">{t("gencode.scanLabel")}</span></span>
            </div>
          </div>
        </div>
      </section>

      <section id="portal" className="scroll-mt-24 bg-[#eef2ef] px-6 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-[1120px]">
          <div className="flex flex-col justify-between gap-4 md:flex-row md:items-end">
            <SectionHeading eyebrow={t("portal.eyebrow")} title={t("portal.title")} align="left" />
            <p className="max-w-[340px] pb-1 text-sm leading-relaxed text-[#778082]">{t("portal.description")}</p>
          </div>
          <div className="mt-9 overflow-hidden rounded-[1.4rem] border border-[#dfe4e1] bg-white shadow-[0_20px_60px_rgba(35,43,38,0.06)]">
            <div className="flex items-center justify-between gap-4 border-b border-[#e7ebe8] px-5 py-4 sm:px-7">
              <span className="text-sm font-semibold text-[#343b3e]">{t("portal.panelTitle")}</span>
              <span className="text-[10px] text-[#929b9d]">{t("portal.note")}</span>
            </div>
            <div className="grid sm:grid-cols-3">
              {(["available", "sold", "activated"] as const).map((key, index) => (
                <div key={key} className="border-b border-[#edf0ed] px-5 py-6 last:border-b-0 sm:border-b-0 sm:border-r sm:px-7 sm:py-8 sm:last:border-r-0">
                  <p className="text-xs font-medium text-[#788183]">{t(`portal.status.${key}`)}</p>
                  <p className="mt-3 text-4xl font-semibold tracking-[-0.055em] tabular-nums text-[#202528]">{["128", "34", "28"][index]}</p>
                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-[#edf0ed]">
                    <span className={`block h-full rounded-full bg-[#a8d926] ${index === 0 ? "w-[78%]" : index === 1 ? "w-[48%]" : "w-[39%]"}`} />
                  </div>
                </div>
              ))}
            </div>
            <div className="border-t border-[#e7ebe8] bg-[#fafbfa] px-5 py-4 text-xs leading-relaxed text-[#828b8d] sm:px-7">{t("portal.panelCaption")}</div>
          </div>
          <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 text-xs text-[#778082]">
            {(["inventory", "sales", "activation"] as const).map((key) => (
              <span key={key} className="inline-flex items-center gap-1.5"><Check className="h-3.5 w-3.5 text-[#86af17]" />{t(`portal.points.${key}`)}</span>
            ))}
          </div>
        </div>
      </section>

      <section id="questions" className="scroll-mt-24 px-6 py-20 sm:px-8 sm:py-28">
        <div className="mx-auto max-w-[850px]">
          <SectionHeading eyebrow={t("faq.eyebrow")} title={t("faq.title")} description={t("faq.description")} />
          <div className="mt-10 border-t border-[#dfe4e1]">
            {(["who", "what", "credits", "families", "commercial"] as const).map((key) => (
              <details key={key} className="group border-b border-[#dfe4e1] py-5">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-5 text-left text-sm font-semibold text-[#31383a] marker:content-none sm:text-base">
                  {t(`faq.items.${key}.question`)}
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-[#dfe4e1] text-lg font-normal text-[#687477] transition-transform group-open:rotate-45">+</span>
                </summary>
                <p className="max-w-[740px] pb-1 pt-4 text-sm leading-relaxed text-[#778082]">{t(`faq.items.${key}.answer`)}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className="px-6 pb-20 pt-4 sm:px-8 sm:pb-28">
        <div className="mx-auto max-w-[1120px] rounded-[1.6rem] border border-[#dce4d7] bg-[#eef5e7] px-6 py-14 text-center sm:rounded-[2rem] sm:px-10 sm:py-20">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#73826a]">{t("closing.eyebrow")}</p>
          <h2 className="mx-auto mt-4 max-w-[760px] text-[clamp(2.25rem,4.8vw,4.3rem)] font-semibold leading-[1.04] tracking-[-0.06em] text-[#191d1a]">{t("closing.title")}</h2>
          <p className="mx-auto mt-4 max-w-[600px] text-base leading-relaxed text-[#727c70]">{t("closing.description")}</p>
          <div className="mt-7 flex flex-col justify-center gap-2.5 sm:flex-row">
            <Button asChild className="h-11 rounded-full bg-[#b9f000] px-6 text-sm font-semibold text-[#1b2115] shadow-none hover:bg-[#a9dd00]">
              <a href={PARTNER_CONTACT_HREF}>{t("closing.primaryCta")}<ArrowRight className="h-4 w-4" /></a>
            </Button>
            <Button asChild variant="outline" className="h-11 rounded-full border-[#d5dfd0] bg-white/70 px-6 text-sm text-[#414a40] shadow-none hover:bg-white hover:text-[#171a1c]">
              <a href={PARTNER_PORTAL_HREF} target="_blank" rel="noreferrer">{t("closing.secondaryCta")}</a>
            </Button>
          </div>
          <p className="mt-5 text-[11px] text-[#8b9585]">{t("closing.contactNote")}</p>
        </div>
      </section>
    </main>
  )
}

function SectionHeading({
  align = "center",
  description,
  eyebrow,
  title,
}: {
  align?: "center" | "left"
  description?: string
  eyebrow: string
  title: string
}) {
  return (
    <div className={align === "center" ? "mx-auto max-w-[760px] text-center" : "max-w-[720px]"}>
      <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#77817e]">{eyebrow}</p>
      <h2 className="mt-4 text-[clamp(2.1rem,4.5vw,3.7rem)] font-semibold leading-[1.05] tracking-[-0.055em] text-[#181b1e]">{title}</h2>
      {description ? <p className="mt-4 max-w-[650px] text-base leading-relaxed text-[#727b7e]">{description}</p> : null}
    </div>
  )
}
