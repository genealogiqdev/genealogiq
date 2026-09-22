"use client"

import { useEffect, useRef, useState } from "react"
import { useTranslations } from "next-intl"

const METRICS = [
  { key: "generations", value: 4, suffix: "+" },
  { key: "people", value: 7, suffix: "" },
  { key: "formats", value: 8, suffix: "" },
] as const

export function StoryMetrics() {
  const t = useTranslations("Marketing")
  const ref = useRef<HTMLDivElement>(null)
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const element = ref.current
    if (!element) return

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches
    if (reduced) {
      setProgress(1)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return
        const startedAt = performance.now()
        const tick = (now: number) => {
          const next = Math.min(1, (now - startedAt) / 1200)
          setProgress(1 - Math.pow(1 - next, 3))
          if (next < 1) requestAnimationFrame(tick)
        }
        requestAnimationFrame(tick)
        observer.disconnect()
      },
      { threshold: 0.5 },
    )

    observer.observe(element)
    return () => observer.disconnect()
  }, [])

  return (
    <div ref={ref} className="grid gap-px overflow-hidden rounded-[1.75rem] border border-white/8 bg-white/8 sm:grid-cols-3">
      {METRICS.map((metric) => (
        <div key={metric.key} className="marketing-metric bg-[#0b0c18] px-6 py-7 text-center sm:py-8">
          <p className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">
            {Math.round(metric.value * progress)}
            {metric.suffix}
          </p>
          <p className="mt-2 text-xs leading-relaxed text-white/40">{t(`metrics.${metric.key}`)}</p>
        </div>
      ))}
    </div>
  )
}
