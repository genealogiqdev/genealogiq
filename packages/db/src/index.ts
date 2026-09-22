import 'dotenv/config'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from './generated/prisma/client'

const connectionString = process.env.DATABASE_URL
if (!connectionString) {
  throw new Error('DATABASE_URL is required')
}

const configuredPoolSize = Number.parseInt(process.env.DATABASE_POOL_MAX ?? '5', 10)
const poolSize = Number.isFinite(configuredPoolSize) && configuredPoolSize > 0
  ? configuredPoolSize
  : 5

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient }

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter: new PrismaPg({
      connectionString,
      max: poolSize,
      connectionTimeoutMillis: 10_000,
      idleTimeoutMillis: 30_000,
    }),
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma

// Re-export the generated Prisma namespace, model types and enums so apps can
// `import { Prisma, Role, type Supplier } from '@genealogiq/db'` instead of
// reaching into a per-app generated folder.
export * from './generated/prisma/client'
