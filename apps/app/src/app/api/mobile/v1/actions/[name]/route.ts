import { createActionRoute } from "@genealogiq/auth/mobile"
import { mobileAuth } from "@/auth"
import { actions, publicActions } from "@/mobile/actions"

export const dynamic = "force-dynamic"

export const POST = createActionRoute(actions, { hasBearer: mobileAuth.hasBearer, publicNames: publicActions })
