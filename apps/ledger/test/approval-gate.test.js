const cds = require('@sap/cds')

const { GET, POST, PATCH, DELETE } = cds.test(__dirname + '/..')

const as = user => (user ? { auth: { username: user, password: '' } } : {})

// Returns the HTTP status of a request, whether it succeeded or failed.
const statusOf = promise => promise.then(r => r.status, e => e.response?.status ?? e.status ?? e.code)

const newThesis = (overrides = {}) => ({
  ticker: 'BTC/USD', direction: 'long', thesis: 'Breakout above range high', confidence: 0.7, model: 'gpt-test',
  ...overrides,
})

const recordThesis = async (overrides = {}) => {
  const { data } = await POST('/ledger/TradeTheses', newThesis(overrides), as('agent'))
  return data.ID
}

const recordRisk = thesisId => POST('/ledger/RiskAssessments', {
  thesis_ID: thesisId, riskScore: 40, maxLossUSD: 250, stopLoss: 61000,
}, as('agent'))

const decide = (thesis, decision, user = 'evan') =>
  POST('/ledger/decide', { thesis, decision, reason: 'test' }, as(user))

const isApproved = async thesis => {
  const { data } = await GET(`/ledger/isApproved(thesis=${thesis})`, as('agent'))
  return data.value
}

const USERS = ['agent', 'evan', 'auditor']

describe('checklist', () => {
  test('1. agent creates a thesis; createdBy comes back as agent', async () => {
    const { status, data } = await POST('/ledger/TradeTheses', newThesis(), as('agent'))
    expect(status).toBe(201)
    expect(data.createdBy).toBe('agent')
  })

  test('2. auditor cannot create (403)', async () => {
    expect(await statusOf(POST('/ledger/TradeTheses', newThesis(), as('auditor')))).toBe(403)
  })

  test('3. nobody can PATCH or DELETE a thesis', async () => {
    const id = await recordThesis()
    for (const user of USERS) {
      expect(await statusOf(PATCH(`/ledger/TradeTheses(${id})`, { ticker: 'X' }, as(user)))).toBe(403)
      expect(await statusOf(DELETE(`/ledger/TradeTheses(${id})`, as(user)))).toBe(403)
    }
    const { data } = await GET(`/ledger/TradeTheses(${id})`, as('auditor'))
    expect(data.ticker).toBe('BTC/USD')
  })

  // The agent records theses but cannot approve them, its own or anyone else's.
  test('4. agent cannot call decide (403)', async () => {
    const id = await recordThesis()
    await recordRisk(id)
    expect(await statusOf(decide(id, 'approved', 'agent'))).toBe(403)
    expect(await isApproved(id)).toBe(false)
  })

  test('5. evan approves; a second decide on the same thesis returns 409', async () => {
    const id = await recordThesis()
    await recordRisk(id)
    expect(await statusOf(decide(id, 'approved'))).toBe(200)
    expect(await statusOf(decide(id, 'approved'))).toBe(409)
    expect(await statusOf(decide(id, 'rejected'))).toBe(409)
  })

  test('6. isApproved is false before the decision and true after', async () => {
    const id = await recordThesis()
    await recordRisk(id)
    expect(await isApproved(id)).toBe(false)
    await decide(id, 'approved')
    expect(await isApproved(id)).toBe(true)
  })
})

describe('audit trail', () => {
  test('createdBy comes from the authenticated user, never the request body', async () => {
    const { data } = await POST('/ledger/TradeTheses', newThesis({ createdBy: 'evan', modifiedBy: 'evan' }), as('agent'))
    expect(data.createdBy).toBe('agent')
    expect(data.modifiedBy).toBe('agent')

    const risk = await POST('/ledger/RiskAssessments', { thesis_ID: data.ID, riskScore: 10, createdBy: 'evan' }, as('agent'))
    expect(risk.data.createdBy).toBe('agent')
  })

  test('the approval records the approver as createdBy', async () => {
    const id = await recordThesis()
    await recordRisk(id)
    const { data } = await decide(id, 'approved')
    expect(data.createdBy).toBe('evan')
  })
})

describe('decide rules', () => {
  test('thesis must exist (404)', async () => {
    expect(await statusOf(decide(cds.utils.uuid(), 'rejected'))).toBe(404)
  })

  test('cannot approve without a risk assessment (422)', async () => {
    const id = await recordThesis()
    expect(await statusOf(decide(id, 'approved'))).toBe(422)
    expect(await isApproved(id)).toBe(false)
  })

  test('a rejected thesis is not approved', async () => {
    const id = await recordThesis()
    await decide(id, 'rejected')
    expect(await isApproved(id)).toBe(false)
  })

  test('decision must be approved or rejected (400)', async () => {
    const id = await recordThesis()
    await recordRisk(id)
    expect(await statusOf(decide(id, 'maybe'))).toBe(400)
  })

  test('the thesis author cannot approve it, even with both roles (403)', async () => {
    const srv = await cds.connect.to('LedgerService')
    const pat = new cds.User({ id: 'pat', roles: ['LedgerWriter', 'Approver'] })
    const { TradeTheses, RiskAssessments } = srv.entities

    const attempt = srv.tx({ user: pat }, async tx => {
      const ID = cds.utils.uuid()
      await tx.create(TradeTheses).entries(newThesis({ ID }))
      await tx.create(RiskAssessments).entries({ thesis_ID: ID, riskScore: 10 })
      return tx.send('decide', { thesis: ID, decision: 'approved', reason: 'mine' })
    })
    await expect(attempt).rejects.toMatchObject({ code: 403 })
  })
})

describe('append-only, second layer', () => {
  // A privileged user skips @restrict entirely, so only the before() handler
  // stands between it and an UPDATE or DELETE.
  test('UPDATE and DELETE are rejected even for a privileged caller (405)', async () => {
    const srv = await cds.connect.to('LedgerService')
    const { TradeTheses, Approvals } = srv.entities
    const { UPDATE, DELETE } = cds.ql // cds.test's DELETE above is the HTTP verb
    const id = await recordThesis()
    const privileged = { user: new cds.User.Privileged() }

    await expect(srv.tx(privileged, tx => tx.run(UPDATE(TradeTheses, id).with({ ticker: 'X' }))))
      .rejects.toMatchObject({ code: 405 })
    await expect(srv.tx(privileged, tx => tx.run(DELETE.from(TradeTheses, id))))
      .rejects.toMatchObject({ code: 405 })
    await expect(srv.tx(privileged, tx => tx.run(DELETE.from(Approvals))))
      .rejects.toMatchObject({ code: 405 })
  })
})

describe('schema constraints', () => {
  test('confidence must be within [0, 1]', async () => {
    expect(await statusOf(recordThesis({ confidence: 1.5 }))).toBe(400)
  })

  test('direction must be long or short', async () => {
    expect(await statusOf(recordThesis({ direction: 'flat' }))).toBe(400)
  })
})

// Every endpoint as every user. Expectations are written down first; the same
// matrix is in test/http/LedgerService.http for trying it by hand.
describe('access matrix', () => {
  const PENDING = '33333333-3333-4333-8333-333333333333' // sample thesis with no decision

  const endpoints = {
    'GET TradeTheses':      { agent: 200, evan: 200, auditor: 200, send: u => GET('/ledger/TradeTheses', as(u)) },
    'POST TradeTheses':     { agent: 201, evan: 403, auditor: 403, send: u => POST('/ledger/TradeTheses', newThesis(), as(u)) },
    'GET RiskAssessments':  { agent: 200, evan: 200, auditor: 200, send: u => GET('/ledger/RiskAssessments', as(u)) },
    'POST RiskAssessments': { agent: 201, evan: 403, auditor: 403, send: u => POST('/ledger/RiskAssessments', { thesis_ID: PENDING, riskScore: 5 }, as(u)) },
    'GET Approvals':        { agent: 200, evan: 200, auditor: 200, send: u => GET('/ledger/Approvals', as(u)) },
    // @readonly rejects writes with 405 Method Not Allowed before roles are checked.
    'POST Approvals':       { agent: 405, evan: 405, auditor: 405, send: u => POST('/ledger/Approvals', { thesis_ID: PENDING, decision: 'approved', reason: 'x' }, as(u)) },
    'POST decide':          { agent: 403, evan: 200, auditor: 403, send: async u => {
      const id = await recordThesis()
      await recordRisk(id)
      return POST('/ledger/decide', { thesis: id, decision: 'approved', reason: 'matrix' }, as(u))
    } },
    'GET isApproved':       { agent: 200, evan: 200, auditor: 200, send: u => GET(`/ledger/isApproved(thesis=${PENDING})`, as(u)) },
    'PATCH TradeTheses':    { agent: 403, evan: 403, auditor: 403, send: u => PATCH(`/ledger/TradeTheses(${PENDING})`, { ticker: 'X' }, as(u)) },
    'DELETE TradeTheses':   { agent: 403, evan: 403, auditor: 403, send: u => DELETE(`/ledger/TradeTheses(${PENDING})`, as(u)) },
  }

  for (const [name, expected] of Object.entries(endpoints)) {
    for (const user of USERS) {
      test(`${name} as ${user} -> ${expected[user]}`, async () => {
        expect(await statusOf(expected.send(user))).toBe(expected[user])
      })
    }
    test(`${name} without login -> 401`, async () => {
      expect(await statusOf(expected.send(undefined))).toBe(401)
    })
  }

  test('sample data is loaded', async () => {
    const { data } = await GET('/ledger/TradeTheses', as('auditor'))
    expect(data.value.map(t => t.ticker)).toEqual(expect.arrayContaining(['BTC/USD', 'NVDA', 'ETH/USD']))
    expect(await isApproved('11111111-1111-4111-8111-111111111111')).toBe(true)
    expect(await isApproved('22222222-2222-4222-8222-222222222222')).toBe(false)
  })
})
