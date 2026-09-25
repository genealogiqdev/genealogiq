"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Menu, Moon, Sun, X } from "lucide-react"
import { useTheme } from "next-themes"
import { useTranslations } from "next-intl"
import { LanguageSwitcher } from "@/components/language-switcher"
import { PARTNER_CONTACT_HREF, PARTNER_PORTAL_HREF } from "@/components/marketing/partner-links"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"

const NAV_ITEMS = [
  { href: "#create", key: "create" },
  { href: "#gencode", key: "gencode" },
  { href: "#plans", key: "plans" },
  { href: "#families", key: "families" },
] as const

export function MarketingHeader() {
  const t = useTranslations("Marketing")
  const tPartner = useTranslations("PartnerLanding")
  const pathname = usePathname()
  const isPartnerLanding = pathname === "/afiliados"
  const { resolvedTheme, setTheme } = useTheme()
  const [menuOpen, setMenuOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24)
    onScroll()
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  useEffect(() => {
    document.body.style.overflow = menuOpen ? "hidden" : ""
    return () => {
      document.body.style.overflow = ""
    }
  }, [menuOpen])

  const closeMenu = () => setMenuOpen(false)
  const navItems = isPartnerLanding
    ? [
        { href: "#create", label: tPartner("nav.value") },
        { href: "#gencode", label: tPartner("nav.gencode") },
        { href: "#capacity", label: tPartner("nav.model") },
        { href: "#questions", label: tPartner("nav.faq") },
      ]
    : NAV_ITEMS.map((item) => ({ href: item.href, label: t(`nav.${item.key}`) }))

  return (
    <header className={cn("fixed inset-x-0 top-0 z-50", isPartnerLanding ? "px-0 pt-0" : "px-3 pt-3 sm:px-5 sm:pt-4")}>
      <div
        className={cn(
          isPartnerLanding
            ? "partner-header-inner mx-auto max-w-[1440px] border-[#e1e6e3] transition-all duration-300"
            : "marketing-nav mx-auto max-w-[1240px] rounded-[1.35rem] border transition-all duration-500",
          isPartnerLanding
            ? scrolled ? "border-b bg-[#f6f8f7]/98 shadow-[0_8px_28px_rgba(30,40,34,0.045)]" : "border-b bg-[#f6f8f7]/95"
            : scrolled
              ? "border-white/12 bg-[hsl(235_28%_9%/0.82)] shadow-2xl shadow-black/20 backdrop-blur-2xl"
              : "border-white/8 bg-[hsl(235_28%_9%/0.52)] backdrop-blur-xl",
        )}
      >
        <div className={cn("mx-auto flex h-16 items-center justify-between gap-4 px-4 sm:px-5", isPartnerLanding && "max-w-[1240px] px-5 sm:px-8")}>
          <Link href="#top" className="relative z-10 shrink-0" aria-label="Genealogiq">
            {isPartnerLanding ? (
              <Image src="/logo-dark.png" alt="Genealogiq" width={162} height={28} quality={90} className="h-auto w-[138px] sm:w-[154px]" priority />
            ) : (
              <>
                <Image src="/logo-dark.png" alt="Genealogiq" width={162} height={28} quality={90} className="h-auto w-[138px] dark:hidden sm:w-[154px]" priority />
                <Image src="/logo-light.png" alt="Genealogiq" width={162} height={28} quality={90} className="hidden h-auto w-[138px] dark:block sm:w-[154px]" priority />
              </>
            )}
          </Link>

          <nav className={cn("hidden items-center gap-1 lg:flex", isPartnerLanding && "gap-0.5")} aria-label={isPartnerLanding ? tPartner("nav.label") : t("nav.label")}>
            {navItems.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "rounded-full px-3.5 py-2 text-sm font-medium transition-colors",
                  isPartnerLanding ? "text-[#626b68] hover:bg-black/[0.045] hover:text-[#191e1b]" : "text-white/65 hover:bg-white/7 hover:text-white",
                )}
              >
                {item.label}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <LanguageSwitcher />
            {!isPartnerLanding && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
                aria-label={t("nav.toggleTheme")}
                className="h-9 w-9 rounded-full border-0 bg-white/6 text-white hover:bg-white/12 hover:text-white"
              >
                <Sun className="hidden h-4 w-4 dark:block" />
                <Moon className="block h-4 w-4 dark:hidden" />
              </Button>
            )}

            <Button
              asChild
              variant="ghost"
              size="sm"
              className={cn(
                "hidden rounded-full sm:inline-flex",
                isPartnerLanding ? "text-[#4e5854] hover:bg-black/[0.045] hover:text-[#191e1b]" : "text-white/75 hover:bg-white/8 hover:text-white",
              )}
            >
              {isPartnerLanding
                ? <a href={PARTNER_PORTAL_HREF}>{tPartner("nav.portal")}</a>
                : <Link href="/sign-in">{t("nav.signIn")}</Link>}
            </Button>
            <Button asChild size="sm" className={cn(
              "hidden rounded-full px-5 sm:inline-flex",
              isPartnerLanding ? "bg-[#b9f000] font-semibold text-[#1b2115] shadow-none hover:bg-[#a9dd00]" : "shadow-lg shadow-violet-950/30",
            )}>
              {isPartnerLanding
                ? <a href={PARTNER_CONTACT_HREF}>{tPartner("nav.contactCta")}</a>
                : <Link href="/sign-up">{t("nav.signUp")}</Link>}
            </Button>

            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="marketing-mobile-menu"
              aria-label={menuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
              className={cn(
                "inline-flex h-9 w-9 items-center justify-center rounded-full transition-colors lg:hidden",
                isPartnerLanding ? "text-[#414a46] hover:bg-black/[0.05]" : "bg-white/6 text-white hover:bg-white/12",
              )}
            >
              {menuOpen ? <X className="h-4 w-4" /> : <Menu className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <div
          id="marketing-mobile-menu"
          className={cn(
            "grid transition-[grid-template-rows,opacity] duration-300 lg:hidden",
            menuOpen ? "grid-rows-[1fr] opacity-100" : "pointer-events-none grid-rows-[0fr] opacity-0",
          )}
        >
          <div className="overflow-hidden">
            <nav className={cn("border-t px-4 py-4", isPartnerLanding ? "border-[#e5e9e6]" : "border-white/8")} aria-label={isPartnerLanding ? tPartner("nav.label") : t("nav.label")}>
              <div className="grid gap-1">
                {navItems.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={closeMenu}
                    className={cn(
                      "rounded-xl px-3 py-3 text-base font-medium transition-colors",
                      isPartnerLanding ? "text-[#4e5854] hover:bg-black/[0.045] hover:text-[#191e1b]" : "text-white/75 hover:bg-white/7 hover:text-white",
                    )}
                  >
                    {item.label}
                  </Link>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:hidden">
                <Button asChild variant="outline" className={cn(
                  "rounded-full",
                  isPartnerLanding ? "border-[#dce1de] bg-white text-[#41484b] hover:bg-[#f5f7f5] hover:text-[#171a1c]" : "border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white",
                )}>
                  {isPartnerLanding
                    ? <a href={PARTNER_PORTAL_HREF} onClick={closeMenu}>{tPartner("nav.portal")}</a>
                    : <Link href="/sign-in" onClick={closeMenu}>{t("nav.signIn")}</Link>}
                </Button>
                <Button asChild className={cn("rounded-full", isPartnerLanding && "bg-[#b9f000] text-[#1b2115] hover:bg-[#a9dd00]")}>
                  {isPartnerLanding
                    ? <a href={PARTNER_CONTACT_HREF} onClick={closeMenu}>{tPartner("nav.contactCta")}</a>
                    : <Link href="/sign-up" onClick={closeMenu}>{t("nav.signUp")}</Link>}
                </Button>
              </div>
            </nav>
          </div>
        </div>
      </div>
    </header>
  )
}
