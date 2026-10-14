/** The standalone BRL offer sold directly in Sequoia. Catalog prices stay authoritative. */
export const GENCODE_PACKAGE_OFFER = {
  code: 'GENCODE_VIRTUAL_BRL',
  minimumQuantity: 20,
  discountFrom: 50,
  discountPercent: 10,
  discountCode: 'GENCODES10',
} as const

/** Use integer cents for both the storefront preview and the recorded checkout. */
export function quoteGenCodePackage(unitPrice: number, quantity: number) {
  const subtotalCents = Math.round(unitPrice * 100) * quantity
  const discountPercent = quantity >= GENCODE_PACKAGE_OFFER.discountFrom
    ? GENCODE_PACKAGE_OFFER.discountPercent
    : 0
  const discountCents = Math.round(subtotalCents * discountPercent / 100)

  return {
    subtotalAmount: subtotalCents / 100,
    discountPercent,
    discountAmount: discountCents / 100,
    totalAmount: (subtotalCents - discountCents) / 100,
    effectiveUnitPrice: (subtotalCents - discountCents) / 100 / quantity,
  }
}
