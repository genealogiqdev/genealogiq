"use client"

import { useEffect, useState } from "react"
import Image from "next/image"
import Link from "next/link"
import { Menu, Moon, Sun, X } from "lucide-react"
import { useTheme } from "next-themes"
import { useTranslations } from "next-intl"
import { LanguageSwitcher } from "@/components/language-switcher"
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

  return (
    <header className="fixed inset-x-0 top-0 z-50 px-3 pt-3 sm:px-5 sm:pt-4">
      <div
        className={cn(
          "marketing-nav mx-auto max-w-[1240px] rounded-[1.35rem] border transition-all duration-500",
          scrolled
            ? "border-white/12 bg-[hsl(235_28%_9%/0.82)] shadow-2xl shadow-black/20 backdrop-blur-2xl"
            : "border-white/8 bg-[hsl(235_28%_9%/0.52)] backdrop-blur-xl",
        )}
      >
        <div className="flex h-16 items-center justify-between gap-4 px-4 sm:px-5">
          <Link href="#top" className="relative z-10 shrink-0" aria-label="Genealogiq">
            <Image
              src="/logo-dark.png"
              alt="Genealogiq"
              width={162}
              height={28}
              quality={90}
              className="h-auto w-[138px] dark:hidden sm:w-[154px]"
              priority
            />
            <Image
              src="/logo-light.png"
              alt="Genealogiq"
              width={162}
              height={28}
              quality={90}
              className="hidden h-auto w-[138px] dark:block sm:w-[154px]"
              priority
            />
          </Link>

          <nav className="hidden items-center gap-1 lg:flex" aria-label={t("nav.label")}>
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.key}
                href={item.href}
                className="rounded-full px-3.5 py-2 text-sm font-medium text-white/65 transition-colors hover:bg-white/7 hover:text-white"
              >
                {t(`nav.${item.key}`)}
              </Link>
            ))}
          </nav>

          <div className="flex items-center gap-1.5 sm:gap-2">
            <LanguageSwitcher />
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

            <Button
              asChild
              variant="ghost"
              size="sm"
              className="hidden rounded-full text-white/75 hover:bg-white/8 hover:text-white sm:inline-flex"
            >
              <Link href="/sign-in">{t("nav.signIn")}</Link>
            </Button>
            <Button asChild size="sm" className="hidden rounded-full px-5 shadow-lg shadow-violet-950/30 sm:inline-flex">
              <Link href="/sign-up">{t("nav.signUp")}</Link>
            </Button>

            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-controls="marketing-mobile-menu"
              aria-label={menuOpen ? t("nav.closeMenu") : t("nav.openMenu")}
              className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/6 text-white transition-colors hover:bg-white/12 lg:hidden"
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
            <nav className="border-t border-white/8 px-4 py-4" aria-label={t("nav.label")}>
              <div className="grid gap-1">
                {NAV_ITEMS.map((item) => (
                  <Link
                    key={item.key}
                    href={item.href}
                    onClick={closeMenu}
                    className="rounded-xl px-3 py-3 text-base font-medium text-white/75 transition-colors hover:bg-white/7 hover:text-white"
                  >
                    {t(`nav.${item.key}`)}
                  </Link>
                ))}
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2 sm:hidden">
                <Button asChild variant="outline" className="rounded-full border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white">
                  <Link href="/sign-in" onClick={closeMenu}>{t("nav.signIn")}</Link>
                </Button>
                <Button asChild className="rounded-full">
                  <Link href="/sign-up" onClick={closeMenu}>{t("nav.signUp")}</Link>
                </Button>
              </div>
            </nav>
          </div>
        </div>
      </div>
    </header>
  )
}
