"use client"

import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useTranslations } from "next-intl"
import { ArrowUpRight } from "lucide-react"
import { PARTNER_CONTACT_HREF, PARTNER_PORTAL_HREF } from "@/components/marketing/partner-links"
import { cn } from "@/lib/utils"

const PRODUCT_LINKS = [
  { href: "#create", key: "create" },
  { href: "#gencode", key: "gencode" },
  { href: "#plans", key: "plans" },
  { href: "/install", key: "install" },
] as const

const ACCOUNT_LINKS = [
  { href: "/sign-in", key: "signIn" },
  { href: "/sign-up", key: "signUp" },
  { href: "/activate", key: "activate" },
  { href: "/terms", key: "terms" },
] as const

export function MarketingFooter() {
  const t = useTranslations("Marketing")
  const tPartner = useTranslations("PartnerLanding")
  const pathname = usePathname()
  const isPartnerLanding = pathname === "/afiliados"
  const year = new Date().getFullYear()
  const productLinks = isPartnerLanding
    ? [
        { href: "#create", label: tPartner("footer.links.value") },
        { href: "#gencode", label: tPartner("footer.links.gencode") },
        { href: "#capacity", label: tPartner("footer.links.model") },
        { href: "#how", label: tPartner("footer.links.how") },
      ]
    : PRODUCT_LINKS.map((link) => ({ href: link.href, label: t(`footer.links.${link.key}`) }))
  const accountLinks = isPartnerLanding
    ? [
        { href: PARTNER_PORTAL_HREF, label: tPartner("footer.links.portal") },
        { href: PARTNER_CONTACT_HREF, label: tPartner("footer.links.contact") },
      ]
    : ACCOUNT_LINKS.map((link) => ({ href: link.href, label: t(`footer.links.${link.key}`) }))

  return (
    <footer className={cn(
      "relative overflow-hidden border-t",
      isPartnerLanding ? "partner-footer" : "border-white/8 bg-[#070812] text-white",
    )}>
      {!isPartnerLanding && (
        <>
          <div aria-hidden className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_50%_0%,rgba(125,119,210,0.16),transparent_66%)]" />
          <Image
            src="/landing/footer-mark.png"
            alt=""
            width={1024}
            height={748}
            aria-hidden
            className="pointer-events-none absolute -bottom-44 -right-28 hidden w-[560px] opacity-[0.025] lg:block"
          />
        </>
      )}
      <div className="relative mx-auto max-w-[1240px] px-6 py-16 sm:px-8 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <Link href="#top" aria-label="Genealogiq" className="inline-flex">
              {isPartnerLanding ? (
                <Image src="/logo-dark.png" alt="Genealogiq" width={210} height={37} quality={90} className="h-auto w-[180px]" />
              ) : (
                <>
                  <Image src="/logo-dark.png" alt="Genealogiq" width={210} height={37} quality={90} className="h-auto w-[180px] dark:hidden" />
                  <Image src="/logo-light.png" alt="Genealogiq" width={210} height={37} quality={90} className="hidden h-auto w-[180px] dark:block" />
                </>
              )}
            </Link>
            <p className={cn("mt-5 max-w-sm text-base leading-relaxed", isPartnerLanding ? "text-[#737d7e]" : "text-white/55")}>{isPartnerLanding ? tPartner("footer.tagline") : t("footer.tagline")}</p>
            {isPartnerLanding ? (
              <a href={PARTNER_CONTACT_HREF} className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-[#313a36] transition-colors hover:text-[#738e24]">
                {tPartner("footer.cta")}<ArrowUpRight className="h-4 w-4" />
              </a>
            ) : (
              <Link href="/sign-up" className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-white transition-colors hover:text-violet-300">
                {t("footer.cta")}<ArrowUpRight className="h-4 w-4" />
              </Link>
            )}
          </div>

          <div>
            <p className={cn("text-xs font-semibold uppercase tracking-[0.18em]", isPartnerLanding ? "text-[#858e8c]" : "text-white/35")}>{isPartnerLanding ? tPartner("footer.product") : t("footer.product")}</p>
            <ul className="mt-5 space-y-3">
              {productLinks.map((link) => (
                <li key={link.href}>
                  <Link href={link.href} className={cn("text-sm transition-colors", isPartnerLanding ? "text-[#626c69] hover:text-[#1c2521]" : "text-white/60 hover:text-white")}>
                    {link.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className={cn("text-xs font-semibold uppercase tracking-[0.18em]", isPartnerLanding ? "text-[#858e8c]" : "text-white/35")}>{isPartnerLanding ? tPartner("footer.account") : t("footer.account")}</p>
            <ul className="mt-5 space-y-3">
              {accountLinks.map((link) => (
                <li key={link.href}>
                  {isPartnerLanding ? (
                    <a href={link.href} className="text-sm text-[#626c69] transition-colors hover:text-[#1c2521]">
                      {link.label}
                    </a>
                  ) : (
                    <Link href={link.href} className="text-sm text-white/60 transition-colors hover:text-white">
                      {link.label}
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className={cn("mt-14 flex flex-col gap-3 border-t pt-6 text-xs sm:flex-row sm:items-center sm:justify-between", isPartnerLanding ? "border-[#e1e6e3] text-[#929a99]" : "border-white/8 text-white/35")}>
          <p>{t("footer.copyright", { year })}</p>
          <p>{t("footer.signature")}</p>
        </div>
      </div>
    </footer>
  )
}
