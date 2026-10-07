import { config } from "dotenv"
import bcrypt from "bcryptjs"

config({ path: "packages/db/.env" })

const EMAIL = "local-admin@genealogiq.test"
const PASSWORD = "Local-Password-123!"
const DATABASE_NAME = "genealogiq"
const B2B_SUBSCRIPTION_ID = "local-b2b-subscription"
const B2B_CYCLE_ID = "local-b2b-cycle"
const APP_PREMIUM_SALE_ID = "local-app-premium-sale"
const FAMILY_IDS = {
  grandfather: "clocalgrandfather000000001",
  grandmother: "clocalgrandmother000000001",
  father: "clocalfather000000000000001",
  mother: "clocalmother000000000000001",
  sister: "clocalsister000000000000001",
  child: "clocalchild0000000000000001",
  rex: "clocalpetrex000000000000001",
  luna: "clocalpetluna00000000000001",
} as const
let disconnect: (() => Promise<void>) | undefined

function assertLocalDatabase(connectionString: string | undefined): asserts connectionString is string {
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set. Create packages/db/.env first.")
  }

  const url = new URL(connectionString)
  const localHosts = new Set(["localhost", "127.0.0.1", "[::1]"])

  if (!localHosts.has(url.hostname) || url.pathname.slice(1) !== DATABASE_NAME) {
    throw new Error(
      `Refusing to seed non-local database ${url.hostname}${url.pathname}. ` +
        `Expected a local host and database "${DATABASE_NAME}".`,
    )
  }
}

async function main() {
  assertLocalDatabase(process.env.DATABASE_URL)

  // Import only after dotenv is loaded because @genealogiq/db reads
  // DATABASE_URL during module initialization.
  const { prisma } = await import("@genealogiq/db")
  disconnect = () => prisma.$disconnect()
  const manualCoupon = await prisma.discountCoupon.findFirst({ where: { code: { equals: 'Gen2026', mode: 'insensitive' } } })
  if (!manualCoupon) {
    await prisma.discountCoupon.create({ data: {
      id: 'gen2026-manual-coupon', code: 'Gen2026', redemptionMode: 'manual',
      description: '100% para vendas recebidas por outro gateway ou regularização de estoque. Aplicação pela equipe no BMS.',
      discountType: 'percent', percentOff: 100, duration: 'once', createdById: 'system:gen2026',
    } })
  }
  // A fresh consumer needs the real FREE fallback even before its first sale.
  await prisma.subscription.upsert({
    where: { code: 'FREE' }, update: {},
    create: { name: 'Free', code: 'FREE', termLength: 0, treeMaxMembers: 32, bioMaxChars: 2048,
      mediaMaxImages: 32, mediaMaxVideos: 8, documentsMax: 16, geoPlacesMax: 3,
      memorialsMax: 1, petsMax: 0, qrCodeMax: 1 },
  })
  const password = await bcrypt.hash(PASSWORD, 12)

  const company = await prisma.company.upsert({
    where: { taxId: "LOCAL-COMPANY-001" },
    update: {
      legalName: "Genealogiq Local Development",
      tradeName: "Genealogiq Local",
      email: "company@genealogiq.test",
      phone: "5550100",
      isActive: true,
    },
    create: {
      legalName: "Genealogiq Local Development",
      tradeName: "Genealogiq Local",
      taxId: "LOCAL-COMPANY-001",
      email: "company@genealogiq.test",
      phone: "5550100",
    },
  })

  const tenant = await prisma.tenant.upsert({
    where: { taxId: "LOCAL-TENANT-001" },
    update: {
      email: "tenant@genealogiq.test",
      isActive: true,
      name: "Local Development Tenant",
      tradeName: "Local Tenant",
      phone: "5550101",
      moduleRecordsSuppliers: true,
      moduleCategoriesSuppliers: true,
    },
    create: {
      email: "tenant@genealogiq.test",
      entityType: "COMPANY",
      name: "Local Development Tenant",
      tradeName: "Local Tenant",
      taxId: "LOCAL-TENANT-001",
      phone: "5550101",
      moduleRecordsSuppliers: true,
      moduleCategoriesSuppliers: true,
    },
  })

  const b2bTenant = await prisma.tenant.upsert({
    where: { taxId: "LOCAL-B2B-001" },
    update: {
      email: "rnsbrum@gmail.com",
      isActive: true,
      name: "Local B2B Test Customer",
      tradeName: "Local B2B Customer",
      phoneCountryCode: "55",
      phone: "5550102",
      notes: "Active B2B customer seeded for GenCode package sale testing.",
    },
    create: {
      email: "rnsbrum@gmail.com",
      entityType: "COMPANY",
      name: "Local B2B Test Customer",
      tradeName: "Local B2B Customer",
      taxId: "LOCAL-B2B-001",
      phoneCountryCode: "55",
      phone: "5550102",
      notes: "Active B2B customer seeded for GenCode package sale testing.",
    },
  })

  const b2bPlan = await prisma.partnerPlan.upsert({
    where: { code: "LOCAL_B2B_TEST" },
    update: {
      name: "Local B2B Test Plan",
      description: "Development-only plan for testing B2B GenCode package sales.",
      annualAllowance: 20,
      isActive: true,
    },
    create: {
      code: "LOCAL_B2B_TEST",
      name: "Local B2B Test Plan",
      description: "Development-only plan for testing B2B GenCode package sales.",
      annualAllowance: 20,
    },
  })

  const b2bSubscription = await prisma.partnerSubscription.upsert({
    where: { id: B2B_SUBSCRIPTION_ID },
    update: {
      tenantId: b2bTenant.id,
      planId: b2bPlan.id,
      status: "ACTIVE",
      autoRenew: true,
    },
    create: {
      id: B2B_SUBSCRIPTION_ID,
      tenantId: b2bTenant.id,
      planId: b2bPlan.id,
      status: "ACTIVE",
      autoRenew: true,
    },
  })

  const cycleStart = new Date()
  cycleStart.setUTCHours(0, 0, 0, 0)
  const cycleEnd = new Date(cycleStart)
  cycleEnd.setUTCFullYear(cycleEnd.getUTCFullYear() + 1)
  const cycleGraceEnd = new Date(cycleEnd)
  cycleGraceEnd.setUTCDate(cycleGraceEnd.getUTCDate() + b2bPlan.graceDays)

  await prisma.subscriptionCycle.upsert({
    where: { id: B2B_CYCLE_ID },
    update: {
      subscriptionId: b2bSubscription.id,
      planId: b2bPlan.id,
      planSnapshot: {
        code: b2bPlan.code,
        name: b2bPlan.name,
        annualAllowance: b2bPlan.annualAllowance,
        graceDays: b2bPlan.graceDays,
      },
      priceSnapshot: { currency: "BRL", annualCashAmount: 0 },
      startAt: cycleStart,
      endAt: cycleEnd,
      graceEndAt: cycleGraceEnd,
      status: "ACTIVE",
    },
    create: {
      id: B2B_CYCLE_ID,
      subscriptionId: b2bSubscription.id,
      planId: b2bPlan.id,
      planSnapshot: {
        code: b2bPlan.code,
        name: b2bPlan.name,
        annualAllowance: b2bPlan.annualAllowance,
        graceDays: b2bPlan.graceDays,
      },
      priceSnapshot: { currency: "BRL", annualCashAmount: 0 },
      startAt: cycleStart,
      endAt: cycleEnd,
      graceEndAt: cycleGraceEnd,
      status: "ACTIVE",
    },
  })

  await prisma.partnerSubscription.update({
    where: { id: b2bSubscription.id },
    data: { currentCycleId: B2B_CYCLE_ID },
  })

  const staffUser = await prisma.user.upsert({
    where: { email: EMAIL },
    update: {
      firstName: "Local",
      lastName: "Admin",
      password,
      role: "SUPER_ADMIN",
      isActive: true,
      emailVerified: new Date(),
      failedLoginAttempts: 0,
      lockedUntil: null,
      tenantId: tenant.id,
    },
    create: {
      firstName: "Local",
      lastName: "Admin",
      email: EMAIL,
      password,
      role: "SUPER_ADMIN",
      isActive: true,
      emailVerified: new Date(),
      tenantId: tenant.id,
    },
  })

  const existingAppUser = await prisma.appUser.findFirst({ where: { email: EMAIL } })
  const appUserData = {
    firstName: "Local",
    lastName: "Admin",
    password,
    role: "APP_USER" as const,
    isActive: true,
    emailVerified: new Date(),
    failedLoginAttempts: 0,
    lockedUntil: null,
    preferredLocale: "en-US",
  }
  const appUser = existingAppUser
    ? await prisma.appUser.update({ where: { id: existingAppUser.id }, data: appUserData })
    : await prisma.appUser.create({ data: { ...appUserData, email: EMAIL } })

  const premiumPlan = await prisma.subscription.upsert({
    where: { code: "PREMIUM" },
    update: {
      isActive: true,
      treeMaxMembers: 512,
      bioMaxChars: 8192,
      mediaMaxImages: 1024,
      mediaMaxVideos: 32,
      documentsMax: 64,
      geoPlacesMax: 6,
      memorialsMax: 10,
      petsMax: 10,
      qrCodeMax: 1,
    },
    create: {
      code: "PREMIUM",
      name: "Premium",
      description: "Local development Premium plan",
      termLength: 12,
      treeMaxMembers: 512,
      bioMaxChars: 8192,
      mediaMaxImages: 1024,
      mediaMaxVideos: 32,
      documentsMax: 64,
      geoPlacesMax: 6,
      memorialsMax: 10,
      petsMax: 10,
      qrCodeMax: 1,
    },
  })

  const premiumPeriodEnd = new Date()
  premiumPeriodEnd.setUTCFullYear(premiumPeriodEnd.getUTCFullYear() + 1)
  await prisma.appSale.upsert({
    where: { id: APP_PREMIUM_SALE_ID },
    update: {
      appUserId: appUser.id,
      subscriptionId: premiumPlan.id,
      status: "active",
      cadence: "annual",
      currency: "BRL",
      currentPeriodEnd: premiumPeriodEnd,
    },
    create: {
      id: APP_PREMIUM_SALE_ID,
      appUserId: appUser.id,
      subscriptionId: premiumPlan.id,
      status: "active",
      cadence: "annual",
      currency: "BRL",
      currentPeriodEnd: premiumPeriodEnd,
    },
  })

  const familyProfiles = [
    {
      id: FAMILY_IDS.grandfather,
      firstName: "Antônio",
      lastName: "Silva",
      role: "APP_MEMO" as const,
      gender: "MALE" as const,
      birthDate: new Date("1938-04-12T00:00:00.000Z"),
      deathDate: new Date("2011-09-03T00:00:00.000Z"),
      birthPlace: "Belo Horizonte",
      birthCountry: "BR",
      deathPlace: "São Paulo",
      deathCountry: "BR",
    },
    {
      id: FAMILY_IDS.grandmother,
      firstName: "Helena",
      lastName: "Silva",
      role: "APP_MEMO" as const,
      gender: "FEMALE" as const,
      birthDate: new Date("1942-07-21T00:00:00.000Z"),
      deathDate: new Date("2018-02-14T00:00:00.000Z"),
      birthPlace: "Ouro Preto",
      birthCountry: "BR",
      deathPlace: "São Paulo",
      deathCountry: "BR",
    },
    {
      id: FAMILY_IDS.father,
      firstName: "Carlos",
      lastName: "Silva",
      role: "APP_MEMO" as const,
      gender: "MALE" as const,
      birthDate: new Date("1967-01-18T00:00:00.000Z"),
      deathDate: new Date("2022-06-10T00:00:00.000Z"),
      birthPlace: "São Paulo",
      birthCountry: "BR",
      deathPlace: "Campinas",
      deathCountry: "BR",
    },
    {
      id: FAMILY_IDS.mother,
      firstName: "Sofia",
      lastName: "Oliveira",
      role: "APP_GHOST" as const,
      gender: "FEMALE" as const,
      birthDate: new Date("1969-11-02T00:00:00.000Z"),
      deathDate: null,
      birthPlace: "Campinas",
      birthCountry: "BR",
      deathPlace: null,
      deathCountry: null,
    },
    {
      id: FAMILY_IDS.sister,
      firstName: "Marina",
      lastName: "Silva",
      role: "APP_GHOST" as const,
      gender: "FEMALE" as const,
      birthDate: new Date("1994-08-17T00:00:00.000Z"),
      deathDate: null,
      birthPlace: "Campinas",
      birthCountry: "BR",
      deathPlace: null,
      deathCountry: null,
    },
    {
      id: FAMILY_IDS.child,
      firstName: "Lucas",
      lastName: "Silva",
      role: "APP_GHOST" as const,
      gender: "MALE" as const,
      birthDate: new Date("2015-03-09T00:00:00.000Z"),
      deathDate: null,
      birthPlace: "Campinas",
      birthCountry: "BR",
      deathPlace: null,
      deathCountry: null,
    },
  ]

  for (const member of familyProfiles) {
    await prisma.appUser.upsert({
      where: { id: member.id },
      update: { ...member, isActive: true, isPublicProfile: true },
      create: { ...member, isActive: true, isPublicProfile: true },
    })
    await prisma.appUserGuardian.upsert({
      where: { appUserId_guardianId: { appUserId: member.id, guardianId: appUser.id } },
      update: { status: "ACCEPTED", requestedById: appUser.id },
      create: {
        appUserId: member.id,
        guardianId: appUser.id,
        status: "ACCEPTED",
        requestedById: appUser.id,
      },
    })
  }

  const familyRelations = [
    { fromId: FAMILY_IDS.grandfather, toId: FAMILY_IDS.grandmother, type: "SPOUSE", subtype: "married" },
    { fromId: FAMILY_IDS.grandfather, toId: FAMILY_IDS.father, type: "PARENT_OF", subtype: null },
    { fromId: FAMILY_IDS.grandmother, toId: FAMILY_IDS.father, type: "PARENT_OF", subtype: null },
    { fromId: FAMILY_IDS.father, toId: FAMILY_IDS.mother, type: "SPOUSE", subtype: "married" },
    { fromId: FAMILY_IDS.father, toId: appUser.id, type: "PARENT_OF", subtype: null },
    { fromId: FAMILY_IDS.mother, toId: appUser.id, type: "PARENT_OF", subtype: null },
    { fromId: appUser.id, toId: FAMILY_IDS.sister, type: "SIBLING", subtype: null },
    { fromId: appUser.id, toId: FAMILY_IDS.child, type: "PARENT_OF", subtype: null },
  ]

  for (const relation of familyRelations) {
    await prisma.familyRelation.upsert({
      where: {
        fromId_toId_type: {
          fromId: relation.fromId,
          toId: relation.toId,
          type: relation.type,
        },
      },
      update: { subtype: relation.subtype, status: "ACCEPTED", requestedById: null },
      create: { ...relation, status: "ACCEPTED" },
    })
  }

  const pets = [
    {
      id: FAMILY_IDS.rex,
      firstName: "Rex",
      petSpecies: "Cachorro",
      petBreed: "Golden Retriever",
      gender: "MALE" as const,
      birthDate: new Date("2019-05-14T00:00:00.000Z"),
      deathDate: null,
      ownerIds: [appUser.id, FAMILY_IDS.sister],
      bio: "Rex adora passeios, água e reunir toda a família no quintal.",
    },
    {
      id: FAMILY_IDS.luna,
      firstName: "Luna",
      petSpecies: "Gato",
      petBreed: "Siamês",
      gender: "FEMALE" as const,
      birthDate: new Date("2008-02-02T00:00:00.000Z"),
      deathDate: new Date("2021-10-08T00:00:00.000Z"),
      ownerIds: [FAMILY_IDS.grandmother],
      bio: "Luna acompanhou Helena por muitos anos e faz parte das memórias da família.",
    },
  ]

  // A previous local schema represented pet ownership as PET_OF. Convert any
  // such rows before recreating the deterministic fixtures below.
  const legacyPetRelations = await prisma.familyRelation.findMany({
    where: { type: "PET_OF", status: "ACCEPTED" },
    select: { id: true, fromId: true, toId: true },
  })
  for (const relation of legacyPetRelations) {
    const [pet, owner] = await Promise.all([
      prisma.appUser.findUnique({ where: { id: relation.fromId }, select: { role: true } }),
      prisma.appUser.findUnique({ where: { id: relation.toId }, select: { role: true } }),
    ])
    if (pet?.role === "APP_PET" && owner?.role !== "APP_PET") {
      await prisma.petOwnership.upsert({
        where: { petId_ownerId: { petId: relation.fromId, ownerId: relation.toId } },
        update: {},
        create: { id: relation.id, petId: relation.fromId, ownerId: relation.toId },
      })
    }
  }
  await prisma.familyRelation.deleteMany({ where: { type: "PET_OF" } })

  for (const pet of pets) {
    await prisma.appUser.upsert({
      where: { id: pet.id },
      update: {
        firstName: pet.firstName,
        lastName: "",
        role: "APP_PET",
        gender: pet.gender,
        birthDate: pet.birthDate,
        deathDate: pet.deathDate,
        petSpecies: pet.petSpecies,
        petBreed: pet.petBreed,
        isActive: true,
        isPublicProfile: true,
      },
      create: {
        id: pet.id,
        firstName: pet.firstName,
        lastName: "",
        role: "APP_PET",
        gender: pet.gender,
        birthDate: pet.birthDate,
        deathDate: pet.deathDate,
        petSpecies: pet.petSpecies,
        petBreed: pet.petBreed,
        isActive: true,
        isPublicProfile: true,
      },
    })
    await prisma.appUserGuardian.upsert({
      where: { appUserId_guardianId: { appUserId: pet.id, guardianId: appUser.id } },
      update: { status: "ACCEPTED", requestedById: appUser.id },
      create: {
        appUserId: pet.id,
        guardianId: appUser.id,
        status: "ACCEPTED",
        requestedById: appUser.id,
      },
    })
    await prisma.petOwnership.deleteMany({
      where: { petId: pet.id, ownerId: { notIn: pet.ownerIds } },
    })
    for (const ownerId of pet.ownerIds) {
      await prisma.petOwnership.upsert({
        where: { petId_ownerId: { petId: pet.id, ownerId } },
        update: {},
        create: { petId: pet.id, ownerId },
      })
    }
    await prisma.bio.upsert({
      where: { userId: pet.id },
      update: { text: pet.bio },
      create: { userId: pet.id, text: pet.bio },
    })
  }

  await prisma.favorite.upsert({
    where: { userId_targetId: { userId: appUser.id, targetId: FAMILY_IDS.rex } },
    update: {},
    create: { userId: appUser.id, targetId: FAMILY_IDS.rex },
  })

  const genCodePackage = await prisma.genCodePackage.upsert({
    where: { code: "GENCODE_VIRTUAL_BRL" },
    update: {
      name: "Pacote de Gencodes",
      unitPrice: 150,
      currency: "BRL",
      minimumQuantity: 20,
      isActive: true,
    },
    create: {
      code: "GENCODE_VIRTUAL_BRL",
      name: "Pacote de Gencodes",
      unitPrice: 150,
      currency: "BRL",
      minimumQuantity: 20,
      isActive: true,
    },
  })

  const credentialsValid =
    (await bcrypt.compare(PASSWORD, staffUser.password ?? "")) &&
    (await bcrypt.compare(PASSWORD, appUser.password ?? ""))

  if (!credentialsValid || !staffUser.tenantId || !staffUser.emailVerified || !appUser.emailVerified) {
    throw new Error("Local login records failed verification.")
  }

  console.log("Local development data is ready.")
  console.log(`Company:  ${company.tradeName}`)
  console.log(`Tenant:   ${tenant.tradeName}`)
  console.log(`B2B sale customer: ${b2bTenant.name} (${b2bTenant.taxId})`)
  console.log(`Product:  ${genCodePackage.name}`)
  console.log(`Family:   ${familyProfiles.length + 1} people across three generations`)
  console.log(`Pets:     ${pets.map((pet) => pet.firstName).join(", ")}`)
  console.log(`Email:    ${EMAIL}`)
  console.log(`Password: ${PASSWORD}`)
  console.log("Use these credentials in APP, BMS, and Sequoia.")
}

main()
  .catch((error) => {
    console.error("Local seed failed:", error)
    process.exitCode = 1
  })
  .finally(async () => {
    await disconnect?.()
  })
