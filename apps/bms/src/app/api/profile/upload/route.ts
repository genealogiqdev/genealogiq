import { processMediaUpload, readMediaUploadBody } from "@genealogiq/services/media-storage"
import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { checkRateLimit } from "@/lib/rate-limit"

const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"]

export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await readMediaUploadBody(request)
    const session = await auth()
    if (!session?.user?.id) throw new Error("Unauthorized")

    if (body.type === "media.upload.authorize") {
        const rl = await checkRateLimit({
          key: `upload:avatar:${session.user.id}`,
          maxAttempts: 20,
          windowSeconds: 600,
        })
        if (!rl.allowed) throw new Error(`Too many uploads. Try again in ${rl.retryAfter}s.`)
    }

    const json = await processMediaUpload(body, {
      allowedContentTypes: ALLOWED_TYPES,
      maximumSizeInBytes: 5 * 1024 * 1024,
      prefix: `users/${session.user.id}/avatar`,
      container: "staging",
    })
    return NextResponse.json(json)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
