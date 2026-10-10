import "server-only"

import { after } from "next/server"
import { prisma } from "@/lib/prisma"
import { sendPushForNotification } from "@/lib/push"
import { enqueueEmail, deliverEmail, notificationUrl } from '@genealogiq/services/email-outbox'

type NotificationType =
  | "TRIBUTE_PENDING"
  | "TRIBUTE_APPROVED"
  | "TRIBUTE_REJECTED"
  | "FAMILY_REQUEST_PENDING"
  | "FAMILY_REQUEST_ACCEPTED"
  | "FAMILY_REQUEST_REJECTED"
  | "GUARDIAN_REQUEST_PENDING"
  | "GUARDIAN_REQUEST_ACCEPTED"
  | "GUARDIAN_REQUEST_REJECTED"

interface NotifyArgs {
  type:               NotificationType
  userId:             string
  actorId?:           string | null
  tributeId?:         string | null
  familyRelationId?:  string | null
  appUserGuardianId?: string | null
}

export async function notify(args: NotifyArgs) {
  const emailId = await prisma.$transaction(async (tx) => {
    const notification = await tx.notification.create({
      data: {
        type:              args.type,
        userId:            args.userId,
        actorId:           args.actorId ?? null,
        tributeId:         args.tributeId ?? null,
        familyRelationId:  args.familyRelationId ?? null,
        appUserGuardianId: args.appUserGuardianId ?? null,
      },
    })
    if (args.actorId === args.userId) return null
    const recipient = await tx.appUser.findUnique({
      where: { id: args.userId }, select: { email: true, firstName: true, isActive: true, role: true },
    })
    // Ghosts, memorials, pets and inactive accounts are never email recipients.
    if (!recipient?.email || !recipient.isActive || recipient.role !== 'APP_USER') return null
    const text: Record<NotificationType, string> = {
      TRIBUTE_PENDING: 'Você recebeu uma homenagem que precisa da sua aprovação.',
      TRIBUTE_APPROVED: 'Sua homenagem foi aprovada.',
      TRIBUTE_REJECTED: 'Sua homenagem não foi aprovada.',
      FAMILY_REQUEST_PENDING: 'Você recebeu uma solicitação de vínculo familiar.',
      FAMILY_REQUEST_ACCEPTED: 'Sua solicitação de vínculo familiar foi aceita.',
      FAMILY_REQUEST_REJECTED: 'Sua solicitação de vínculo familiar não foi aceita.',
      GUARDIAN_REQUEST_PENDING: 'Você recebeu uma solicitação de acesso como guardião.',
      GUARDIAN_REQUEST_ACCEPTED: 'Sua solicitação de acesso como guardião foi aceita.',
      GUARDIAN_REQUEST_REJECTED: 'Sua solicitação de acesso como guardião não foi aceita.',
    }
    return enqueueEmail(tx, {
      id: `activity:${notification.id}`, recipient: recipient.email,
      context: { type: 'app-user', appUserId: args.userId },
      message: {
        subject: 'Genealogiq — há uma atualização para você', name: recipient.firstName,
        paragraphs: [text[args.type], 'Entre na sua conta para consultar os detalhes.'],
        action: { label: 'Ver minhas notificações', url: notificationUrl('app', '/messages') },
      },
    })
  })
  // Web push fan-out runs after the response is flushed — it never slows the
  // calling action, and sendPushForNotification never throws.
  after(async () => {
    await Promise.allSettled([sendPushForNotification(args), ...(emailId ? [deliverEmail(emailId)] : [])])
  })
}

export async function markNotificationsRead(
  userId: string,
  where: { tributeId?: string; familyRelationId?: string; appUserGuardianId?: string },
) {
  await prisma.notification.updateMany({
    where: {
      userId,
      readAt: null,
      ...(where.tributeId         ? { tributeId:         where.tributeId         } : {}),
      ...(where.familyRelationId  ? { familyRelationId:  where.familyRelationId  } : {}),
      ...(where.appUserGuardianId ? { appUserGuardianId: where.appUserGuardianId } : {}),
    },
    data: { readAt: new Date() },
  })
}

export async function markNotificationRead(notificationId: string, userId: string) {
  await prisma.notification.updateMany({
    where: { id: notificationId, userId, readAt: null },
    data:  { readAt: new Date() },
  })
}
