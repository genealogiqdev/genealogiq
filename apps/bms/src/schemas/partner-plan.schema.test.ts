import { describe, expect, it } from 'vitest'
import { getPartnerPlanSchema } from './partner-plan.schema'
const schema = getPartnerPlanSchema((key) => key)
const plan = { name: 'Fixture Plan', code: 'FIXTURE_PLAN', description: '', annualAllowance: 20, rolloverRate: 0.3, rolloverValidityMonths: 6, graceDays: 30, committedReservationMonths: 12, activationTrialMonths: 0, activationTrialPlanCode: '', cashUsd: 100, installmentUsd: 10, unitRefUsd: 5, cashBrl: 0, installmentBrl: 0, unitRefBrl: 0, cashMxn: 0, installmentMxn: 0, unitRefMxn: 0, installmentCount: 12, isActive: true }
describe('partner plan commercial contract', () => {
  it('requires at least one cash price', () => {
    const result = schema.safeParse({ ...plan, cashUsd: 0, installmentUsd: 0 })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: ['cashBrl'], message: 'atLeastOnePrice' })]))
  })
  it('rejects installments in a currency without a cash price', () => {
    const result = schema.safeParse({ ...plan, installmentBrl: 10 })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: ['installmentBrl'], message: 'monthlyNeedsAnnual' })]))
  })
  it('requires a plan code for a nonzero activation trial', () => {
    const result = schema.safeParse({ ...plan, activationTrialMonths: 3 })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues).toEqual(expect.arrayContaining([expect.objectContaining({ path: ['activationTrialPlanCode'], message: 'trialNeedsPlanCode' })]))
  })
})
