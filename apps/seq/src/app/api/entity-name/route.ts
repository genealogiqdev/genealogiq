import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { verifyTenantSession } from '@/lib/dal'

const ENTITY_TYPES = ['users', 'customers', 'business-customers', 'suppliers', 'memorialized', 'supplier-categories', 'customer-categories'] as const
type EntityType = (typeof ENTITY_TYPES)[number]

async function resolveName(type: EntityType, id: string, customerId: string): Promise<string | null> {
  if (type === 'business-customers') {
    const record = await prisma.businessCustomer.findUnique({ where: { id, tenantId: customerId }, select: { name: true } })
    return record?.name ?? null
  }
  if (type === 'users') {
    const record = await prisma.user.findUnique({ where: { id, tenantId: customerId }, select: { firstName: true, lastName: true } })
    if (!record) return null
    return `${record.firstName} ${record.lastName}`.trim() || null
  }
  if (type === 'customers') {
    const record = await prisma.appUser.findUnique({ where: { id, tenantId: customerId }, select: { firstName: true, lastName: true } })
    if (!record) return null
    return `${record.firstName} ${record.lastName}`.trim() || null
  }
  if (type === 'suppliers') {
    const record = await prisma.supplier.findUnique({ where: { id, tenantId: customerId }, select: { name: true } })
    return record?.name ?? null
  }
  if (type === 'memorialized') {
    const record = await prisma.appUser.findUnique({ where: { id, tenantId: customerId }, select: { firstName: true, lastName: true } })
    if (!record) return null
    return `${record.firstName} ${record.lastName}`.trim() || null
  }
  if (type === 'supplier-categories') {
    const record = await prisma.supplierCategory.findUnique({ where: { id, tenantId: customerId }, select: { name: true } })
    return record?.name ?? null
  }
  if (type === 'customer-categories') {
    const record = await prisma.appUserCategory.findUnique({ where: { id, tenantId: customerId }, select: { name: true } })
    return record?.name ?? null
  }
  return null
}

export async function GET(req: NextRequest) {
  const { customerId } = await verifyTenantSession()

  const { searchParams } = req.nextUrl
  const type = searchParams.get('type') as EntityType | null
  const id   = searchParams.get('id')

  if (!type || !id || !ENTITY_TYPES.includes(type)) {
    return NextResponse.json({ error: 'Invalid params' }, { status: 400 })
  }

  const name = await resolveName(type, id, customerId)
  if (!name) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  return NextResponse.json({ name })
}
