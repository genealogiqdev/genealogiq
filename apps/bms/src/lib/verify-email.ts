import 'server-only'

import { hashToken } from '@genealogiq/core'
import { prisma } from '@/lib/prisma'

export type EmailTokenOutcome = 'invalid' | 'changed' | 'verified'

/**
 * Consume an email verification/change token. Shared by the web
 * /verify-email page and the mobile `verifyEmail` action so both apply the
 * same rules: single use, expiry, User-bound tokens only.
 */
export async function consumeEmailToken(token: string): Promise<EmailTokenOutcome> {
  const record = await prisma.emailToken.findUnique({
    where: { token: hashToken(token) },
  })

  // userId is nullable in the schema (also supports AppUser tokens written by
  // SEQ/APP); BMS only ever issues User-bound tokens, so reject if absent.
  if (!record || !record.userId || record.expiresAt < new Date()) {
    if (record) {
      await prisma.emailToken.delete({ where: { token: hashToken(token) } })
    }
    return 'invalid'
  }
  const userId = record.userId

  if (record.type === 'CHANGE') {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { email: record.newEmail!, emailVerified: new Date() },
      }),
      prisma.emailToken.delete({ where: { token: hashToken(token) } }),
    ])
    return 'changed'
  }

  // VERIFICATION
  await prisma.$transaction([
    prisma.user.update({
      where: { id: userId },
      data: { emailVerified: new Date() },
    }),
    prisma.emailToken.delete({ where: { token: hashToken(token) } }),
  ])
  return 'verified'
}
