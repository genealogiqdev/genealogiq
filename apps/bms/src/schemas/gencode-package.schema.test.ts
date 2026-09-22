import { describe, expect, it } from 'vitest'
import { identityTranslator } from './i18n'
import { getGenCodePackageOrderSchema } from './gencode-package.schema'

const schema = getGenCodePackageOrderSchema(identityTranslator)
const base = { packageId: 'pkg_1', tenantId: 'tenant_1' }

describe('getGenCodePackageOrderSchema', () => {
  it('rejects quantities below 20', () => {
    expect(schema.safeParse({ ...base, quantity: 19 }).success).toBe(false)
  })

  it('accepts 20 and any greater whole quantity', () => {
    expect(schema.safeParse({ ...base, quantity: 20 }).success).toBe(true)
    expect(schema.safeParse({ ...base, quantity: 21 }).success).toBe(true)
  })

  it('rejects fractional quantities', () => {
    expect(schema.safeParse({ ...base, quantity: 20.5 }).success).toBe(false)
  })
})

