"use client"

import { useState, type CSSProperties } from "react"
import { useLocale, useTranslations } from "next-intl"
import { ArrowRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PARTNER_CONTACT_HREF } from "@/components/marketing/partner-links"

const MAX_MONTHLY_VOLUME = 1000
const GENCODE_MIN_SALE_PRICE_BRL = 300

function useRevenueEstimate() {
  const [monthlyVolume, setMonthlyVolume] = useState(20)
  const locale = useLocale()
  const number = new Intl.NumberFormat(locale)
  const revenue = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "BRL",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  })
  const unitPrice = new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "BRL",
    currencyDisplay: "narrowSymbol",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })

  return {
    annualRevenue: monthlyVolume * 12 * GENCODE_MIN_SALE_PRICE_BRL,
    monthlyRevenue: monthlyVolume * GENCODE_MIN_SALE_PRICE_BRL,
    monthlyVolume,
    number,
    revenue,
    setMonthlyVolume,
    unitPrice,
  }
}

function CapacityRange({
  id,
  label,
  monthlyVolume,
  unit,
  number,
  setMonthlyVolume,
}: {
  id: string
  label: string
  monthlyVolume: number
  unit: string
  number: Intl.NumberFormat
  setMonthlyVolume: (value: number) => void
}) {
  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <label htmlFor={id} className="max-w-sm text-sm font-medium text-[#52595d]">{label}</label>
        <span className="shrink-0 text-right text-lg font-semibold tabular-nums text-[#171a1c]">
          {number.format(monthlyVolume)} <span className="text-xs font-normal text-[#7d8588]">{unit}</span>
        </span>
      </div>
      <input
        id={id}
        aria-label={label}
        type="range"
        min={0}
        max={MAX_MONTHLY_VOLUME}
        step={1}
        value={monthlyVolume}
        onChange={(event) => setMonthlyVolume(Number(event.target.value))}
        style={{ "--range-progress": `${(monthlyVolume / MAX_MONTHLY_VOLUME) * 100}%` } as CSSProperties}
        className="partner-range mt-5 w-full cursor-pointer"
      />
      <div className="mt-2 flex justify-between text-[11px] text-[#939a9d]">
        <span>{number.format(0)}</span>
        <span>{number.format(MAX_MONTHLY_VOLUME)}</span>
      </div>
    </div>
  )
}

export function PartnerHeroEstimator() {
  const t = useTranslations("PartnerLanding")
  const { annualRevenue, monthlyRevenue, monthlyVolume, number, revenue, setMonthlyVolume, unitPrice } = useRevenueEstimate()

  return (
    <div className="mx-auto mt-7 w-full max-w-[590px]">
      <p className="text-sm text-[#697375]">{t("hero.capacityOutputLabel")}</p>
      <div className="mt-1 flex flex-wrap items-end justify-center gap-x-3 gap-y-1 text-[#171a1c]">
        <span className="partner-highlight whitespace-nowrap text-[clamp(2.25rem,6.8vw,4.35rem)] font-semibold leading-none tracking-[-0.075em] tabular-nums" aria-live="polite">{revenue.format(annualRevenue)}</span>
        <span className="mb-1 text-sm text-[#6c7477]">{t("hero.capacityAnnualUnit")}</span>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-[#737d7e]">
        <span>{t("hero.monthlyRevenue", { amount: revenue.format(monthlyRevenue) })}</span>
        <span aria-hidden className="text-[#b2b9b6]">•</span>
        <span>{t("calculator.unitPrice", { price: unitPrice.format(GENCODE_MIN_SALE_PRICE_BRL) })}</span>
      </div>
      <div className="mt-5 rounded-[1.1rem] border border-[#e0e5e2] bg-[#f0f4ee] px-4 py-4 sm:px-6 sm:py-5">
        <CapacityRange
          id="partner-hero-monthly-volume"
          label={t("hero.capacityLabel")}
          monthlyVolume={monthlyVolume}
          unit={t("calculator.monthlyUnit")}
          number={number}
          setMonthlyVolume={setMonthlyVolume}
        />
      </div>
      <p className="mt-2 text-[11px] leading-relaxed text-[#90989a]">{t("hero.capacityNote", { price: unitPrice.format(GENCODE_MIN_SALE_PRICE_BRL) })}</p>
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
  const { annualRevenue, monthlyRevenue, monthlyVolume, number, revenue, setMonthlyVolume, unitPrice } = useRevenueEstimate()

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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-[#343b3e]">{t("calculator.panelTitle")}</p>
              <span className="rounded-full border border-[#e1e6e2] px-3 py-1 text-[10px] text-[#7f8986]">{t("calculator.badge", { price: unitPrice.format(GENCODE_MIN_SALE_PRICE_BRL) })}</span>
            </div>
            <div className="mt-9">
              <CapacityRange
                id="partner-monthly-volume"
                label={t("calculator.monthlyLabel")}
                monthlyVolume={monthlyVolume}
                unit={t("calculator.monthlyUnit")}
                number={number}
                setMonthlyVolume={setMonthlyVolume}
              />
            </div>
            <div className="mt-8 border-t border-[#edf0ed] pt-6">
              <p className="text-xs leading-relaxed text-[#81898a]">{t("calculator.formula", { price: unitPrice.format(GENCODE_MIN_SALE_PRICE_BRL) })}</p>
              <p className="mt-3 text-[11px] leading-relaxed text-[#9ba2a1]">{t("calculator.caveat")}</p>
            </div>
          </div>

          <div className="@container flex min-w-0 flex-col justify-between bg-[#f3f6ef] p-6 sm:p-8 lg:p-10">
            <div>
              <p className="text-sm text-[#6f7975]">{t("calculator.outputLabel")}</p>
              <p className="mt-3 whitespace-nowrap text-[clamp(1.875rem,12cqw,5.3rem)] font-semibold leading-none tracking-[-0.075em] tabular-nums text-[#171a1c]" aria-live="polite">
                {revenue.format(annualRevenue)}
              </p>
              <p className="mt-2 text-sm font-medium text-[#65715f]">{t("calculator.annualUnit")}</p>
            </div>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
              <div className="rounded-xl border border-[#e2e8df] bg-white/75 p-4">
                <p className="text-xs font-medium text-[#6f7975]">{t("calculator.monthlyRevenueLabel")}</p>
                <p className="mt-2 text-xl font-semibold tracking-[-0.035em] tabular-nums text-[#242a27]">{revenue.format(monthlyRevenue)}</p>
                <p className="mt-1 text-[11px] text-[#87908c]">{t("calculator.monthlyRevenueUnit")}</p>
              </div>
              <div className="rounded-xl border border-[#e2e8df] bg-white/75 p-4">
                <p className="text-xs font-medium text-[#6f7975]">{t("calculator.unitPriceLabel")}</p>
                <p className="mt-2 text-xl font-semibold tracking-[-0.035em] tabular-nums text-[#242a27]">{unitPrice.format(GENCODE_MIN_SALE_PRICE_BRL)}</p>
                <p className="mt-1 text-[11px] text-[#87908c]">{t("calculator.unitPriceUnit")}</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
