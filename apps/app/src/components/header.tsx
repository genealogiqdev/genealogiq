'use client'

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname } from "next/navigation"
import { useTheme } from "next-themes"
import { Moon, Sun, Menu, Bell, User, LogOut, SquareChartGantt, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog"
import { HeaderSearch } from "@/components/header-search"
import { LanguageSwitcher } from "@/components/language-switcher"
import { cn } from "@/lib/utils"
import { useTranslations } from "next-intl"
import { signOut } from "next-auth/react"

function BellLink({ unreadCount, onNavigate }: { unreadCount: number; onNavigate?: () => void }) {
  const t = useTranslations("Nav")
  return (
    <Link
      href="/messages"
      onClick={onNavigate}
      aria-label={unreadCount > 0 ? t("messagesUnread", { count: unreadCount }) : t("messages")}
      className="relative rounded-full glass border-0 h-9 w-9 inline-flex items-center justify-center hover:bg-accent/50 transition-colors"
    >
      <Bell className="h-4 w-4" />
      {unreadCount > 0 && (
        <span className="absolute -top-0.5 -right-0.5 h-4 min-w-4 px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center">
          {unreadCount}
        </span>
      )}
    </Link>
  )
}

interface HeaderProps {
  userName?: string | null
  userImage?: string | null
  unreadCount?: number
}

export function Header({ userName, userImage, unreadCount = 0 }: HeaderProps) {
  const { resolvedTheme, setTheme } = useTheme()
  const t = useTranslations("Nav")
  const [mobileOpen, setMobileOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const pathname = usePathname()
  const showSearch = pathname !== "/home"
  const headerRef = useRef<HTMLElement | null>(null)

  // Tapping anywhere outside the header collapses the mobile menu, so the X is
  // not the only way out. Radix renders the avatar/language menus in a portal
  // outside this subtree, so those clicks are excluded — otherwise opening a
  // dropdown would immediately close the menu underneath it.
  useEffect(() => {
    if (!mobileOpen) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null
      if (!target) return
      if (headerRef.current?.contains(target)) return
      if (target.closest("[data-radix-popper-content-wrapper]")) return
      setMobileOpen(false)
    }
    document.addEventListener("pointerdown", onPointerDown)
    return () => document.removeEventListener("pointerdown", onPointerDown)
  }, [mobileOpen])

  const initials = userName
    ? userName.split(" ").map((n) => n[0]).join("").slice(0, 2).toUpperCase()
    : undefined

  // `onAction` is passed only by the mobile row, so picking anything there
  // collapses the menu. The two dropdowns are the exception: they fire it when
  // an item inside them is chosen, not when their trigger opens.
  const renderControls = (onAction?: () => void) => (
    <>
      <BellLink unreadCount={unreadCount} onNavigate={onAction} />

      <LanguageSwitcher onSelected={onAction} />

      <Button
        variant="ghost"
        size="icon"
        onClick={() => { setTheme(resolvedTheme === "dark" ? "light" : "dark"); onAction?.() }}
        aria-label={t("toggleTheme")}
        className="rounded-full glass border-0 h-9 w-9"
      >
        <Sun className="h-4 w-4 hidden dark:block" />
        <Moon className="h-4 w-4 block dark:hidden" />
      </Button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label={t("userMenu")}
            className="rounded-full ring-2 ring-transparent hover:ring-primary/40 transition-all"
          >
            <Avatar className="h-9 w-9">
              <AvatarImage src={userImage ?? ""} alt={userName ?? "You"} />
              <AvatarFallback className="bg-secondary text-foreground text-sm font-medium">
                {initials ?? <User className="h-4 w-4" />}
              </AvatarFallback>
            </Avatar>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="glass-strong w-52">
          {userName && (
            <>
              <div className="px-2 py-1.5 text-sm font-medium truncate">{userName}</div>
              <DropdownMenuSeparator />
            </>
          )}
          <DropdownMenuItem asChild>
            <Link href="/profile" onClick={onAction} className="gap-2 cursor-pointer">
              <User className="h-4 w-4" />
              {t("myProfile")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2 text-destructive focus:text-destructive cursor-pointer"
            onSelect={() => { onAction?.(); signOut({ callbackUrl: "/" }) }}
          >
            <LogOut className="h-4 w-4" />
            {t("signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )

  return (
    <header ref={headerRef} className="fixed top-0 inset-x-0 z-50">
      <div className="glass-strong glass-header border-x-0 border-t-0 rounded-none">
        <div className="container flex items-center justify-between gap-3 md:gap-4 h-16">
          <Link href="/home" className="flex items-center group min-w-0 w-[162px]" aria-label="Genealogiq">
            <Image src="/logo-dark.png" alt="Genealogiq" width={162} height={28} quality={90} className="block dark:hidden" style={{ width: "100%", height: "auto" }} priority />
            <Image src="/logo-light.png" alt="Genealogiq" width={162} height={28} quality={90} className="hidden dark:block" style={{ width: "100%", height: "auto" }} priority />
          </Link>

          {showSearch && (
            <div className="hidden md:block flex-1 max-w-md mx-auto">
              <HeaderSearch />
            </div>
          )}

          <div className="ml-auto flex items-center gap-2 shrink-0">
            <Button asChild size="sm" className="h-9 rounded-full px-3">
              <Link
                href="/subscriptions"
                onClick={() => setMobileOpen(false)}
                aria-current={pathname === "/subscriptions" ? "page" : undefined}
              >
                <SquareChartGantt className="hidden sm:block h-4 w-4" aria-hidden="true" />
                {t("subscriptions")}
              </Link>
            </Button>

            <div className="hidden md:flex items-center gap-2">{renderControls()}</div>

            {/* Only the opener: the menu closes by picking an item or tapping outside. */}
            {!mobileOpen && (
              <button
                className="md:hidden rounded-full glass h-9 w-9 inline-flex items-center justify-center shrink-0"
                onClick={() => setMobileOpen(true)}
                aria-label={t("openMenu")}
                aria-expanded={false}
              >
                <Menu className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div
          className={cn(
            "md:hidden overflow-hidden transition-[max-height,opacity] duration-300",
            mobileOpen ? "max-h-32 opacity-100" : "max-h-0 opacity-0",
          )}
        >
          <div className="container flex items-center justify-center gap-2 pb-4">
            {showSearch && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => { setSearchOpen(true); setMobileOpen(false) }}
                aria-label={t("searchProfiles")}
                className="rounded-full glass border-0 h-9 w-9"
              >
                <Search className="h-4 w-4" />
              </Button>
            )}
            {renderControls(() => setMobileOpen(false))}
          </div>
        </div>
      </div>

      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent className="sm:max-w-md p-4 top-[15%] translate-y-0">
          <DialogTitle className="sr-only">{t("searchProfiles")}</DialogTitle>
          <HeaderSearch onNavigate={() => setSearchOpen(false)} />
        </DialogContent>
      </Dialog>
    </header>
  )
}
