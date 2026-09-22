"use client"

import { useState } from "react"
import { CalendarDays, Heart, MapPin, Sparkles } from "lucide-react"
import { useTranslations } from "next-intl"
import { cn } from "@/lib/utils"

const PEOPLE = [
  { id: "helena", x: 15, y: 10, initials: "HC" },
  { id: "antonio", x: 63, y: 10, initials: "AC" },
  { id: "lucia", x: 3, y: 49, initials: "LP" },
  { id: "marcos", x: 33, y: 49, initials: "MP" },
  { id: "thais", x: 63, y: 49, initials: "TP" },
  { id: "rafael", x: 80, y: 82, initials: "RP" },
  { id: "clara", x: 47, y: 82, initials: "CP" },
] as const

type PersonId = (typeof PEOPLE)[number]["id"]

export function FamilyTreeDemo() {
  const t = useTranslations("Marketing")
  const [selected, setSelected] = useState<PersonId>("thais")
  const person = PEOPLE.find((item) => item.id === selected) ?? PEOPLE[4]

  return (
    <div className="grid items-stretch gap-5 lg:grid-cols-[1.35fr_0.65fr]">
      <div className="marketing-panel min-h-[460px] overflow-x-auto p-4 sm:p-7">
        <div className="relative mx-auto h-[400px] min-w-[620px] max-w-[760px]" role="group" aria-label={t("tree.diagramLabel")}>
          <svg
            aria-hidden
            viewBox="0 0 760 400"
            preserveAspectRatio="none"
            className="absolute inset-0 h-full w-full overflow-visible"
          >
            <g className="marketing-tree-lines" fill="none" stroke="currentColor" strokeWidth="1.6">
              <path d="M156 74 H510" />
              <path d="M333 74 V162" />
              <path d="M66 162 H617" />
              <path d="M66 162 V208" />
              <path d="M282 162 V208" />
              <path d="M510 162 V208" />
              <path d="M510 274 V316" />
              <path d="M405 316 H640" />
              <path d="M405 316 V333" />
              <path d="M640 316 V333" />
            </g>
          </svg>

          {PEOPLE.map((item, index) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSelected(item.id)}
              aria-pressed={selected === item.id}
              className={cn(
                "marketing-tree-node absolute w-32 -translate-x-1/2 rounded-2xl border px-3 py-3 text-left transition-all duration-500",
                selected === item.id
                  ? "z-10 -translate-y-1 border-violet-300/55 bg-violet-300/16 shadow-[0_18px_45px_rgba(68,54,145,0.38)]"
                  : "border-white/10 bg-white/[0.055] hover:-translate-y-0.5 hover:border-white/20 hover:bg-white/[0.09]",
              )}
              style={{ left: `${item.x + 8}%`, top: `${item.y}%`, animationDelay: `${index * 90}ms` }}
            >
              <span className="flex items-center gap-2.5">
                <span
                  className={cn(
                    "grid h-8 w-8 shrink-0 place-items-center rounded-full text-[10px] font-bold",
                    selected === item.id ? "bg-violet-300 text-violet-950" : "bg-white/10 text-white/70",
                  )}
                >
                  {item.initials}
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-xs font-semibold text-white">{t(`tree.people.${item.id}.name`)}</span>
                  <span className="block truncate text-[10px] text-white/40">{t(`tree.people.${item.id}.relation`)}</span>
                </span>
              </span>
            </button>
          ))}
        </div>
      </div>

      <aside key={person.id} className="marketing-panel marketing-person-card flex min-h-[360px] flex-col p-6 sm:p-8">
        <div className="flex items-start justify-between gap-4">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-violet-300 to-indigo-400 text-base font-bold text-violet-950 shadow-xl shadow-violet-950/25">
            {person.initials}
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300/20 bg-emerald-300/8 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-emerald-200">
            <Sparkles className="h-3 w-3" />
            {t("tree.profileBadge")}
          </span>
        </div>

        <div className="mt-7">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-violet-300/75">{t(`tree.people.${person.id}.relation`)}</p>
          <h3 className="mt-2 text-2xl font-semibold text-white">{t(`tree.people.${person.id}.name`)}</h3>
          <p className="mt-4 text-sm leading-relaxed text-white/55">{t(`tree.people.${person.id}.story`)}</p>
        </div>

        <div className="mt-auto grid gap-2 pt-8 text-xs text-white/55">
          <span className="flex items-center gap-2 rounded-xl bg-white/[0.045] px-3 py-2.5">
            <CalendarDays className="h-4 w-4 text-violet-300" />
            {t(`tree.people.${person.id}.years`)}
          </span>
          <span className="flex items-center gap-2 rounded-xl bg-white/[0.045] px-3 py-2.5">
            <MapPin className="h-4 w-4 text-violet-300" />
            {t(`tree.people.${person.id}.place`)}
          </span>
          <span className="flex items-center gap-2 rounded-xl bg-white/[0.045] px-3 py-2.5">
            <Heart className="h-4 w-4 text-violet-300" />
            {t("tree.memoryCount")}
          </span>
        </div>
      </aside>
    </div>
  )
}
