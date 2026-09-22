import { useTranslations } from "next-intl"
import { UpgradeHint } from "@/components/upgrade-hint"
import { cn } from "@/lib/utils"
import type { TreePerson } from "@/queries/family-tree"

interface Props {
  persons:     Record<string, TreePerson>
  generations: Map<string, number>
  memberCount: number
  petCount:    number
  memberLimit: number
  currentTier: string
}

// Spelled-out cardinals (1-12) for the generation count, gender-agreed with
// "geração"/"generación" per locale — beyond that, generation counts are not
// realistic in practice, so it falls back to the plain digit.
const GENERATION_WORD_KEYS = [
  "one", "two", "three", "four", "five", "six",
  "seven", "eight", "nine", "ten", "eleven", "twelve",
] as const

export function TreeSubtitle({ generations, memberCount, petCount, memberLimit, currentTier }: Props) {
  const t = useTranslations("FamilyTree")
  const ratio = memberCount / memberLimit
  const atLimit = ratio >= 1
  // Tints the whole line (not just the count) since the sentence no longer
  // shows the limit number to give the amber tint context on its own.
  const tone = ratio >= 0.9 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"

  const gens = generations.size > 0
    ? Math.max(...generations.values()) - Math.min(...generations.values()) + 1
    : 1
  const wordKey = GENERATION_WORD_KEYS[gens - 1]
  const word = wordKey ? t(`stats.generationsWord.${wordKey}`) : String(gens)

  return (
    <p className={cn("mt-2 italic tabular-nums", tone)}>
      {t("stats.summary", { count: memberCount, gens, word })}
      {petCount > 0 && (
        <>
          <span className="mx-1.5 text-muted-foreground/50">·</span>
          {t("stats.petCount", { count: petCount })}
        </>
      )}
      {atLimit && (
        <>
          <span className="mx-1.5 text-muted-foreground/50">·</span>
          <UpgradeHint context="tree" currentTier={currentTier} inline />
        </>
      )}
    </p>
  )
}
