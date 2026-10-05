# Shadow Trader Ledger (SAP CAP)

An append-only record of trade theses, risk assessments, and human approvals.
No order executes until `isApproved(thesis)` returns `true`.

| What | Where |
| --- | --- |
| Three ledger tables | [db/schema.cds](db/schema.cds) |
| One CAP service | [srv/ledger-service.cds](srv/ledger-service.cds), [srv/ledger-service.js](srv/ledger-service.js) |
| Three roles (LedgerWriter, Approver, Auditor) | [xs-security.json](xs-security.json), `@restrict` in the service |
| Approval gate (ledger side) | `decide` / `isApproved` in [srv/ledger-service.js](srv/ledger-service.js) |
| Approval gate (Shadow Trader side) | [apps/api/src/services/ledgerGate.ts](../api/src/services/ledgerGate.ts), called from `openPaperTradeEntry` / `moveWatchlistEntry` |
| BTP Cloud Foundry + HANA Cloud + XSUAA | [mta.yaml](mta.yaml) |
| Read-only MCP access for agents (Auditor role) | [srv/audit-service.cds](srv/audit-service.cds), served at `/mcp/audit` by `@cap-js/mcp` |
| Tests | [test/approval-gate.test.js](test/approval-gate.test.js), [test/audit-service.test.js](test/audit-service.test.js), [ledgerGate.test.ts](../api/src/services/ledgerGate.test.ts) |
| Every endpoint as every user, expected status written first | [test/http/LedgerService.http](test/http/LedgerService.http) (same table as the Jest "access matrix") |
| Sample rows (dev and tests only, never deployed) | [test/data/](test/data) |
| CI | `ledger` job in [.github/workflows/ci.yml](../../.github/workflows/ci.yml) |

## Approval rules

- Only an `Approver` can call `decide`; nobody can write `Approvals` directly.
- An approver can't approve a thesis they recorded themselves (four-eyes rule).
- Each thesis gets exactly one decision (enforced by a unique constraint).
- A thesis needs at least one risk assessment before it can be approved.
- Nothing is updated or deleted. No role is granted UPDATE or DELETE, and a
  `before(['UPDATE','DELETE'])` handler rejects them anyway (405) as a second layer.
- `createdBy`/`createdAt` come from `managed`: CAP fills `createdBy` from the
  authenticated user and ignores any value sent in the request body, so who wrote
  a row comes from the login (the XSUAA token in production), never from the client.

## How Shadow Trader uses it

With `LEDGER_URL` set on the API, opening a paper trade for a watchlist entry
that passed the automated risk gate goes like this:

1. First attempt: the API records a `TradeThesis` and `RiskAssessment` as
   LedgerWriter, saves the thesis ID on the entry, and responds
   `409 AWAITING_LEDGER_APPROVAL` with `ledgerThesisId`.
2. A human with the Approver role calls `POST /ledger/decide`.
3. Next attempt: the API calls `isApproved` and opens the trade only if it is `true`.

If the ledger is unreachable or errors, the API responds `503 LEDGER_UNAVAILABLE`
and does not open the trade. If `LEDGER_URL` is unset, the gate is skipped.

## Run locally

Requires Node 24.9+ (`nvm use` picks it up from `.nvmrc`). The MCP plugin pulls in
ES-module-only packages, and Jest can only `require()` those on Node 24.9+ with
`--experimental-vm-modules`, which `npm test` passes for you.

```bash
nvm use
npm install
npm run watch   # http://localhost:4004, SQLite in memory, mocked users
npm test        # Jest
```

Mock users (empty password), defined only for the `development` and `hybrid` profiles; production uses XSUAA:

| User | Role | Can |
| --- | --- | --- |
| `agent` | LedgerWriter | record theses and risk assessments |
| `evan` | Approver | call `decide` |
| `auditor` | Auditor | read |

Auth kind is `basic`, so only these three users exist. `mocked` would also let in CAP's built-in demo users and any username.

Approve a thesis locally:

```bash
curl -u evan: -H 'Content-Type: application/json' \
  -d '{"thesis":"<ledgerThesisId>","decision":"approved","reason":"..."}' \
  http://localhost:4004/ledger/decide
```

## MCP access (AuditService)

`AuditService` exposes the three ledger tables read-only over MCP at
`http://localhost:4004/mcp/audit`, with two tools: `describe` (entities and field
descriptions) and `query` (CQL `SELECT`). Only the `Auditor` role can connect;
`agent` and `evan` get 403.

In development, `cds.mcp.autowire` registers the server in `~/.claude.json` (Claude Code)
while the ledger runs, logging in as `auditor`, and removes it again on shutdown.
Set `"autowire": false` in `package.json` to turn that off.

Tickers are stored in the app's format (`BTC/USD`, `ETH/USD`, `NVDA`); the field
descriptions and server instructions tell the agent so.

In production, whoever connects needs the `Auditor` scope from XSUAA. The Shadow Trader
API's service key only carries `LedgerWriter` (via `authorities`), so give an agent its
own login with the Auditor role collection rather than reusing that key.

## Deploy to BTP Cloud Foundry

In production (`--profile production`) the database is HANA Cloud and auth is XSUAA.

```bash
mbt build && cf deploy mta_archives/shadow-trader-ledger_1.0.0.mtar
```

This creates the HDI container, the XSUAA instance and three role collections
(assign them to users in the BTP cockpit). For the Shadow Trader API, create a
service key on the XSUAA instance (`cf create-service-key shadow-trader-ledger-auth api`);
its client gets the `LedgerWriter` scope through `authorities` in xs-security.json.
