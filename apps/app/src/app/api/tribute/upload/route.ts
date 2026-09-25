import { processMediaUpload, readMediaUploadBody } from "@genealogiq/services/media-storage"
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { checkRateLimit } from "@/lib/rate-limit"

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await readMediaUploadBody(request)
    const session = await auth()
    if (!session?.user?.id) throw new Error("Unauthorized")

    if (body.type === "media.upload.authorize") {
        const rl = await checkRateLimit({
          key: `upload:tribute:${session.user.id}`,
          maxAttempts: 20,
          windowSeconds: 600,
        })
        if (!rl.allowed) throw new Error(`Too many uploads. Try again in ${rl.retryAfter}s.`)
    }

    const { profileId } = parseClientPayload(body.clientPayload)
    if (profileId === session.user.id) throw new Error("You cannot tribute your own profile")

    const profile = await prisma.appUser.findUnique({
      where:  { id: profileId },
      select: { id: true },
    })
    if (!profile) throw new Error("Profile not found")

    const json = await processMediaUpload(body, {
      allowedContentTypes: ALLOWED_TYPES,
      maximumSizeInBytes: 10 * 1024 * 1024,
      prefix: `profiles/${profileId}/tributes/${session.user.id}`,
      container: "staging",
    })
    return NextResponse.json(json)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}

function parseClientPayload(raw: string | null): { profileId: string } {
  if (!raw) throw new Error("Missing profileId")
  try {
    const parsed = JSON.parse(raw) as { profileId?: unknown }
    if (typeof parsed.profileId !== "string" || !parsed.profileId) throw new Error("Missing profileId")
    return { profileId: parsed.profileId }
  } catch {
    throw new Error("Invalid client payload")
  }
}
