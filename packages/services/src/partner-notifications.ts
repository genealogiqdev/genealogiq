import 'server-only'

import { prisma } from '@genealogiq/db'
import { enqueueEmail, deliverEmail } from './email-outbox'
import { emailDate } from './sale-notifications'
import { decideRollover, countRollableCredits } from './rollover'
import { getCreditBalance } from './credits'
import { findRenewalMilestones, RENEWAL_MILESTONES } from './partner-lifecycle'
import { findEndingTrials } from './activation-trial'

export interface NotificationRun {
  sent: number
  skipped: number
  failed: number
}

// Deadlines are enforced by entitlement reads. These notices never grant or
// expire benefits. The outbox retains failures after the milestone day passes.
async function queueNotice(input: Parameters<typeof enqueueEmail>[1]): Promise<keyof NotificationRun> {
  const previous = await prisma.emailOutbox.findUnique({ where: { id: input.id }, select: { sentAt: true, canceledAt: true } })
  if (previous?.sentAt || previous?.canceledAt) return 'skipped'
  await enqueueEmail(prisma, input)
  const state = await deliverEmail(input.id)
  return state === 'sent' ? 'sent' : state === 'canceled' ? 'skipped' : 'failed'
}

export async function runPartnerNotifications(baseUrl: string, now = new Date()): Promise<NotificationRun> {
  const milestones = await findRenewalMilestones([...RENEWAL_MILESTONES], now)
  const result: NotificationRun = { sent: 0, skipped: 0, failed: 0 }

  for (const [day, windows] of milestones) {
    for (const window of windows) {
      try {
        const contract = await prisma.partnerSubscription.findUnique({
          where: { id: window.subscriptionId },
          select: {
            id: true, tenantId: true, status: true,
            founderRolloverEligible: true, founderRolloverUsed: true,
            plan: { select: { name: true, annualAllowance: true, rolloverRate: true } },
            tenant: { select: { email: true, name: true, isActive: true } },
            currentCycle: { select: { id: true, startAt: true, endAt: true } },
          },
        })
        const cycle = contract?.currentCycle
        if (!contract?.tenant.isActive || !contract.tenant.email || !cycle
          || cycle.endAt.getTime() !== window.endAt.getTime() || contract.status === 'CANCELLED'
          || (day >= 0 && contract.status === 'ACTIVE')) { result.skipped++; continue }

        // Preserve receipts written by the old sender for this cycle. Its key
        // used the subscription ID and must not suppress a later renewal year.
        const legacy = await prisma.stripeEvent.findUnique({
          where: { id: `notice:cycle:${contract.id}:d${day}` }, select: { createdAt: true },
        })
        if (legacy && legacy.createdAt >= cycle.startAt) { result.skipped++; continue }

        const balance = await getCreditBalance(contract.tenantId)
        const unused = await countRollableCredits(prisma, contract.tenantId, cycle.id)
        const rollover = decideRollover({
          unused, renewedAllowance: contract.plan.annualAllowance, rolloverRate: Number(contract.plan.rolloverRate),
          founderEligible: contract.founderRolloverEligible, founderUsed: contract.founderRolloverUsed,
        })
        const subject = day < 0 ? 'Seu plano está próximo da renovação'
          : day === 0 ? 'Seu plano chegou à data de renovação'
          : day <= 30 ? 'O prazo para renovar seu plano está terminando' : 'O ciclo do seu plano terminou'
        const paragraph = day < 0 ? 'Confira a renovação para continuar usando os benefícios do seu plano.'
          : day <= 30 ? 'Acesse o Sequoia para consultar a renovação e as condições do saldo restante.'
          : 'Consulte os benefícios disponíveis e as opções de renovação no Sequoia.'
        const state = await queueNotice({
          id: `notice:cycle:${cycle.id}:d${day}`, recipient: contract.tenant.email,
          context: { type: 'partner-cycle', subscriptionId: contract.id, cycleId: cycle.id },
          expiresAt: new Date(Math.min(now.getTime() + 7 * 86_400_000, day < 0 ? window.endAt.getTime() : Infinity)),
          message: {
            subject: `Genealogiq — ${subject}`, name: contract.tenant.name, paragraphs: [paragraph],
            details: [
              { label: 'Plano', value: contract.plan.name }, { label: 'Fim do ciclo', value: emailDate(window.endAt) },
              { label: 'Fim do prazo de renovação', value: emailDate(window.graceEndAt) },
              { label: 'Saldo disponível', value: String(balance.general) },
              { label: 'Saldo transferível na renovação', value: String(rollover.quantity) },
            ],
            action: { label: 'Ver meu plano', url: `${baseUrl.replace(/\/+$/, '')}/purchasing/plans` },
          },
        })
        result[state]++
      } catch {
        console.error('[notifications] renewal notice pending', { subscriptionId: window.subscriptionId, day })
        result.failed++
      }
    }
  }
  return result
}

/** Covers finite trial, manual-payment and complimentary consumer access. */
export async function runTrialNotifications(appUrl: string, now = new Date()): Promise<NotificationRun> {
  const ending = await findEndingTrials(30, now)
  const result: NotificationRun = { sent: 0, skipped: 0, failed: 0 }
  for (const trial of ending) {
    try {
      const guardian = await prisma.appUser.findUnique({
        where: { id: trial.appUserId }, select: { email: true, firstName: true, isActive: true, role: true },
      })
      if (!guardian?.email || !guardian.isActive || guardian.role !== 'APP_USER') { result.skipped++; continue }
      const key = `notice:trial:${trial.appUserId}:${trial.currentPeriodEnd.toISOString().slice(0, 10)}`
      if (await prisma.stripeEvent.findUnique({ where: { id: key }, select: { id: true } })) { result.skipped++; continue }
      const state = await queueNotice({
        id: key, recipient: guardian.email, expiresAt: trial.currentPeriodEnd,
        context: { type: 'consumer-term', appUserId: trial.appUserId, endAt: trial.currentPeriodEnd.toISOString() },
        message: {
          subject: 'Genealogiq — seu período de acesso está terminando', name: guardian.firstName,
          paragraphs: ['Seu período de acesso está chegando ao fim. Consulte a data de validade e as opções de continuidade na sua assinatura.'],
          details: [{ label: 'Válido até', value: emailDate(trial.currentPeriodEnd) }],
          action: { label: 'Ver minha assinatura', url: `${appUrl.replace(/\/+$/, '')}/subscriptions` },
        },
      })
      result[state]++
    } catch {
      console.error('[notifications] consumer expiry notice pending', { appUserId: trial.appUserId })
      result.failed++
    }
  }
  return result
}
