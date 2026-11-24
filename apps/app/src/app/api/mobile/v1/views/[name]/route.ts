import { createViewRoute } from "@genealogiq/auth/mobile"
import { mobileAuth } from "@/auth"
import { views, publicViews } from "@/mobile/views"

export const dynamic = "force-dynamic"

export const GET = createViewRoute(views, { hasBearer: mobileAuth.hasBearer, publicNames: publicViews })
