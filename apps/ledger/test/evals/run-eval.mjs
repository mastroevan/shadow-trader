// MCP tool-description eval for AuditService.
//
// Seeds a fresh ledger through LedgerService (as agent / evan), then asks a model
// each question with only the MCP tools (describe, query) the server advertises.
// An answer passes when it contains every expected fact. Writes the score, each
// answer and every tool call to results/<label>.json.
//
//   OPENAI_API_KEY=... node test/evals/run-eval.mjs --url http://localhost:4012 --label after
//
// Run against a fresh in-memory ledger (sample data + this seed), never against HANA.

import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

const args = Object.fromEntries(process.argv.slice(2).join(' ').split('--').filter(Boolean)
  .map(a => a.trim().split(/\s+/)).map(([k, ...v]) => [k, v.join(' ') || true]))
const BASE = args.url ?? 'http://localhost:4004'
const LABEL = args.label ?? 'run'
const MODEL = process.env.EVAL_MODEL ?? process.env.OPENAI_MODEL_FAST ?? 'gpt-5.4-mini'
const MAX_TOOL_ROUNDS = 8

const basic = user => 'Basic ' + Buffer.from(`${user}:`).toString('base64')

// --- Seed data --------------------------------------------------------------
// Added on top of test/data: BTC/USD approved, NVDA rejected, ETH/USD pending.

const SEED = [
  { ticker: 'TSLA', direction: 'short', confidence: 0.81, thesis: 'Rejection at prior resistance with fading volume.',
    risk: { maxLossUSD: 150, stopLoss: 395, notes: 'R:R 2.80; size 3' }, decision: ['approved', 'Clean rejection at resistance'] },
  { ticker: 'NVDA', direction: 'long', confidence: 0.78, thesis: 'Breakout above range high on rising volume.',
    risk: { maxLossUSD: 120, stopLoss: 228, notes: 'R:R 2.40; size 4' }, decision: ['approved', 'Volume confirms breakout'] },
  { ticker: 'AAPL', direction: 'long', confidence: 0.62, thesis: 'Bounce off the 50-day average.',
    risk: { maxLossUSD: 90, stopLoss: 221, notes: 'R:R 2.10; size 5' }, decision: ['rejected', 'Confidence below 0.75'] },
  { ticker: 'MSFT', direction: 'long', confidence: 0.70, thesis: 'Higher low forming after earnings gap.' },
  { ticker: 'AMD', direction: 'short', confidence: 0.74, thesis: 'Lower high under the 20-day average.',
    risk: { maxLossUSD: 200, stopLoss: 182, notes: 'R:R 2.20; size 2' } },
]

async function ledger(method, route, user, body) {
  const res = await fetch(`${BASE}/ledger${route}`, {
    method, headers: { Authorization: basic(user), 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  if (!res.ok) throw new Error(`${method} ${route} as ${user}: ${res.status} ${await res.text()}`)
  return res.json()
}

async function seed() {
  for (const s of SEED) {
    const { ID } = await ledger('POST', '/TradeTheses', 'agent',
      { ticker: s.ticker, direction: s.direction, confidence: s.confidence, thesis: s.thesis, model: 'gpt-5.4-mini' })
    if (s.risk) await ledger('POST', '/RiskAssessments', 'agent', { thesis_ID: ID, ...s.risk })
    if (s.decision) await ledger('POST', '/decide', 'evan', { thesis: ID, decision: s.decision[0], reason: s.decision[1] })
  }
}

// --- Questions --------------------------------------------------------------
// Expected facts follow from test/data plus SEED above.

const QUESTIONS = [
  { q: 'Which NVDA theses were approved this week, and what reason did the approver give?', expect: [/volume confirms breakout/i] },
  { q: 'What is the max loss in USD on the most recently rejected trade, and which ticker was it?', expect: [/\b90\b/, /AAPL/i] },
  { q: 'Are there any theses with no risk assessment? Name them.', expect: [/MSFT/i] },
  { q: 'How many theses have been proposed in total, and how many were approved?', expect: [/\b8\b/, /\b3\b/] },
  { q: 'What is the total combined max loss in USD for all approved long trades?', expect: [/\b220\b/] },
  { q: 'Who approved the TSLA short, and why?', expect: [/evan/i, /resistance/i] },
  { q: 'Which theses are still waiting for a decision?', expect: [/ETH/i, /MSFT/i, /AMD/i] },
  { q: 'Which thesis has the highest confidence score, and was it approved?', expect: [/BTC/i, /approved|yes/i] },
  { q: 'Who records the theses, and is that the same user who approves them?', expect: [/agent/i, /evan/i] },
  { q: 'List every rejected thesis with the reason it was rejected.', expect: [/risk\/reward/i, /confidence below/i] },
]

// --- MCP client ---------------------------------------------------------------

async function mcp(method, params) {
  const res = await fetch(`${BASE}/mcp/audit`, {
    method: 'POST',
    headers: { Authorization: basic('auditor'), 'Content-Type': 'application/json', Accept: 'application/json, text/event-stream' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  })
  const text = await res.text()
  const line = text.split('\n').find(l => l.startsWith('data: '))
  const msg = JSON.parse(line ? line.slice(6) : text)
  if (msg.error) throw new Error(`MCP ${method}: ${msg.error.message}`)
  return msg.result
}

const toOpenAiTool = t => {
  const { $schema, ...parameters } = t.inputSchema
  return { type: 'function', function: { name: t.name, description: t.description, parameters } }
}

// --- Model loop ---------------------------------------------------------------

async function chat(messages, tools) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, messages, tools }),
  })
  if (!res.ok) throw new Error(`OpenAI ${res.status}: ${await res.text()}`)
  return (await res.json()).choices[0].message
}

async function ask(question, tools, instructions) {
  const messages = [
    { role: 'system', content: `${instructions}\nToday is ${new Date().toISOString().slice(0, 10)}. Answer from the ledger data only, concisely.` },
    { role: 'user', content: question },
  ]
  const calls = []
  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const msg = await chat(messages, tools)
    messages.push(msg)
    if (!msg.tool_calls?.length) return { answer: msg.content ?? '', calls }
    for (const call of msg.tool_calls) {
      const input = JSON.parse(call.function.arguments || '{}')
      let output
      try {
        const result = await mcp('tools/call', { name: call.function.name, arguments: input })
        output = (result.content ?? []).map(c => c.text).join('\n')
      } catch (error) { output = `Error: ${error.message}` }
      calls.push({ tool: call.function.name, input, error: /error/i.test(output.slice(0, 80)) })
      messages.push({ role: 'tool', tool_call_id: call.id, content: output.slice(0, 8000) })
    }
  }
  return { answer: '(no answer within tool-round limit)', calls }
}

// --- Run ------------------------------------------------------------------------

if (!process.env.OPENAI_API_KEY) throw new Error('Set OPENAI_API_KEY')

await seed()
const init = await mcp('initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'eval', version: '1' } })
const { tools } = await mcp('tools/list')
const openAiTools = tools.map(toOpenAiTool)

const results = []
for (const [i, { q, expect }] of QUESTIONS.entries()) {
  const { answer, calls } = await ask(q, openAiTools, init.instructions ?? '')
  const missing = expect.filter(re => !re.test(answer)).map(String)
  results.push({ n: i + 1, question: q, pass: missing.length === 0, missing, answer, calls })
  console.log(`${missing.length ? 'FAIL' : 'pass'}  Q${i + 1}  ${q}${missing.length ? `  (missing ${missing.join(', ')})` : ''}`)
}

const score = results.filter(r => r.pass).length
console.log(`\n${LABEL}: ${score}/${results.length} (model ${MODEL})`)

const dir = path.join(path.dirname(new URL(import.meta.url).pathname), 'results')
await mkdir(dir, { recursive: true })
await writeFile(path.join(dir, `${LABEL}.json`), JSON.stringify({ label: LABEL, model: MODEL, score, total: results.length, ranAt: new Date().toISOString(), results }, null, 2))
