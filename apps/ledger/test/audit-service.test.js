const cds = require('@sap/cds')

const { POST } = cds.test(__dirname + '/..')

// MCP over HTTP: JSON-RPC requests. The reply is JSON or a server-sent event.
const mcp = (method, params, user) => POST('/mcp/audit',
  { jsonrpc: '2.0', id: 1, method, params },
  {
    ...(user ? { auth: { username: user, password: '' } } : {}),
    headers: { Accept: 'application/json, text/event-stream' },
  })

// cds.test hands back an event-stream body as an unread ReadableStream.
const result = async ({ data }) => {
  if (data?.getReader) data = await new Response(data).text()
  if (typeof data === 'object') return data.result
  const line = data.split('\n').find(l => l.startsWith('data: '))
  return JSON.parse(line.slice('data: '.length)).result
}

const statusOf = promise => promise.then(r => r.status, e => e.response?.status ?? e.status ?? e.code)

const initialize = user => mcp('initialize', {
  protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'jest', version: '1' },
}, user)

const query = async cql => (await result(await mcp('tools/call', { name: 'query', arguments: { cql } }, 'auditor'))).structuredContent.data

describe('AuditService over MCP', () => {
  test('is served as MCP at /mcp/audit', () => {
    const srv = cds.services.AuditService
    expect(srv.endpoints).toEqual([{ kind: 'mcp', path: '/mcp/audit' }])
  })

  test('auditor can connect; the server sends the ledger instructions', async () => {
    const res = await initialize('auditor')
    expect(res.status).toBe(200)
    expect((await result(res)).instructions).toMatch(/append-only audit ledger/)
  })

  test.each([['agent', 403], ['evan', 403], [undefined, 401]])('%s cannot connect (%i)', async (user, status) => {
    expect(await statusOf(initialize(user))).toBe(status)
  })

  test('only read tools are offered', async () => {
    const { tools } = await result(await mcp('tools/list', undefined, 'auditor'))
    expect(tools.map(t => t.name).sort()).toEqual(['describe', 'query'])
    for (const tool of tools) expect(tool.annotations.readOnlyHint).toBe(true)
  })

  test('describe carries the field descriptions and hides modifiedAt/modifiedBy', async () => {
    const { content } = await result(await mcp('tools/call', { name: 'describe', arguments: { entities: ['Approvals'] } }, 'auditor'))
    const text = content[0].text
    expect(text).toMatch(/The human approver who made the decision/)
    expect(text).not.toMatch(/modifiedAt|modifiedBy/)
  })

  test('query answers "which theses are approved, pending or rejected?"', async () => {
    const rows = await query('SELECT from TradeTheses { ticker, createdBy, review.decision as decision, review.createdBy as approver }')
    expect(rows).toEqual(expect.arrayContaining([
      { ticker: 'BTC/USD', createdBy: 'agent', decision: 'approved', approver: 'evan' },
      { ticker: 'NVDA', createdBy: 'agent', decision: 'rejected', approver: 'evan' },
      { ticker: 'ETH/USD', createdBy: 'agent', decision: null, approver: null },
    ]))
  })

  test('entities are read-only even for a privileged caller (405)', async () => {
    const srv = cds.services.AuditService
    const write = srv.tx({ user: new cds.User.Privileged() }, tx =>
      tx.create(srv.entities.TradeTheses).entries({ ticker: 'X', direction: 'long', thesis: 'x' }))
    await expect(write).rejects.toMatchObject({ code: 405 })
  })
})
