# Build log: Shadow Trader ledger (SAP CAP)

Problems hit while building the ledger, what caused them, and the fix.
Most of these were caught by a test or a check that disagreed with what I expected.

## Modelling and authorization

**1. Enum values weren't enforced.**
A test sending `direction: 'sideways'` got a 400, so it looked fine. Switching to `'flat'`
showed the 400 had come from the length limit (`String(5)`), not the enum: `'flat'` was
accepted. In CAP an enum is documentation only unless the type also has `@assert.range`.
Fix: `@assert.range` on `Direction` and `Decision`, plus a test for a bad `decision`.

**2. Writes to `Approvals` return 405, not the 403 I predicted.**
`Approvals` is `@readonly`, and CAP rejects writes to read-only entities with
405 Method Not Allowed before it checks roles. The test caught my wrong expectation.

**3. `mocked` auth lets in more than my three users.**
Listing the effective users showed CAP's built-in demo users (`alice`, `bob`, ...) and a
`*` wildcard that accepts any username. None had a ledger role, so `@restrict` still
blocked them, but the plan was "only agent, evan, auditor". Fix: auth kind `basic`, which
uses only the users I define.

**4. `createdBy` comes from the login, not the request.**
Checked rather than assumed: posting a thesis as `agent` with `"createdBy": "evan"` in
the body still stores `agent`. There is a test for it.

**5. Concurrent `decide` calls.**
The handler checks for an earlier decision before inserting, but two calls could both
pass that check. A unique constraint on `Approvals.thesis` stops the second insert, and
the handler turns that database error into the same 409.

**6. Second-layer append-only guard.**
No role is granted UPDATE or DELETE, and a `before(['UPDATE','DELETE'])` handler rejects
them anyway. To prove the test exercises the handler and not the role check, I disabled the
handler: the test failed, then passed again when restored.

## Tooling

**7. `cds add` rewrote config I had already fixed.**
`cds add xsuaa` and `cds add http` both duplicated every scope in `xs-security.json`,
added a redundant `[production]` auth block, and one run put CAP config in the repo-root
`package.json`. Fix: restored the files and kept role collections only in `mta.yaml`, whose
names include org and space. Role collection names must be unique across the subaccount,
so generic names like `Approver` could clash with another app.

**8. Sample data would have been deployed to HANA.**
`cds add data` puts CSVs in `db/data`, and everything there is deployed to the database.
For an audit ledger that means fake trades in production. Fix: moved them to `test/data`,
which CAP loads only in development and tests. Checked with `cds build --production`: no
data files in the output.

**9. Duplicate files from iCloud.**
`schema 2.cds` and `ledger-service 2.cds` appeared next to the originals. CDS loads every
file in `db/` and `srv/`, so they would have defined every entity twice. Deleted after
checking they were byte-for-byte identical.

**10. `tsc` hung at 0% CPU.**
The repo is under `~/Desktop`, which iCloud syncs. About 12,000 files in `node_modules`
had been offloaded, and reading them blocked. Typechecking a fresh copy outside iCloud
worked; the fix is keeping the folder downloaded or moving the repo.

## MCP

**11. `@path: '/mcp/audit'` doesn't make a service MCP.**
It only sets the URL. Without `@mcp`, CAP served a normal OData service at a path that
happened to contain "mcp". Found by asking CAP for the service's endpoints. Fix: `@mcp`.

**12. `autowire: "auditor"` silently logged in as `alice`.**
The MCP plugin reads `{ user, password }` from that setting. Given a string, it found no
user and fell back to `alice`, who doesn't exist under `basic` auth, so every call would
have been a 401. Fix: `{ "user": "auditor", "password": "" }`.

**13. Making the service MCP broke every Jest test.**
`@cap-js/mcp` depends on a package published only as an ES module. Plain Node 22 can
`require()` it, so `cds serve` worked, but Jest can't on Node 22. On Node 24.9+ it can,
with `--experimental-vm-modules`. Fix: the ledger runs on Node 24 (`.nvmrc`, `engines`,
CI), and `npm test` passes the flag.

**14. `cds.test` returns MCP replies as a stream.**
MCP answers as server-sent events, and `cds.test` hands those back as an unread
`ReadableStream`. The test helper reads it to text before parsing.

## CI

**15. The API tests had never run in CI.**
The workflow had been red on every run since August 16 (the commit "Revert broken test
script glob"), long before the ledger, and every ledger run added to it unnoticed because
the ledger job itself passed. The API job ran on Node 20, whose test runner doesn't expand
`src/**/*.test.ts`, so it failed with "Could not find" before running a single test.
Locally I was on Node 22, where the same command runs all 46 tests. Fix: Node 22 in CI.
Lesson: a green local run says nothing about CI; look at the actual Actions run.

## Deployment (Saturday)

<!-- Add the errors from your BTP / HANA / XSUAA deploy here. -->

**16. The deployed app was older than the MCP service.**
`cf apps` showed the ledger running and `/ledger` returned 401 without a token, as it
should, but `/mcp/audit` returned 404: the last upload predated AuditService.
