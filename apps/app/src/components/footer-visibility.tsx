'use client'

import { usePathname } from "next/navigation"
import type { ReactNode } from "react"

// The family tree and places map pages are full-screen, fixed-position
// canvases (their own pan/zoom, not a scrolling page) — the footer added
// scrollable height below them and cluttered what's meant to read as an
// immersive view. Sign-in/sign-up are a centered auth card meant to read as a
// single, self-contained screen. Root layout renders Footer unconditionally
// for every other route (children can't opt out of an ancestor layout on
// their own), so this client-side pathname check is the escape hatch.
const HIDDEN_ON = [
  /^\/$/,
  /^\/profile\/[^/]+\/tree$/,
  /^\/profile\/[^/]+\/places\/map$/,
  /^\/sign-in$/,
  /^\/sign-up$/,
]

export function FooterVisibility({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  if (HIDDEN_ON.some((re) => re.test(pathname))) return null
  return <>{children}</>
}
