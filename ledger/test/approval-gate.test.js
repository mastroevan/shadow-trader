const cds = require('@sap/cds')

const { GET, POST, PATCH, DELETE } = cds.test(__dirname + '/..')

const as = user => ({ auth: { username: user, password: '' } })

// Returns the HTTP status of a request, whether it succeeded or failed.
const statusOf = promise => promise.then(r => r.status, e => e.response?.status ?? e.status ?? e.code)

const recordThesis = async (overrides = {}) => {
  const { data } = await POST('/ledger/TradeTheses', {
    ticker: 'BTC-USD', direction: 'long', thesis: 'Breakout above range high', confidence: 0.7, model: 'gpt-test',
    ...overrides,
  }, as('writer'))
  return data.ID
}

const recordRisk = thesisId => POST('/ledger/RiskAssessments', {
  thesis_ID: thesisId, riskScore: 40, maxLossUSD: 250, stopLoss: 61000,
}, as('writer'))

const decide = (thesis, decision, user = 'approver') =>
  POST('/ledger/decide', { thesis, decision, reason: 'test' }, as(user))

const isApproved = async thesis => {
  const { data } = await GET(`/ledger/isApproved(thesis=${thesis})`, as('writer'))
  return data.value
}

describe('approval gate', () => {
  test('a new thesis is not approved', async () => {
    const id = await recordThesis()
    expect(await isApproved(id)).toBe(false)
  })

  test('approver can approve once a risk assessment exists', async () => {
    const id = await recordThesis()
    await recordRisk(id)
    await decide(id, 'approved')
    expect(await isApproved(id)).toBe(true)
  })

  test('cannot approve without a risk assessment', async () => {
    const id = await recordThesis()
    expect(await statusOf(decide(id, 'approved'))).toBe(422)
    expect(await isApproved(id)).toBe(false)
  })

  test('a rejected thesis is not approved', async () => {
    const id = await recordThesis()
    await decide(id, 'rejected')
    expect(await isApproved(id)).toBe(false)
  })

  test('a thesis can only be decided once', async () => {
    const id = await recordThesis()
    await recordRisk(id)
    await decide(id, 'rejected')
    expect(await statusOf(decide(id, 'approved'))).toBe(409)
    expect(await isApproved(id)).toBe(false)
  })
})

describe('roles', () => {
  test('LedgerWriter cannot decide', async () => {
    const id = await recordThesis()
    await recordRisk(id)
    expect(await statusOf(decide(id, 'approved', 'writer'))).toBe(403)
  })

  test('Auditor cannot write theses', async () => {
    const res = POST('/ledger/TradeTheses', { ticker: 'AAPL', direction: 'long', thesis: 'x' }, as('auditor'))
    expect(await statusOf(res)).toBe(403)
  })

  test('nobody can create Approvals directly', async () => {
    const id = await recordThesis()
    const res = POST('/ledger/Approvals', { thesis_ID: id, decision: 'approved', reason: 'x' }, as('approver'))
    expect([403, 405]).toContain(await statusOf(res))
  })

  test('ledger rows cannot be updated or deleted', async () => {
    const id = await recordThesis()
    expect([403, 405]).toContain(await statusOf(PATCH(`/ledger/TradeTheses(${id})`, { ticker: 'X' }, as('writer'))))
    expect([403, 405]).toContain(await statusOf(DELETE(`/ledger/TradeTheses(${id})`, as('writer'))))
  })

  test('thesis author cannot approve their own thesis', async () => {
    const { data } = await POST('/ledger/TradeTheses', { ticker: 'ETH-USD', direction: 'short', thesis: 'x' }, as('solo'))
    await POST('/ledger/RiskAssessments', { thesis_ID: data.ID, riskScore: 10 }, as('solo'))
    expect(await statusOf(decide(data.ID, 'approved', 'solo'))).toBe(403)
  })

  test('unauthenticated requests are rejected', async () => {
    expect(await statusOf(GET('/ledger/TradeTheses'))).toBe(401)
  })
})

describe('schema constraints', () => {
  test('confidence must be within [0, 1]', async () => {
    expect(await statusOf(recordThesis({ confidence: 1.5 }))).toBe(400)
  })

  test('direction must be long or short', async () => {
    expect(await statusOf(recordThesis({ direction: 'flat' }))).toBe(400)
  })

  test('decision must be approved or rejected', async () => {
    const id = await recordThesis()
    await recordRisk(id)
    expect(await statusOf(decide(id, 'maybe'))).toBe(400)
    expect(await isApproved(id)).toBe(false)
  })
})
