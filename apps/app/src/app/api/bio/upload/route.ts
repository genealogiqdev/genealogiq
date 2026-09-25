import {
  deleteUnreferencedMediaUrls,
  isAzureMediaUrlInPrefix,
  processMediaUpload,
  readMediaUploadBody,
} from "@genealogiq/services/media-storage"
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { canManageProfile } from "@/lib/profile"
import { checkRateLimit } from "@/lib/rate-limit"

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]

type ClientPayload =
  | { profileId: string }
  | { scope: "create-memorial" | "create-pet" | "create-ghost" }

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await readMediaUploadBody(request)
    const session = await auth()
    if (!session?.user?.id) throw new Error("Unauthorized")

    if (body.type === "media.upload.authorize") {
      const rl = await checkRateLimit({
        key: `upload:bio:${session.user.id}`,
        maxAttempts: 20,
        windowSeconds: 600,
      })
      if (!rl.allowed) throw new Error(`Too many uploads. Try again in ${rl.retryAfter}s.`)
    }

    const prefix = await getAuthorizedPrefix(body.clientPayload, session.user.id)
    const json = await processMediaUpload(body, {
      allowedContentTypes: ALLOWED_TYPES,
      maximumSizeInBytes: 10 * 1024 * 1024,
      prefix,
      container: "staging",
    })
    return NextResponse.json(json)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}

export async function DELETE(request: Request): Promise<NextResponse> {
  try {
    const session = await auth()
    if (!session?.user?.id) throw new Error("Unauthorized")
    const body = await request.json() as { url?: unknown; clientPayload?: unknown }
    if (typeof body.url !== "string") throw new Error("Invalid media URL")
    const prefix = await getAuthorizedPrefix(
      typeof body.clientPayload === "string" ? body.clientPayload : null,
      session.user.id,
    )
    if (!isAzureMediaUrlInPrefix(body.url, prefix)) throw new Error("Forbidden")
    await deleteUnreferencedMediaUrls([body.url])
    return NextResponse.json({ ok: true })
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}

async function getAuthorizedPrefix(raw: string | null, actorId: string): Promise<string> {
  const payload = parseClientPayload(raw)
  if ("profileId" in payload) {
    const profile = await prisma.appUser.findUnique({
      where:  { id: payload.profileId },
      select: { id: true, guardedBy: { where: { status: "ACCEPTED" }, select: { guardianId: true, status: true } } },
    })
    if (!profile) throw new Error("Profile not found")
    if (!canManageProfile(profile, actorId)) throw new Error("Forbidden")
    return `profiles/${payload.profileId}/bio`
  }
  return `pending/${actorId}/${payload.scope}`
}

function parseClientPayload(raw: string | null): ClientPayload {
  if (!raw) throw new Error("Missing client payload")
  try {
    const parsed = JSON.parse(raw) as Partial<{ profileId: unknown; scope: unknown }>
    if (typeof parsed.profileId === "string" && parsed.profileId) {
      return { profileId: parsed.profileId }
    }
    if (
      parsed.scope === "create-memorial" ||
      parsed.scope === "create-pet" ||
      parsed.scope === "create-ghost"
    ) {
      return { scope: parsed.scope }
    }
    throw new Error("Invalid client payload")
  } catch {
    throw new Error("Invalid client payload")
  }
}
