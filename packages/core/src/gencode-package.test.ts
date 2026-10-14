import { describe, expect, it } from 'vitest'
import { quoteGenCodePackage } from './gencode-package'

describe('GenCode package volume pricing', () => {
  it.each([
    [20, 3000, 0, 3000, 150],
    [49, 7350, 0, 7350, 150],
    [50, 7500, 750, 6750, 135],
    [51, 7650, 765, 6885, 135],
    [100, 15000, 1500, 13500, 135],
  ])('%i units have the agreed subtotal, discount and final price', (quantity, subtotalAmount, discountAmount, totalAmount, effectiveUnitPrice) => {
    expect(quoteGenCodePackage(150, quantity)).toMatchObject({
      subtotalAmount, discountAmount, totalAmount, effectiveUnitPrice,
    })
  })

  it('uses the current catalog price and rounds the discount in cents', () => {
    expect(quoteGenCodePackage(150.01, 51)).toMatchObject({
      subtotalAmount: 7650.51, discountAmount: 765.05, totalAmount: 6885.46, discountPercent: 10,
    })
  })
})
