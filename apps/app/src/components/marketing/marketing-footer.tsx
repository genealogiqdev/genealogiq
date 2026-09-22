import Image from "next/image"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { ArrowUpRight } from "lucide-react"

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

export async function MarketingFooter() {
  const t = await getTranslations("Marketing")
  const year = new Date().getFullYear()

  return (
    <footer className="relative overflow-hidden border-t border-white/8 bg-[#070812] text-white">
      <div aria-hidden className="absolute inset-x-0 top-0 h-64 bg-[radial-gradient(circle_at_50%_0%,rgba(125,119,210,0.16),transparent_66%)]" />
      <Image
        src="/landing/footer-mark.png"
        alt=""
        width={1024}
        height={748}
        aria-hidden
        className="pointer-events-none absolute -bottom-44 -right-28 hidden w-[560px] opacity-[0.025] lg:block"
      />
      <div className="relative mx-auto max-w-[1240px] px-6 py-16 sm:px-8 lg:py-20">
        <div className="grid gap-12 lg:grid-cols-[1.5fr_1fr_1fr]">
          <div>
            <Link href="#top" aria-label="Genealogiq" className="inline-flex">
              <Image
                src="/logo-dark.png"
                alt="Genealogiq"
                width={210}
                height={37}
                quality={90}
                className="h-auto w-[180px] dark:hidden"
              />
              <Image
                src="/logo-light.png"
                alt="Genealogiq"
                width={210}
                height={37}
                quality={90}
                className="hidden h-auto w-[180px] dark:block"
              />
            </Link>
            <p className="mt-5 max-w-sm text-base leading-relaxed text-white/55">{t("footer.tagline")}</p>
            <Link
              href="/sign-up"
              className="mt-7 inline-flex items-center gap-2 text-sm font-semibold text-white transition-colors hover:text-violet-300"
            >
              {t("footer.cta")}
              <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">{t("footer.product")}</p>
            <ul className="mt-5 space-y-3">
              {PRODUCT_LINKS.map((link) => (
                <li key={link.key}>
                  <Link href={link.href} className="text-sm text-white/60 transition-colors hover:text-white">
                    {t(`footer.links.${link.key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-white/35">{t("footer.account")}</p>
            <ul className="mt-5 space-y-3">
              {ACCOUNT_LINKS.map((link) => (
                <li key={link.key}>
                  <Link href={link.href} className="text-sm text-white/60 transition-colors hover:text-white">
                    {t(`footer.links.${link.key}`)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-col gap-3 border-t border-white/8 pt-6 text-xs text-white/35 sm:flex-row sm:items-center sm:justify-between">
          <p>{t("footer.copyright", { year })}</p>
          <p>{t("footer.signature")}</p>
        </div>
      </div>
    </footer>
  )
}
