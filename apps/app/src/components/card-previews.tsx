import { Heart, Star, Images, Flower, BrickWall, Network, Lock, QrCode, MapPin, FileText, PawPrint, BookOpenText } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { getAvatarColor, getAvatarGradient } from "@/lib/avatar-color"
import type { TributeAuthorPreview } from "@/queries/tribute"
import type { FavoriteRow } from "@/queries/favorite"
import type { GuardedProfileRow } from "@/queries/memorial"

export async function TreePreview({ memberCount = 0 }: { memberCount?: number }) {
  if (memberCount <= 1) {
    const t = await getTranslations("Profile")
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 py-4">
        <Network className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">{t("emptyRelatives")}</p>
      </div>
    )
  }

  const lc  = "hsl(var(--brand-slate) / 0.55)"    // parent-child lines
  const mc  = "hsl(var(--brand-indigo) / 0.60)"   // marriage connectors

  // Layout (viewBox 0 0 260 140, node W=38 H=14):
  //   Gen0: G0L(62,6) · G0R(110,6)        couple-cx=105   couple-line-y=13
  //   Gen1: G1A(24,60) · G1B(86,60) · G1C(148,60) · G1D(202,60)
  //         G1C+G1D couple-cx=194  couple-line-y=67
  //   Gen2: G2A(152,114) · G2B(202,114)

  return (
    <svg viewBox="0 0 260 140" className="w-full h-full" aria-hidden>
      <g fill="none" strokeLinecap="butt" strokeLinejoin="miter">

        {/* Gen0 marriage connector */}
        <line x1="100" y1="13" x2="110" y2="13" stroke={mc} strokeWidth="1.4" />

        {/* Gen0 → Gen1 T-junction (vertical drop starts at marriage line) */}
        <line x1="105" y1="13" x2="105" y2="44" stroke={lc} strokeWidth="1" />
        <line x1="42.5" y1="44" x2="167.5" y2="44" stroke={lc} strokeWidth="1" />
        <line x1="43"  y1="44" x2="43"  y2="60" stroke={lc} strokeWidth="1" />
        <line x1="105" y1="44" x2="105" y2="60" stroke={lc} strokeWidth="1" />
        <line x1="167" y1="44" x2="167" y2="60" stroke={lc} strokeWidth="1" />

        {/* Gen1 marriage connector (G1C ↔ G1D) */}
        <line x1="186" y1="67" x2="202" y2="67" stroke={mc} strokeWidth="1.4" />

        {/* G1C+G1D → Gen2 T-junction (vertical drop starts at marriage line) */}
        <line x1="194" y1="67" x2="194" y2="98" stroke={lc} strokeWidth="1" />
        <line x1="170.5" y1="98" x2="221.5" y2="98" stroke={lc} strokeWidth="1" />
        <line x1="171" y1="98" x2="171" y2="114" stroke={lc} strokeWidth="1" />
        <line x1="221" y1="98" x2="221" y2="114" stroke={lc} strokeWidth="1" />
      </g>

      {/* Gen 0 */}
      <TreeNode x={62}  y={6}   />
      <TreeNode x={110} y={6}   />
      {/* Gen 1 */}
      <TreeNode x={24}  y={60}  />
      <TreeNode x={86}  y={60}  />
      <TreeNode x={148} y={60}  isRoot />
      <TreeNode x={202} y={60}  />
      {/* Gen 2 */}
      <TreeNode x={152} y={114} />
      <TreeNode x={202} y={114} />
    </svg>
  )
}

function TreeNode({ x, y, isRoot = false }: { x: number; y: number; isRoot?: boolean }) {
  const W = 38, H = 14
  return (
    <g>
      <rect
        x={x} y={y} width={W} height={H} rx={3}
        fill={isRoot ? "hsl(var(--brand-indigo) / 0.10)" : "hsl(var(--brand-indigo) / 0.05)"}
        stroke={isRoot ? "hsl(var(--brand-indigo) / 0.55)" : "hsl(var(--brand-indigo) / 0.22)"}
        strokeWidth={isRoot ? 1.2 : 0.8}
      />
      <rect x={x + 5} y={y + 4}   width={W - 13} height="2"   rx="1"    fill="hsl(var(--brand-slate) / 0.35)" />
      <rect x={x + 5} y={y + 9}   width={W - 18} height="1.5" rx="0.75" fill="hsl(var(--brand-slate) / 0.20)" />
    </g>
  )
}

// Generates a baseline of varied glyph-like shapes — vowels (small bumps),
// m/n (double bumps), u-dips, sweeps (s/c) and word breaks — to evoke
// medieval cursive scholastic script.
function manuscriptLine(y: number, x0: number, length: number, seed: number): string {
  let d = `M${x0} ${y}`
  let x = x0
  let i = 0
  while (x < x0 + length) {
    const h = 1.6 + Math.abs(Math.sin(i * 0.85 + seed)) * 1.1
    const v = ((i * 1.7 + seed * 2.1) * 0.5 + 100) % 10
    if (v < 1.2) {
      // word break (small pen lift)
      const gap = 1.4
      d += ` m ${gap.toFixed(2)} 0`
      x += gap
    } else if (v < 4) {
      // single vowel/c bump (a, e, i, o, c)
      const w = 2.6
      const dir = i % 2 === 0 ? -1 : 1
      d += ` q ${(w / 2).toFixed(2)} ${(dir * h).toFixed(2)} ${w} 0`
      x += w
    } else if (v < 6.5) {
      // m/n double bump
      const w = 1.8
      d += ` q ${(w / 2).toFixed(2)} -${h.toFixed(2)} ${w} 0`
      d += ` q ${(w / 2).toFixed(2)} -${h.toFixed(2)} ${w} 0`
      x += w * 2
    } else if (v < 8) {
      // u-like dip
      const w = 2.6
      d += ` q ${(w / 2).toFixed(2)} ${h.toFixed(2)} ${w} 0`
      x += w
    } else {
      // wider sweep (s, c long form)
      const w = 3.5
      const dir = (i + 1) % 2 === 0 ? -1 : 1
      d += ` q ${(w / 2).toFixed(2)} ${(dir * h * 0.7).toFixed(2)} ${w} 0`
      x += w
    }
    i++
  }
  return d
}

// Generates the vertical strokes that hover above/below the baseline:
// tall ascenders (b, d, h, l, k) often with a top curl,
// cross-stroked verticals (t, f) with optional descender,
// long descenders (g, y, j) with bottom curl, short descenders (p, q).
function manuscriptStrokes(y: number, x0: number, length: number, seed: number): string {
  const parts: string[] = []
  const stride = 4
  const count = Math.floor(length / stride)
  for (let i = 0; i < count; i++) {
    const x = x0 + i * stride + (i % 3) * 0.6
    const r = Math.sin(x * 0.43 + seed * 1.7)
    const r2 = Math.cos(x * 0.31 + seed * 2.3)

    if (r > 0.7) {
      // tall ascender (b, d, h, l, k)
      const ht = 7 + r * 2.5
      parts.push(`M${x.toFixed(1)} ${y} v-${ht.toFixed(2)}`)
      if (r2 > 0.4) {
        // small curl at top
        parts.push(`M${x.toFixed(1)} ${(y - ht).toFixed(2)} q 1 -1.2 2.2 0.5`)
      }
    } else if (r > 0.55) {
      // cross-stroked tall (t, f)
      const ht = 6 + r * 1.8
      parts.push(`M${x.toFixed(1)} ${y} v-${ht.toFixed(2)}`)
      parts.push(`M${(x - 1.2).toFixed(1)} ${(y - ht + 2.2).toFixed(2)} h 2.5`)
      if (r2 > 0.5) {
        // f sometimes has a descender
        parts.push(`M${x.toFixed(1)} ${y} v ${(2 + r2 * 1.5).toFixed(2)}`)
      }
    } else if (r < -0.7) {
      // long descender with curl (g, y, j)
      const dp = 5 + Math.abs(r) * 2.5
      parts.push(`M${x.toFixed(1)} ${y} v${dp.toFixed(2)}`)
      if (r2 > 0.2) {
        parts.push(`M${x.toFixed(1)} ${(y + dp).toFixed(2)} q -0.6 1 -1.8 0.4`)
      }
    } else if (r < -0.55) {
      // short descender (p, q)
      const dp = 3.5 + Math.abs(r) * 1.5
      parts.push(`M${x.toFixed(1)} ${y} v${dp.toFixed(2)}`)
    }
  }
  return parts.join(" ")
}

export async function BioPreview({
  hasBio = false,
  initial1 = "A",
  initial2 = "B",
}: {
  hasBio?: boolean
  initial1?: string
  initial2?: string
}) {
  if (!hasBio) {
    const t = await getTranslations("Profile")
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 py-4">
        <BookOpenText className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">{t("bioEmptyMetric")}</p>
      </div>
    )
  }

  // Manuscript-style preview — evokes a medieval scholastic autograph (Aquinas-esque).
  // Two paragraphs: drop cap initial1 with 5 lines, then initial2 with 6 lines — each
  // paragraph's last line is shortened to read as a natural trailing line-end.
  const lines = [
    // Paragraph 1 (drop cap initial1) — line spacing 14
    { y: 16,  x: 30, len: 204, s: 1.2 },
    { y: 30,  x: 30, len: 206, s: 2.7 },
    { y: 44,  x: 6,  len: 228, s: 3.4 },
    { y: 58,  x: 6,  len: 226, s: 4.1 },
    { y: 72,  x: 6,  len: 150, s: 5.6 },
    // (blank y≈86 — paragraph break)
    // Paragraph 2 (drop cap initial2)
    { y: 100, x: 30, len: 204, s: 7.0 },
    { y: 114, x: 30, len: 206, s: 7.9 },
    { y: 128, x: 6,  len: 228, s: 8.6 },
    { y: 142, x: 6,  len: 224, s: 9.3 },
    { y: 156, x: 6,  len: 230, s: 10.1 },
    { y: 170, x: 6,  len: 140, s: 10.8 },
  ]

  return (
    <svg
      viewBox="0 0 240 182"
      preserveAspectRatio="xMidYMin meet"
      className="w-full h-full text-foreground/55"
      aria-hidden
    >
      <text
        x="3"
        y="33"
        fontFamily="serif"
        fontSize="32"
        fontWeight="700"
        fontStyle="italic"
        fill="currentColor"
        className="text-[hsl(var(--brand-indigo-deep))] dark:text-[hsl(var(--brand-slate-soft))]"
      >{initial1.toUpperCase()}</text>
      <text
        x="3"
        y="117"
        fontFamily="serif"
        fontSize="32"
        fontWeight="700"
        fontStyle="italic"
        fill="currentColor"
        className="text-[hsl(var(--brand-indigo-deep))] dark:text-[hsl(var(--brand-slate-soft))]"
      >{initial2.toUpperCase()}</text>
      <g
        stroke="currentColor"
        strokeWidth="1"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {lines.map((l, i) => (
          <path key={`l-${i}`} d={manuscriptLine(l.y, l.x, l.len, l.s)} />
        ))}
        {lines.map((l, i) => (
          <path key={`s-${i}`} d={manuscriptStrokes(l.y, l.x, l.len, l.s)} />
        ))}
      </g>
    </svg>
  )
}

// SMPTE-inspired color bars — shown when the gallery has only videos and no
// thumbnails, evoking the analog "no-signal" pattern.
function TvBarsPreview() {
  const bars = [
    "#c0c0c0", // gray
    "#c0c000", // yellow
    "#00c0c0", // cyan
    "#00c000", // green
    "#c000c0", // magenta
    "#c00000", // red
    "#0000c0", // blue
  ]
  return (
    <div className="flex h-full w-full overflow-hidden rounded-lg border border-border/60">
      {bars.map((c, i) => (
        <div key={i} className="flex-1" style={{ backgroundColor: c }} />
      ))}
    </div>
  )
}

export async function GalleryPreview({ images, hasVideos = false }: { images: string[]; hasVideos?: boolean }) {
  if (images.length === 0) {
    if (hasVideos) return <TvBarsPreview />
    const t = await getTranslations("Profile")
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 py-4">
        <Images className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">{t("emptyMedia")}</p>
      </div>
    )
  }
  return (
    <div className="grid grid-cols-4 gap-1.5 h-full">
      {images.slice(0, 4).map((src, i) => (
        <div key={i} className="relative rounded-lg overflow-hidden bg-muted aspect-square">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={src} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
        </div>
      ))}
    </div>
  )
}

export async function TributesPreview({ authors }: { authors: TributeAuthorPreview[] }) {
  if (authors.length === 0) {
    const t = await getTranslations("Profile")
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 py-4">
        <Flower className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">{t("emptyTributes")}</p>
      </div>
    )
  }
  return (
    <div className="flex items-center gap-3">
      <div className="flex -space-x-2">
        {authors.slice(0, 4).map((a, i) => {
          const initials = `${a.firstName[0]}${a.lastName[0]}`.toUpperCase()
          const color = getAvatarColor(a.id)
          return (
            <div
              key={i}
              className={`h-14 w-14 rounded-full ${color} ring-2 ring-background flex items-center justify-center text-xs font-bold text-white overflow-hidden`}
            >
              {a.avatarUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={a.avatarUrl} alt={initials} className="h-full w-full object-cover" />
                : initials}
            </div>
          )
        })}
        {authors.length > 4 && (
          <div className="h-14 w-14 rounded-full bg-muted ring-2 ring-background flex items-center justify-center text-xs font-medium text-muted-foreground">
            +
          </div>
        )}
      </div>
    </div>
  )
}

export async function FavoritesPreview({ favorites }: { favorites: FavoriteRow[] }) {
  if (favorites.length === 0) {
    const t = await getTranslations("Profile")
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 py-4">
        <Heart className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">{t("emptyFavorites")}</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {favorites.slice(0, 3).map((fav) => {
        const t = fav.target
        const name = `${t.firstName} ${t.lastName}`
        const initials = `${t.firstName[0]}${t.lastName[0]}`.toUpperCase()
        const gradient = getAvatarGradient(t.id)
        return (
          <div key={fav.targetId} className="flex items-center gap-2.5">
            <div
              className={`h-7 w-7 rounded-full bg-gradient-to-br ${gradient} flex items-center justify-center text-white text-[10px] font-semibold ring-2 ring-background overflow-hidden shrink-0`}
            >
              {t.avatarUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={t.avatarUrl} alt={initials} className="h-full w-full object-cover" />
                : initials}
            </div>
            <p className="flex-1 min-w-0 text-xs font-medium truncate">{name}</p>
            <Heart className="h-3.5 w-3.5 text-rose-500 fill-rose-500 shrink-0" />
          </div>
        )
      })}
    </div>
  )
}

export async function GuardianPreview({ memorials }: { memorials: GuardedProfileRow[] }) {
  if (memorials.length === 0) {
    const t = await getTranslations("Profile")
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 py-4">
        <BrickWall className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">{t("emptyGuarded")}</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {memorials.slice(0, 3).map((m) => {
        const name = `${m.firstName} ${m.lastName}`.trim()
        const initials = `${m.firstName[0] ?? ""}${m.lastName[0] ?? ""}`.toUpperCase()
        return (
          <div key={m.id} className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-full bg-gradient-brand flex items-center justify-center text-white text-[10px] font-semibold overflow-hidden shrink-0">
              {m.avatarUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={m.avatarUrl} alt={initials} className="h-full w-full object-cover" />
                : initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{name}</p>
            </div>
            <Star className="h-3.5 w-3.5 text-amber-500 fill-amber-500 shrink-0" />
          </div>
        )
      })}
    </div>
  )
}

function osmTileUrl(lat: number, lon: number, zoom: number) {
  const n = Math.pow(2, zoom)
  const x = Math.floor(((lon + 180) / 360) * n)
  const latRad = (lat * Math.PI) / 180
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n)
  return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`
}

export async function GeoPreview({ lat, lon }: { lat?: number | null; lon?: number | null }) {
  const t = await getTranslations("Profile")
  const resolvedLat = lat ?? -22.959167
  const resolvedLng = lon ?? -43.188333
  const mapUrl = osmTileUrl(resolvedLat, resolvedLng, 14)
  return (
    <div className="relative h-full w-full min-h-[120px] rounded-xl overflow-hidden bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mapUrl} alt={t("mapAlt")} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      <div className="absolute inset-0 bg-gradient-to-t from-background/30 to-transparent" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-primary ring-2 ring-background" />
        </span>
      </div>
    </div>
  )
}


export async function PlacesPreview({ pins }: { pins: { lat: number; lon: number }[] }) {
  const t = await getTranslations("Profile")
  const valid = pins.filter((p) => p.lat !== 0 || p.lon !== 0)

  if (valid.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[120px] gap-2 py-4">
        <MapPin className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">{t("placesEmptyMetric")}</p>
      </div>
    )
  }

  // Center the static tile on the centroid of the pins.
  const cLat = valid.reduce((s, p) => s + p.lat, 0) / valid.length
  const cLon = valid.reduce((s, p) => s + p.lon, 0) / valid.length
  const mapUrl = osmTileUrl(cLat, cLon, valid.length > 1 ? 11 : 14)

  return (
    <div className="relative h-full w-full min-h-[120px] rounded-xl overflow-hidden bg-muted">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={mapUrl} alt={t("mapAlt")} className="absolute inset-0 h-full w-full object-cover" loading="lazy" />
      <div className="absolute inset-0 bg-gradient-to-t from-background/40 to-transparent" />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
        <span className="relative flex h-3 w-3">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex h-3 w-3 rounded-full bg-primary ring-2 ring-background" />
        </span>
      </div>
      <div className="absolute bottom-2 right-2 rounded-full bg-background/80 backdrop-blur-md border border-border/60 px-2.5 py-0.5 text-[11px] font-semibold">
        {valid.length}
      </div>
    </div>
  )
}

export async function QrPreview({ locked = false }: { locked?: boolean } = {}) {
  const t = await getTranslations("Profile")
  if (locked) {
    return (
      <div className="flex h-full min-h-[120px] items-center justify-center">
        <Lock className="h-16 w-16 text-muted-foreground" aria-label={t("qrLockedAlt")} />
      </div>
    )
  }
  return (
    <div className="flex h-full min-h-[120px] items-center justify-center">
      <QrCode className="h-16 w-16 text-muted-foreground" aria-label={t("qrAlt")} />
    </div>
  )
}

export async function DocumentsPreview({ documents }: { documents: { id: string; title: string }[] }) {
  if (documents.length === 0) {
    const t = await getTranslations("Profile")
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 py-4">
        <FileText className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">{t("emptyDocuments")}</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {documents.slice(0, 3).map((doc) => (
        <div key={doc.id} className="flex items-center gap-2.5">
          <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center shrink-0">
            <FileText className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <p className="flex-1 min-w-0 text-xs font-medium truncate">{doc.title}</p>
        </div>
      ))}
    </div>
  )
}

export async function PetsPreview({ pets }: { pets: { id: string; firstName: string; avatarUrl: string | null }[] }) {
  if (pets.length === 0) {
    const t = await getTranslations("Profile")
    return (
      <div className="flex flex-col items-center justify-center h-full gap-2 py-4">
        <PawPrint className="h-8 w-8 text-muted-foreground/50" />
        <p className="text-xs text-muted-foreground">{t("emptyPets")}</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {pets.slice(0, 3).map((p) => {
        const initials = p.firstName.slice(0, 2).toUpperCase()
        return (
          <div key={p.id} className="flex items-center gap-2.5">
            <div className="h-7 w-7 rounded-full bg-gradient-brand flex items-center justify-center text-white text-[10px] font-semibold overflow-hidden shrink-0">
              {p.avatarUrl
                // eslint-disable-next-line @next/next/no-img-element
                ? <img src={p.avatarUrl} alt={initials} className="h-full w-full object-cover" />
                : initials}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium truncate">{p.firstName}</p>
            </div>
            <PawPrint className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          </div>
        )
      })}
    </div>
  )
}
