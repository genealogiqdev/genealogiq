import { describe, it, expect } from "vitest"
import { identityTranslator } from "@genealogiq/core"
import { getDocumentSchema } from "./document.schema"

const schema = getDocumentSchema(identityTranslator)

const base = {
  title: "Birth certificate",
  description: "Issued by the civil registry.",
  category: "birth_certificate",
  fileUrl: "https://qa.public.blob.vercel-storage.com/doc.pdf",
  fileName: "birth-certificate.pdf",
  isPublic: true,
}

describe("getDocumentSchema", () => {
  it("accepts a valid document", () => {
    expect(schema.safeParse(base).success).toBe(true)
  })

  it("preserves accents in the title, description and original file name", () => {
    const result = schema.parse({
      ...base,
      title: "  CNH - carteira de habilitação  ",
      description: "  Certidão, cartão, avó, avô e informações de São José.  ",
      fileName: "  cartão-ação.pdf  ",
    })
    expect(result.title).toBe("CNH - carteira de habilitação")
    expect(result.description).toBe("Certidão, cartão, avó, avô e informações de São José.")
    expect(result.fileName).toBe("cartão-ação.pdf")
  })

  it("preserves intentional question marks instead of guessing missing characters", () => {
    expect(schema.parse({ ...base, title: "Qual certidão? Original??" }).title)
      .toBe("Qual certidão? Original??")
  })

  it("requires a title", () => {
    expect(schema.safeParse({ ...base, title: "" }).success).toBe(false)
  })

  it("rejects a title over 120 characters", () => {
    expect(schema.safeParse({ ...base, title: "a".repeat(121) }).success).toBe(false)
  })

  it("rejects an unknown category key", () => {
    expect(schema.safeParse({ ...base, category: "not_a_real_category" }).success).toBe(false)
  })

  it("rejects a non-blob file URL", () => {
    expect(schema.safeParse({ ...base, fileUrl: "https://evil.example.com/x.pdf" }).success).toBe(false)
  })

  it("accepts a valid Vercel Blob file URL", () => {
    const r = schema.safeParse({
      ...base,
      fileUrl: "https://qa.public.blob.vercel-storage.com/a.pdf",
    })
    expect(r.success).toBe(true)
  })

  it("accepts without description or fileName (both optional)", () => {
    const { title, category, fileUrl, isPublic } = base
    expect(schema.safeParse({ title, category, fileUrl, isPublic }).success).toBe(true)
  })

  it("rejects a description over 2000 characters", () => {
    expect(schema.safeParse({ ...base, description: "a".repeat(2001) }).success).toBe(false)
  })

  it("requires isPublic to be a boolean", () => {
    const { title, description, category, fileUrl, fileName } = base
    expect(schema.safeParse({ title, description, category, fileUrl, fileName }).success).toBe(false)
  })
})
