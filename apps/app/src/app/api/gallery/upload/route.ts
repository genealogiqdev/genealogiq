import { processMediaUpload, readMediaUploadBody } from "@genealogiq/services/media-storage"
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { canManageProfile } from "@/lib/profile"
import { checkRateLimit } from "@/lib/rate-limit"

const ALLOWED_TYPES = [
  "image/jpeg", "image/png", "image/webp", "image/gif",
  "video/mp4", "video/webm", "video/quicktime", "video/x-m4v",
]

// Client-uploads route: returns a short-lived blob token so the browser PUTs
// straight to Vercel Blob storage instead of sending the file through the
// serverless function (which would 413 anything over ~4.5 MB).
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await readMediaUploadBody(request)
    const session = await auth()
    if (!session?.user?.id) throw new Error("Unauthorized")
    if (body.type === "media.upload.authorize") {
      const rl = await checkRateLimit({
        key: `upload:gallery:${session.user.id}`,
        maxAttempts: 30,
        windowSeconds: 600,
      })
      if (!rl.allowed) throw new Error(`Too many uploads. Try again in ${rl.retryAfter}s.`)
    }

    const { profileId } = parseClientPayload(body.clientPayload)
    const profile = await prisma.appUser.findUnique({
      where:  { id: profileId },
      select: { id: true, guardedBy: { where: { status: "ACCEPTED" }, select: { guardianId: true, status: true } } },
    })
    if (!profile) throw new Error("Profile not found")
    if (!canManageProfile(profile, session.user.id)) throw new Error("Forbidden")

    const json = await processMediaUpload(body, {
      allowedContentTypes: ALLOWED_TYPES,
      maximumSizeInBytes: 100 * 1024 * 1024,
      prefix: `profiles/${profileId}/gallery`,
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
