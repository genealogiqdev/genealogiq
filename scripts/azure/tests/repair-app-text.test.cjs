const { describe, it } = require('node:test')
const assert = require('node:assert/strict')
const { matchesLostUtf8, validatePlan, readPlan, repairText } = require('../repair-app-text.cjs')

const first = {
  table: 'app_documents', column: 'title', id: 'document-a',
  before: 'CNH - carteira de habilita????o', after: 'CNH - carteira de habilitação',
}
const second = {
  table: 'app_documents', column: 'title', id: 'document-b',
  before: 'Cart??o INSS', after: 'Cartão INSS',
}
const plan = { version: 1, repairs: [first, second] }

describe('reviewed UTF-8 restoration', () => {
  it('recognizes the reported document titles and preserves existing accents', () => {
    assert.equal(matchesLostUtf8('CNH - carteira de habilita????o', 'CNH - carteira de habilitação'), true)
    assert.equal(matchesLostUtf8('Cart??o INSS', 'Cartão INSS'), true)
    assert.equal(matchesLostUtf8('Certidão de S??o José?', 'Certidão de São José?'), true)
  })

  it('never guesses from damaged text or changes intact characters', () => {
    assert.equal(matchesLostUtf8('Cart??o INSS', 'Cartão SUS'), false)
    assert.equal(matchesLostUtf8('Certidão', 'Certidao'), false)
    assert.equal(matchesLostUtf8('José e Jo??o', 'Josê e João'), false)
    assert.equal(matchesLostUtf8('Tudo bem??', 'Tudo bem?'), false)
    assert.equal(matchesLostUtf8('Cart?o', 'Cartão'), false)
    assert.equal(matchesLostUtf8('João', 'João'), false)
  })

  it('keeps punctuation and supports reviewed four-byte Unicode characters', () => {
    assert.equal(matchesLostUtf8('Memória ???? — certo?', 'Memória 🌳 — certo?'), true)
    assert.equal(matchesLostUtf8('Memória ????', 'Memória 🌳!'), false)
  })

  it('strictly reads an accented UTF-8 manifest and rejects malformed bytes', () => {
    assert.deepEqual(readPlan(Buffer.from(JSON.stringify(plan), 'utf8')), plan)
    assert.throws(() => readPlan(Buffer.from([0xc3, 0x28])), /valid UTF-8 JSON/)
    assert.throws(() => readPlan(Buffer.from('{"private content":')), /valid UTF-8 JSON/)
  })

  it('rejects unreviewed targets, duplicate fields and invalid replacements', () => {
    for (const change of [
      { table: 'users' },
      { table: '__proto__' },
      { column: 'password' },
      { column: 'file_url' },
      { column: 'title"; DELETE FROM app_users; --' },
      { id: '' },
      { before: 'Already correct', after: 'Another title' },
      { before: 'Lost ???', after: 'Lost \uFFFD' },
      { before: 'Lost ???', after: 'Lost \uD800' },
    ]) {
      assert.throws(() => validatePlan({ version: 1, repairs: [{ ...first, ...change }] }))
    }
    assert.throws(() => validatePlan({ version: 1, repairs: [first, first] }), /duplicate target/)
    assert.throws(() => validatePlan({ version: 1, repairs: [] }), /nonempty/)
  })
})

function databaseFixture(values) {
  const valuesById = new Map(Object.entries(values))
  const calls = []
  let snapshot
  return {
    calls,
    valuesById,
    async query(sql, params) {
      calls.push({ sql, params })
      if (sql.startsWith('BEGIN')) snapshot = new Map(valuesById)
      if (sql === 'ROLLBACK') {
        valuesById.clear()
        for (const entry of snapshot) valuesById.set(...entry)
      }
      if (sql.startsWith('SELECT')) {
        return valuesById.has(params[0])
          ? { rowCount: 1, rows: [{ value: valuesById.get(params[0]) }] }
          : { rowCount: 0, rows: [] }
      }
      if (sql.startsWith('UPDATE')) {
        const [replacement, id, expected] = params
        assert.equal(valuesById.get(id), expected)
        valuesById.set(id, replacement)
        return { rowCount: 1, rows: [{ value: replacement }] }
      }
      return { rowCount: 0, rows: [] }
    },
  }
}

describe('repair transaction', () => {
  it('previews without writing any text', async () => {
    const db = databaseFixture({ 'document-a': 'CNH - carteira de habilita????o', 'document-b': 'Cart??o INSS' })
    const result = await repairText(db, plan)
    assert.equal(result.action, 'read-only-text-preview')
    assert.deepEqual(result.results.map((row) => row.status), ['pending', 'pending'])
    assert.equal(db.valuesById.get('document-b'), 'Cart??o INSS')
    assert.equal(db.calls.some(({ sql }) => sql.startsWith('UPDATE')), false)
    assert.equal(db.calls[0].sql, 'BEGIN ISOLATION LEVEL SERIALIZABLE READ ONLY')
  })

  it('applies exact Unicode values and leaves an unrelated row unchanged', async () => {
    const db = databaseFixture({ 'document-a': 'CNH - carteira de habilita????o', 'document-b': 'Cart??o INSS', other: 'Pergunta legítima??' })
    const result = await repairText(db, plan, { apply: true })
    assert.equal(result.action, 'applied-text-repair')
    assert.equal(db.valuesById.get('document-a'), 'CNH - carteira de habilitação')
    assert.equal(db.valuesById.get('document-b'), 'Cartão INSS')
    assert.equal(db.valuesById.get('other'), 'Pergunta legítima??')
    assert.equal(db.calls.at(-1).sql, 'COMMIT')
  })

  it('is idempotent when all values are already corrected', async () => {
    const db = databaseFixture({ 'document-a': 'CNH - carteira de habilitação', 'document-b': 'Cartão INSS' })
    const result = await repairText(db, plan, { apply: true })
    assert.deepEqual(result.results.map((row) => row.status), ['already-correct', 'already-correct'])
    assert.equal(db.calls.some(({ sql }) => sql.startsWith('UPDATE')), false)
  })

  it('rolls back the entire batch if a later row was edited after review', async () => {
    const db = databaseFixture({ 'document-a': 'CNH - carteira de habilita????o', 'document-b': 'Cartão novo' })
    await assert.rejects(repairText(db, plan, { apply: true }), /changed since review/)
    assert.equal(db.valuesById.get('document-a'), 'CNH - carteira de habilita????o')
    assert.equal(db.valuesById.get('document-b'), 'Cartão novo')
    assert.equal(db.calls.at(-1).sql, 'ROLLBACK')
    assert.equal(db.calls.some(({ sql }) => sql === 'COMMIT'), false)
  })

  it('refuses a missing row and never recreates it', async () => {
    const db = databaseFixture({ 'document-a': 'CNH - carteira de habilita????o' })
    await assert.rejects(repairText(db, plan, { apply: true }), /Missing repair target/)
    assert.equal(db.valuesById.get('document-a'), 'CNH - carteira de habilita????o')
    assert.equal(db.valuesById.has('document-b'), false)
  })

  it('can undo its own repair, but refuses to overwrite a subsequent edit', async () => {
    const db = databaseFixture({ 'document-a': 'CNH - carteira de habilita????o', 'document-b': 'Cart??o INSS' })
    const receipt = await repairText(db, plan, { apply: true })
    await repairText(db, plan, { apply: true, rollback: true, receipt })
    assert.equal(db.valuesById.get('document-a'), 'CNH - carteira de habilita????o')
    assert.equal(db.valuesById.get('document-b'), 'Cart??o INSS')
    db.valuesById.set('document-b', 'Título editado pelo usuário')
    await assert.rejects(repairText(db, plan, { apply: true, rollback: true, receipt }), /changed since review/)
    assert.equal(db.valuesById.get('document-b'), 'Título editado pelo usuário')
  })

  it('rolls back only values changed by that application, preserving prior corrections', async () => {
    const db = databaseFixture({ 'document-a': 'CNH - carteira de habilitação', 'document-b': 'Cart??o INSS' })
    const receipt = await repairText(db, plan, { apply: true })
    await repairText(db, plan, { apply: true, rollback: true, receipt })
    assert.equal(db.valuesById.get('document-a'), 'CNH - carteira de habilitação')
    assert.equal(db.valuesById.get('document-b'), 'Cart??o INSS')
    await assert.rejects(repairText(db, plan, { rollback: true }), /apply receipt/)
    await assert.rejects(repairText(db, plan, { rollback: true, receipt: { ...receipt, planSha256: 'another-plan' } }), /exact manifest/)
  })
})
