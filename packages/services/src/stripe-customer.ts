import 'server-only'

import { prisma } from '@genealogiq/db'
import { stripe } from './stripe'

/**
 * One Stripe Customer per Tenant — billing and invoices stay consolidated
 * whichever way the tenant bought: an employee checking out in SEQ, or a
 * GenealogiQ operator generating a payment link in BMS. Both apps resolve the
 * customer through here so the two paths can never fork into two customers for
 * the same Genealogiq partner.
 *
 * Idempotent: the id is cached on Tenant.stripeCustomerId after the first call.
 *
 * The cache is VERIFIED, not trusted. A cached id can outlive the customer it
 * names — the account's API keys get rotated to a different Stripe account, a
 * customer is deleted from the dashboard — and the failure that produces is
 * ugly and late: `No such customer` thrown from checkout.sessions.create, after
 * the contract row has already been written, on a partner who is trying to pay
 * us. One extra API call per checkout is a cheap price for the id being real,
 * and a stale row heals itself the first time anyone touches it.
 */
export async function ensureTenantStripeCustomer(tenantId: string): Promise<string> {
  const tenant = await prisma.tenant.findUnique({
    where:  { id: tenantId },
    select: { stripeCustomerId: true, email: true, name: true },
  })
  if (!tenant) throw new Error('Tenant not found')

  if (tenant.stripeCustomerId && (await customerExists(tenant.stripeCustomerId))) {
    return tenant.stripeCustomerId
  }

  const customer = await stripe.customers.create({
    email:    tenant.email,
    name:     tenant.name,
    metadata: { tenantId },
  })

  await prisma.tenant.update({
    where: { id: tenantId },
    data:  { stripeCustomerId: customer.id },
  })

  return customer.id
}

/**
 * Whether a cached Stripe customer id still names a live customer.
 *
 * A deleted customer comes back as an object with `deleted: true` rather than
 * an error, so both shapes have to be handled. Any other Stripe failure —
 * network, auth, rate limit — is rethrown: treating an outage as "customer
 * missing" would mint a duplicate customer for a partner who already has one,
 * and split their billing history in two.
 */
async function customerExists(customerId: string): Promise<boolean> {
  try {
    const customer = await stripe.customers.retrieve(customerId)
    return !(customer as { deleted?: boolean }).deleted
  } catch (err) {
    if ((err as { code?: string }).code === 'resource_missing') return false
    throw err
  }
}
