import 'server-only'

import type Stripe from 'stripe'
import type { Prisma } from '@genealogiq/db'
import { enqueueEmail, notificationUrl } from './email-outbox'

export const manualSaleEmailId = (id: string) => `manual-sale:${id}`
export const packageSaleEmailId = (id: string) => `package-sale:${id}`
export const partnerInvoiceEmailId = (id: string, failed = false) => `partner-invoice:${id}${failed ? ':failed' : ''}`
export const consumerInvoiceEmailId = (id: string, failed = false) => `consumer-invoice:${id}:${failed ? 'failed' : 'paid'}`
export const emailDate = (value: Date) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Sao_Paulo' }).format(value)
export const emailMoney = (value: number, currency: string) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency }).format(value)

/** Also used by the privileged recovery action for sales made before notifications existed. */
export async function queueManualSaleEmail(tx: Prisma.TransactionClient, redemptionId: string): Promise<string | null> {
  const receipt = await tx.couponRedemption.findUnique({
    where: { id: redemptionId },
    include: {
      genCodeOrder: { include: { tenant: true, package: true } },
      subscriptionCycle: { include: { subscription: { include: { tenant: true } } } },
      appSale: { include: { appUser: true, subscription: true } },
    },
  })
  if (!receipt) return null
  const order = receipt.genCodeOrder
  const cycle = receipt.subscriptionCycle
  const sale = receipt.appSale
  const recipient = order?.tenant.email ?? cycle?.subscription.tenant.email ?? sale?.appUser.email
  const name = order?.tenant.name ?? cycle?.subscription.tenant.name ?? sale?.appUser.firstName
  const expiresAt = order?.creditExpiresAt ?? cycle?.endAt ?? sale?.currentPeriodEnd
  const product = order?.package.name ?? sale?.subscription.name ?? String((cycle?.planSnapshot as { name?: string } | null)?.name ?? '')
  if (!recipient || !name || !expiresAt || expiresAt <= new Date()
    || (order && (order.status !== 'PAID' || !order.tenant.isActive))
    || (cycle && (!cycle.subscription.tenant.isActive || cycle.subscription.status === 'CANCELLED'))
    || (sale && (!sale.appUser.isActive || sale.appUser.role !== 'APP_USER' || sale.status !== 'active'))) return null

  return enqueueEmail(tx, {
    id: manualSaleEmailId(receipt.id), recipient,
    expiresAt,
    context: sale ? { type: 'consumer-sale', appUserId: sale.appUserId, saleId: sale.id }
      : { type: 'partner', tenantId: (order?.tenantId ?? cycle!.subscription.tenantId) },
    message: {
      subject: 'Genealogiq — seu produto foi liberado', name,
      paragraphs: [
        'A equipe Genealogiq confirmou a liberação do seu produto. Os benefícios já estão disponíveis na sua conta.',
        receipt.source === 'external_payment'
          ? 'O pagamento recebido por outro meio foi registrado. Esta liberação não gera uma nova cobrança.'
          : 'Esta liberação regulariza um estoque anterior e não gera uma nova cobrança.',
      ],
      details: [
        { label: 'Referência', value: receipt.reference },
        { label: 'Produto', value: product },
        ...(order ? [{ label: 'GenCodes liberados', value: String(order.quantity) }] : []),
        { label: 'Válido até', value: emailDate(expiresAt) },
        ...(receipt.externalAmount != null ? [{ label: 'Pagamento registrado', value: emailMoney(Number(receipt.externalAmount), receipt.currency) }] : []),
        { label: 'Saldo a pagar nesta liberação', value: emailMoney(0, receipt.currency) },
      ],
      action: sale
        ? { label: 'Acessar minha assinatura', url: notificationUrl('app', '/subscriptions') }
        : { label: 'Acessar o Sequoia', url: notificationUrl('seq', order ? '/inventory/activations' : '/purchasing/plans') },
    },
  })
}

export async function queuePackageSaleEmail(tx: Prisma.TransactionClient, orderId: string): Promise<string | null> {
  const order = await tx.genCodeOrder.findUnique({ where: { id: orderId }, include: { tenant: true, package: true } })
  if (!order || order.status !== 'PAID' || !order.creditExpiresAt || !order.tenant.isActive) return null
  return enqueueEmail(tx, {
    id: packageSaleEmailId(order.id), recipient: order.tenant.email,
    expiresAt: order.creditExpiresAt, context: { type: 'partner', tenantId: order.tenantId },
    message: {
      subject: 'Genealogiq — compra de GenCodes confirmada', name: order.tenant.name,
      paragraphs: ['Seu pagamento foi confirmado e os GenCodes já estão disponíveis no Sequoia.'],
      details: [
        { label: 'Pedido', value: order.id }, { label: 'Produto', value: order.package.name },
        { label: 'GenCodes liberados', value: String(order.quantity) },
        { label: 'Total', value: emailMoney(Number(order.totalAmount), order.currency) },
        { label: 'Válido até', value: emailDate(order.creditExpiresAt) },
      ],
      action: { label: 'Ver meus GenCodes', url: notificationUrl('seq', '/inventory/activations') },
    },
  })
}

export async function queuePartnerInvoiceEmail(tx: Prisma.TransactionClient, subscriptionId: string, invoice: Stripe.Invoice, failed = false): Promise<string | null> {
  const contract = await tx.partnerSubscription.findUnique({
    where: { id: subscriptionId }, include: { tenant: true, plan: true, currentCycle: true },
  })
  if (!contract?.tenant.isActive) return null
  return enqueueEmail(tx, {
    id: partnerInvoiceEmailId(invoice.id, failed), recipient: contract.tenant.email,
    context: { type: 'partner', tenantId: contract.tenantId, ...(failed && { supersededBy: partnerInvoiceEmailId(invoice.id) }) },
    message: {
      subject: failed ? 'Genealogiq — atenção ao pagamento do plano' : 'Genealogiq — pagamento do plano confirmado', name: contract.tenant.name,
      paragraphs: [failed ? 'Não foi possível confirmar o pagamento do seu plano. Acesse o Sequoia para verificar a forma de pagamento.' : 'Recebemos o pagamento do seu plano. Consulte o ciclo e os benefícios no Sequoia.'],
      details: [
        { label: 'Plano', value: contract.plan.name },
        ...(!failed ? [{ label: 'Pagamento', value: emailMoney((invoice.amount_paid ?? 0) / 100, invoice.currency.toUpperCase()) }] : []),
        ...(contract.currentCycle ? [{ label: 'Fim do ciclo', value: emailDate(contract.currentCycle.endAt) }] : []),
      ],
      action: { label: 'Ver meu plano', url: notificationUrl('seq', '/purchasing/plans') },
    },
  })
}

export async function queueConsumerInvoiceEmail(tx: Prisma.TransactionClient, sub: Stripe.Subscription, invoice: Stripe.Invoice, failed = false): Promise<string | null> {
  if (!sub.metadata?.userId || !sub.metadata?.subscriptionId) return null
  const buyer = await tx.appUser.findUnique({ where: { id: sub.metadata.userId }, select: { email: true, firstName: true, role: true, isActive: true } })
  const plan = await tx.subscription.findUnique({ where: { id: sub.metadata.subscriptionId }, select: { name: true } })
  if (!buyer?.email || buyer.role !== 'APP_USER' || !buyer.isActive || !plan) return null
  return enqueueEmail(tx, {
    id: consumerInvoiceEmailId(invoice.id, failed), recipient: buyer.email,
    context: { type: 'app-user', appUserId: sub.metadata.userId, ...(failed && { supersededBy: consumerInvoiceEmailId(invoice.id) }) },
    message: {
      subject: failed ? 'Genealogiq — atenção ao pagamento da assinatura' : 'Genealogiq — pagamento da assinatura confirmado',
      name: buyer.firstName,
      paragraphs: [failed ? 'Não foi possível confirmar o pagamento. Acesse sua assinatura para verificar a forma de pagamento.' : 'Recebemos o pagamento da sua assinatura. Consulte os benefícios e a validade na sua conta.'],
      details: [{ label: 'Plano', value: plan.name }, ...(!failed ? [{ label: 'Pagamento', value: emailMoney((invoice.amount_paid ?? 0) / 100, invoice.currency.toUpperCase()) }] : [])],
      action: { label: 'Ver minha assinatura', url: notificationUrl('app', '/subscriptions') },
    },
  })
}

/** Stripe v22 nests the subscription reference under parent; old event versions remain supported. */
export function invoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
  const raw = invoice.parent?.subscription_details?.subscription
    ?? (invoice as unknown as { subscription?: string | { id: string } }).subscription
  return typeof raw === 'string' ? raw : raw?.id ?? null
}
