/** Calendar terms keep their UTC time and clamp month-end (Jan 31 -> Feb 28/29). */
export function addBillingMonths(from: Date, months: number): Date {
  const result = new Date(from)
  const day = result.getUTCDate()
  result.setUTCDate(1)
  result.setUTCMonth(result.getUTCMonth() + months)
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate()
  result.setUTCDate(Math.min(day, lastDay))
  return result
}
