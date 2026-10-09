import 'server-only'

import { prisma } from '@/lib/prisma'
import { verifyTenantSession } from '@/lib/dal'
import { getMemorialQrStatus } from '@genealogiq/core'
import type { Prisma } from '@genealogiq/db'

const memorialPlanSelect = {
  name: true, code: true, memorialsMax: true, petsMax: true, qrCodeMax: true,
} as const

const memorialGuardWhere = {
  status: 'ACCEPTED',
  appUser: { role: { in: ['APP_MEMO', 'APP_PET'] } },
} satisfies Prisma.AppUserGuardianWhereInput

const addressSelect = {
  zip:          true,
  street:       true,
  number:       true,
  complement:   true,
  neighborhood: true,
  city:         true,
  state:        true,
  country:      true,
} as const

export async function getCustomers() {
  const { customerId } = await verifyTenantSession()

  return prisma.appUser.findMany({
    where:   { tenantId: customerId, role: 'APP_USER' },
    select: {
      id:        true,
      firstName: true,
      lastName:  true,
      email:     true,
      isActive:  true,
      createdAt: true,
    },
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  })
}

export async function getCustomer(id: string) {
  const { customerId } = await verifyTenantSession()

  const customer = await prisma.appUser.findUnique({
    where:  { id, tenantId: customerId, role: 'APP_USER' },
    select: {
      id:              true,
      firstName:       true,
      lastName:        true,
      gender:          true,
      birthDate:       true,
      birthCity:       true,
      birthState:      true,
      birthCountry:    true,
      email:           true,
      phoneCountryCode: true,
      phone:           true,
      categoryId:      true,
      notes:           true,
      isActive:        true,
      fb:              true,
      instagram:       true,
      linkedin:        true,
      tiktok:          true,
      x:               true,
      youtube:         true,
      otherSocial:     true,
      website:         true,
      address:         { select: addressSelect },
      _count: {
        select: {
          // GenCodes this customer bought from us. Only codes written off via
          // the platform channel carry the buyer link — a manual write-off
          // records a free-text name and cannot be attributed to a row here.
          genCodesBought: { where: { tenantId: customerId } },
        },
      },
      guardiansOf: {
        where: memorialGuardWhere,
        select: {
          appUser: {
            select: {
              id:        true,
              firstName: true,
              lastName:  true,
              birthDate: true,
              deathDate: true,
              role:      true,
              createdAt: true,
              genCode:   { select: { id: true } },
              qrCode:    { select: { url: true } },
            },
          },
        },
      },
      appSales: {
        where: { status: { in: ['active', 'trialing'] }, currentPeriodEnd: { gt: new Date() } },
        orderBy: { currentPeriodEnd: 'desc' },
        take: 1,
        select: { subscription: { select: memorialPlanSelect } },
      },
      extraUnitPurchases: {
        where: { resource: { in: ['MEMORIAL', 'QR_CODE'] } },
        select: { resource: true, quantity: true },
      },
    },
  })

  if (!customer) return null

  const { appSales, extraUnitPurchases, guardiansOf, ...details } = customer
  const plan = appSales[0]?.subscription ?? await prisma.subscription.findUnique({
    where: { code: 'FREE' }, select: memorialPlanSelect,
  })
  if (!plan) throw new Error('FREE subscription row not found')

  const extra = (resource: string) => extraUnitPurchases
    .filter((purchase) => purchase.resource === resource)
    .reduce((sum, purchase) => sum + purchase.quantity, 0)
  const profiles = guardiansOf.map(({ appUser }) => appUser)
  const humans = profiles.filter((profile) => profile.role === 'APP_MEMO').length
  const pets = profiles.filter((profile) => profile.role === 'APP_PET').length
  const humanLimit = plan.memorialsMax + extra('MEMORIAL')
  const petLimit = plan.petsMax
  const extraQrCodes = extra('QR_CODE')
  const appUrl = (process.env.APP_URL ?? 'https://genealogiq.app').replace(/\/+$/, '')
  return {
    ...details,
    memorialQuota: {
      planName: plan.name,
      planCode: plan.code,
      humans: { count: humans, limit: humanLimit, available: Math.max(0, humanLimit - humans) },
      pets: { count: pets, limit: petLimit, available: Math.max(0, petLimit - pets) },
    },
    // APP-created profiles can be tenantless. QR downloads use the accepted
    // guardianship of this scoped customer, not the memorial edit permission.
    guardiansOf: profiles.map((profile) => {
      const qr = getMemorialQrStatus(profiles, profile.id, plan, extraQrCodes)
      return {
        appUser: {
          id: profile.id,
          firstName: profile.firstName,
          lastName: profile.lastName,
          birthDate: profile.birthDate,
          deathDate: profile.deathDate,
          role: profile.role,
          customerId: id,
          profileUrl: profile.qrCode?.url ?? `${appUrl}/profile/${profile.id}`,
          qrAccess: qr.unlocked ? 'allowed' as const
            : plan.code === 'FREE' ? 'premiumRequired' as const : 'limitReached' as const,
        },
      }
    }),
  }
}
