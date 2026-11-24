import { mobileAuth } from "@/auth"

export const dynamic = "force-dynamic"

export function GET() {
  return mobileAuth.me()
}
