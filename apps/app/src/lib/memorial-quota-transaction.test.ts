import { expect, it, vi } from "vitest"

vi.mock("@/lib/subscription", () => ({ getMemorialFeatures: vi.fn() }))
vi.mock("@/queries/memorial", () => ({ countMemorialsByCreatorId: vi.fn() }))
vi.mock("@/lib/extra-units", () => ({ getExtraUnits: vi.fn() }))

import { getMemorialCreationStatus } from "./memorial-quota"
import { getMemorialFeatures } from "@/lib/subscription"
import { countMemorialsByCreatorId } from "@/queries/memorial"
import { getExtraUnits } from "@/lib/extra-units"

it("uses the transaction's count with current plan and purchased extra capacity", async () => {
  const tx = { appUser: {} } as never
  vi.mocked(countMemorialsByCreatorId).mockResolvedValue(2)
  vi.mocked(getMemorialFeatures).mockResolvedValue({ memorialsMax: 1 } as never)
  vi.mocked(getExtraUnits).mockResolvedValue(1)
  expect(await getMemorialCreationStatus("guardian-1", tx)).toEqual({ count: 2, limit: 2, allowed: false })
  expect(countMemorialsByCreatorId).toHaveBeenCalledWith("guardian-1", tx)
  expect(getMemorialFeatures).toHaveBeenCalledWith("guardian-1", tx)
  expect(getExtraUnits).toHaveBeenCalledWith("guardian-1", "MEMORIAL", tx)
})
