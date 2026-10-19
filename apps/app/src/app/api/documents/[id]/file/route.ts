import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { canManageProfile } from '@/lib/profile'
import { isAllowedMediaUrl } from '@genealogiq/core'
import { isPrivateVercelDocumentUrl, readPrivateDocument } from '@genealogiq/services/media-storage'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return new Response(null, { status: 401 })
  const { id } = await params
  const document = await prisma.document.findUnique({ where: { id } })
  if (!document) return new Response(null, { status: 404 })
  const profile = await prisma.appUser.findUnique({
    where: { id: document.userId },
    select: { id: true, guardedBy: { where: { status: 'ACCEPTED' }, select: { guardianId: true, status: true } } },
  })
  if (!profile || (!document.isPublic && !canManageProfile(profile, session.user.id))) {
    return new Response(null, { status: 404 })
  }
  const headers = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' }
  if (!isPrivateVercelDocumentUrl(document.fileUrl)) {
    // Historical public objects remain reachable until the verified migration.
    if (!isAllowedMediaUrl(document.fileUrl)) return new Response(null, { status: 404 })
    return new Response(null, { status: 302, headers: { ...headers, Location: document.fileUrl } })
  }
  try {
    const object = await readPrivateDocument(document.fileUrl)
    return new Response(object.stream, {
      headers: {
        ...headers,
        'Content-Type': 'application/pdf',
        'Content-Disposition': 'inline; filename="document.pdf"',
      },
    })
  } catch {
    return new Response(null, { status: 502, headers })
  }
}
