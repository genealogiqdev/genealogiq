"use client"

import { useState, type CSSProperties } from "react"
import { useLocale, useTranslations } from "next-intl"
import { ArrowRight, Check } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PARTNER_CONTACT_HREF } from "@/components/marketing/partner-links"

const MAX_MONTHLY_MEMORIALS = 1000

function useCapacityEstimate() {
  const [monthlyMemorials, setMonthlyMemorials] = useState(20)
  const locale = useLocale()
  const number = new Intl.NumberFormat(locale)

  return {
    annualCodes: monthlyMemorials * 12,
    monthlyMemorials,
    number,
    setMonthlyMemorials,
  }
}

function CapacityRange({
  id,
  label,
  monthlyMemorials,
  unit,
  number,
  setMonthlyMemorials,
}: {
  id: string
  label: string
  monthlyMemorials: number
  unit: string
  number: Intl.NumberFormat
  setMonthlyMemorials: (value: number) => void
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <label htmlFor={id} className="max-w-sm text-sm font-medium text-[#52595d]">{label}</label>
        <span className="shrink-0 text-right text-lg font-semibold tabular-nums text-[#171a1c]">
          {number.format(monthlyMemorials)} <span className="text-xs font-normal text-[#7d8588]">{unit}</span>
        </span>
      </div>
      <input
        id={id}
        aria-label={label}
        type="range"
        min={0}
        max={MAX_MONTHLY_MEMORIALS}
        step={1}
        value={monthlyMemorials}
        onChange={(event) => setMonthlyMemorials(Number(event.target.value))}
        style={{ "--range-progress": `${(monthlyMemorials / MAX_MONTHLY_MEMORIALS) * 100}%` } as CSSProperties}
        className="partner-range mt-5 w-full cursor-pointer"
      />
      <div className="mt-2 flex justify-between text-[11px] text-[#939a9d]">
        <span>{number.format(0)}</span>
        <span>{number.format(MAX_MONTHLY_MEMORIALS)}</span>
      </div>
    </div>
  )
}

export function PartnerHeroEstimator() {
  const t = useTranslations("PartnerLanding")
  const { annualCodes, monthlyMemorials, number, setMonthlyMemorials } = useCapacityEstimate()

  return (
    <div className="mx-auto mt-7 w-full max-w-[590px]">
      <p className="text-sm text-[#697375]">{t("hero.capacityOutputLabel")}</p>
      <div className="mt-1 flex items-end justify-center gap-3 text-[#171a1c]">
        <span className="partner-highlight text-[clamp(3rem,6.8vw,4.35rem)] font-semibold leading-none tracking-[-0.075em] tabular-nums">{number.format(annualCodes)}</span>
        <span className="mb-1 text-sm text-[#6c7477]">{t("hero.capacityAnnualUnit")}</span>
      </div>
      <div className="mt-5 rounded-[1.1rem] border border-[#e0e5e2] bg-[#f0f4ee] px-4 py-4 sm:px-6 sm:py-5">
        <CapacityRange
          id="partner-hero-monthly-memorials"
          label={t("hero.capacityLabel")}
          monthlyMemorials={monthlyMemorials}
          unit={t("calculator.monthlyUnit")}
          number={number}
          setMonthlyMemorials={setMonthlyMemorials}
        />
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-[#90989a]">{t("hero.capacityNote")}</p>
      <div className="mt-5 flex flex-col justify-center gap-2.5 sm:flex-row">
        <Button asChild className="h-11 rounded-full bg-[#b9f000] px-6 text-sm font-semibold text-[#1b2115] shadow-none hover:bg-[#a9dd00]">
          <a href={PARTNER_CONTACT_HREF}>{t("hero.primaryCta")}<ArrowRight className="h-4 w-4" /></a>
        </Button>
        <Button asChild variant="outline" className="h-11 rounded-full border-[#dce1de] bg-white px-6 text-sm text-[#41484b] shadow-none hover:bg-[#f5f7f5] hover:text-[#171a1c]">
          <a href="#how">{t("hero.secondaryCta")}</a>
        </Button>
      </div>
    </div>
  )
}

export function PartnerCapacityCalculator() {
  const t = useTranslations("PartnerLanding")
  const { annualCodes, monthlyMemorials, number, setMonthlyMemorials } = useCapacityEstimate()

  return (
    <section id="capacity" className="scroll-mt-24 bg-[#edf2ee] px-6 py-20 sm:px-8 sm:py-28" aria-labelledby="partner-capacity-title">
      <div className="mx-auto max-w-[1120px]">
        <div className="max-w-[720px]">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#737d7a]">{t("calculator.eyebrow")}</p>
          <h2 id="partner-capacity-title" className="mt-4 text-[clamp(2.25rem,4.6vw,3.7rem)] font-semibold leading-[1.04] tracking-[-0.055em] text-[#181b1e]">
            {t("calculator.title")}
          </h2>
          <p className="mt-4 max-w-[620px] text-base leading-relaxed text-[#717a7c]">{t("calculator.description")}</p>
        </div>

        <div className="mt-10 grid overflow-hidden rounded-[1.5rem] border border-[#dce2de] bg-white shadow-[0_24px_70px_rgba(38,48,40,0.06)] lg:grid-cols-[0.95fr_1.05fr]">
          <div className="p-6 sm:p-8 lg:p-10">
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm font-semibold text-[#343b3e]">{t("calculator.panelTitle")}</p>
              <span className="rounded-full border border-[#e1e6e2] px-3 py-1 text-[10px] text-[#7f8986]">{t("calculator.badge")}</span>
            </div>
            <div className="mt-9">
              <CapacityRange
                id="partner-monthly-memorials"
                label={t("calculator.monthlyLabel")}
                monthlyMemorials={monthlyMemorials}
                unit={t("calculator.monthlyUnit")}
                number={number}
                setMonthlyMemorials={setMonthlyMemorials}
              />
            </div>
            <div className="mt-8 border-t border-[#edf0ed] pt-6">
              <p className="text-xs leading-relaxed text-[#81898a]">{t("calculator.formula")}</p>
              <p className="mt-3 text-[11px] leading-relaxed text-[#9ba2a1]">{t("calculator.caveat")}</p>
            </div>
          </div>

          <div className="flex flex-col justify-between bg-[#f3f6ef] p-6 sm:p-8 lg:p-10">
            <div>
              <p className="text-sm text-[#6f7975]">{t("calculator.outputLabel")}</p>
              <p className="mt-3 text-[clamp(3.25rem,7vw,5.3rem)] font-semibold leading-none tracking-[-0.075em] tabular-nums text-[#171a1c]" aria-live="polite">
                {number.format(annualCodes)}
              </p>
              <p className="mt-2 text-sm font-medium text-[#65715f]">{t("calculator.annualUnit")}</p>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-3 lg:grid-cols-1 xl:grid-cols-3">
              {(["subscription", "packages", "activation"] as const).map((key) => (
                <div key={key} className="rounded-xl border border-[#e2e8df] bg-white/75 p-3.5">
                  <span className="grid h-7 w-7 place-items-center rounded-full bg-[#e8f6bb] text-[#62782a]"><Check className="h-3.5 w-3.5" /></span>
                  <p className="mt-3 text-xs font-semibold text-[#323a36]">{t(`model.items.${key}.title`)}</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-[#7d8782]">{t(`model.items.${key}.description`)}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
