import { mobileAuth } from "@/auth"

export const dynamic = "force-dynamic"

export function POST(request: Request) {
  return mobileAuth.login(request)
}
