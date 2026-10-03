// Seeds the E2E admin into the configured database: pnpm seed:e2e.
// This legacy helper checks URL presence only and does not enforce isolation.
// Existing process environment wins over dotenv's .env.e2e values. Use only a
// verified disposable database with an existing schema; see docs/TESTING.md.
// The guarded seed:local path is used for the documented three-app baseline.
import { config } from "dotenv"
import bcrypt from "bcryptjs"
import { E2E_USER } from "./test-user"

config({ path: ".env.e2e" })

async function main() {
  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL not set — create .env.e2e from .env.e2e.example first.")
  }
  // Dynamic import so the dotenv config above lands before the client connects.
  const { prisma } = await import("@genealogiq/db")

  const password = await bcrypt.hash(E2E_USER.password, 10)
  const common = {
    role: E2E_USER.role,
    isActive: true,
    emailVerified: new Date(),
    failedLoginAttempts: 0,
    lockedUntil: null,
    password,
  }
  const user = await prisma.user.upsert({
    where: { email: E2E_USER.email },
    update: common,
    create: {
      email: E2E_USER.email,
      firstName: E2E_USER.firstName,
      lastName: E2E_USER.lastName,
      ...common,
    },
    select: { id: true, email: true, role: true },
  })
  console.log("[e2e seed] upserted admin:", user)
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("[e2e seed] failed:", e)
    process.exit(1)
  })
