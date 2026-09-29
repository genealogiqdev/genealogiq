import { describe, expect, it } from 'vitest'
import { identityTranslator } from './i18n'
import { getGenCodePackageOrderSchema } from './gencode-package.schema'

const schema = getGenCodePackageOrderSchema(identityTranslator)
const base = { packageId: 'pkg_1', tenantId: 'tenant_1' }

describe('getGenCodePackageOrderSchema', () => {
  it('accepts any positive whole quantity so the selected product can enforce its minimum', () => {
    expect(schema.safeParse({ ...base, quantity: 1 }).success).toBe(true)
    expect(schema.safeParse({ ...base, quantity: 19 }).success).toBe(true)
  })

  it('accepts 20 and any greater whole quantity', () => {
    expect(schema.safeParse({ ...base, quantity: 20 }).success).toBe(true)
    expect(schema.safeParse({ ...base, quantity: 21 }).success).toBe(true)
  })

  it('rejects fractional quantities', () => {
    expect(schema.safeParse({ ...base, quantity: 20.5 }).success).toBe(false)
  })

  it('rejects zero and negative quantities', () => {
    expect(schema.safeParse({ ...base, quantity: 0 }).success).toBe(false)
    expect(schema.safeParse({ ...base, quantity: -1 }).success).toBe(false)
  })
})

