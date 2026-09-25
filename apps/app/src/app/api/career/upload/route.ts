import { processMediaUpload, readMediaUploadBody } from "@genealogiq/services/media-storage"
import { NextResponse } from "next/server"
import { checkRateLimit, getClientIp } from "@/lib/rate-limit"

const ALLOWED_TYPES = ["application/pdf"]

// Anonymous, unscoped submission (the career dialog is reachable by any site
// visitor) — no ownership check, just content constraints.
export async function POST(request: Request): Promise<NextResponse> {
  try {
    const body = await readMediaUploadBody(request)
    if (body.type === "media.upload.authorize") {
      const key = await getClientIp()
      const rl = await checkRateLimit({
        key: `upload:career:${key}`,
        maxAttempts: 10,
        windowSeconds: 3600,
      })
      if (!rl.allowed) throw new Error(`Too many uploads. Try again in ${rl.retryAfter}s.`)
    }

    const json = await processMediaUpload(body, {
      allowedContentTypes: ALLOWED_TYPES,
      maximumSizeInBytes: 5 * 1024 * 1024,
      prefix: "career",
      container: "staging",
    })
    return NextResponse.json(json)
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 })
  }
}
