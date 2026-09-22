import { prisma } from '@genealogiq/db'
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`
    return NextResponse.json({ status: 'ready' })
  } catch (error) {
    console.error(
      '[health:ready] database check failed',
      error instanceof Error ? error.message : 'unknown error',
    )
    return NextResponse.json({ status: 'unavailable' }, { status: 503 })
  }
}
