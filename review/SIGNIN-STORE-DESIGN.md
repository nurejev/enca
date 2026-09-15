# Faster report-only results, and a place to keep them

Design note for ENCA — 2026-09-15, written against beta 25374. Covers 🎚 Report-only impact (T26) first, because that is where the pain is, but the store it proposes is the one every sign-in tool (🚦 T17, 🕵 T36, 🌊 T37, 🛂 T38) would read from.

## 1. What the screenshot actually says

`Waiting for Microsoft's first response · 15m 10s · wo 09 sep 13:54–14:17 · query 84 running · 45 slices halved · incl. non-interactive`

Fifteen minutes in, 84 queries have run and the read is still inside the **first day** of a 7-day window, on a 23-minute slice. Two things in `readSignInsHunting` (js/app.js ~12944) explain that:

**Every day starts over at 24 hours.** `readSlice` halves a slice on "result size exceeded" or on `rows.length >= cap` (20,000) and recurses into both halves. When a tenant's non-interactive traffic needs 22-minute slices, a day costs 64 successful queries and *63 failed ones* on the way down (1 + 2 + 4 + 8 + 16 + 32). Half of the queries the tenant pays CPU quota for return nothing. "45 slices halved" at query 84 is exactly that ratio. Tomorrow's day begins at 24 hours again and repeats the descent.

**The slim query still moves rows, not answers.** Beta 25328 stripped the ~130 not-applied policy entries per row, which made rows 10–20× smaller, but T26 still asks Microsoft for every sign-in row and aggregates in the browser. On a tenant with a few hundred thousand non-interactive sign-ins a day, that is hundreds of queries however slim the rows are. ReportImpact.build (js/reportimpact.js 155) never reads the rows as rows: it counts (policy × verdict × user × app), remembers first/last, collects controls, and keeps three samples per user for the deny explanation. All of that is a `summarize`.

Two smaller things: the top line says "Waiting for Microsoft's first response" because `prog.tick` only fires after a whole day completes (`st.step` stays 0), while the detail line under it is already on query 84 — cosmetic, but it reads as a hang. And the reader runs two workers where the documented floor is 45 calls/minute per tenant; the real ceiling is the per-tenant CPU allocation per 15-minute cycle, which the failed halving queries are spending.

Microsoft's limits, for reference (Graph `runHuntingQuery`, MS Learn): 30 days of data, 100,000 rows and 50 MB per result, at least 45 calls/minute per tenant, a CPU allocation per tenant refreshed every 15 minutes (429 when exhausted), and a 3-minute timeout per request.

## 2. Three layers, in the order they pay back

The question bundles three different problems. Keeping them apart matters, because the first one costs a day and removes most of the waiting, and the third one is a different product.

| Layer | What it fixes | Where it runs | Effort |
|---|---|---|---|
| A. Read smarter | The 15-minute first day. 7 days in a handful of queries instead of ~900. | Browser, today's architecture | Small (A1) to medium (A2) |
| B. Keep what was read | The 1h / 4h / 24h / week cadence: each later look reads only what is new. Shared by every sign-in tool. | Browser, IndexedDB, opt-in per tenant | Medium |
| C. Collect ahead of time | Data is already there when the tool opens; retention longer than Microsoft's 30 days. | Self-hosted only: a collector sidecar + SQLite | Large, and a new security model |

Recommendation: do A1 now, A2 next, B as the roadmap item, and design C only when a single-tenant self-hoster asks for it. The hosted site never needs C.

## 3. Layer A — read smarter

### A1. Remember the slice length that worked (one beta, no new surface)

Keep a per-day *stride*: when a slice succeeds, the next day starts at that slice length instead of 24 hours; when a slice fails, halve as today. Persist the stride per tenant and source in `localStorage` (`enca-huntstride:<tenant>:<source>`) so the next session starts where this one ended. On the Perfetti-shaped tenant this removes ~63 of every ~127 queries per day. Also raise the workers from two to four — the 45/minute floor is nowhere near, and the CPU allocation is what it is whether the queries run serially or not — and fix the top line to show `query N` until the first day lands.

Nothing downstream changes; RunLedger, the Stop button and `onPartial` behave exactly as they do.

### A2. Ask for the answer, not the rows (T26 2.0)

Report-only impact is the one tool whose output is purely an aggregate, so it should read one. The shape ReportImpact.build needs, grouped in KQL:

```kql
EntraIdSignInEvents
| where Timestamp between (datetime({from}) .. datetime({to}))
| extend _P = todynamic(ConditionalAccessPolicies)
| mv-expand _X = _P
| extend PolicyId = tostring(_X.id), PolicyName = tostring(_X.displayName), Result = tostring(_X.result)
| where Result in~ ("reportOnlySuccess", "reportOnlyFailure", "reportOnlyInterrupted", "6", "7", "9")
| extend Hour = bin(Timestamp, 1h)
| summarize N = count(), First = min(Timestamp), Last = max(Timestamp),
    Controls = take_any(tostring(_X.enforcedGrantControls)),
    Sessions = take_any(tostring(_X.enforcedSessionControls)),
    Compliant = countif(IsCompliant == 1), Managed = countif(IsManaged == 1),
    Sample = take_any(pack("id", RequestId, "when", Timestamp, "client", ClientAppUsed,
             "os", OSPlatform, "browser", Browser, "ip", IPAddress, "city", City,
             "country", Country, "trust", DeviceTrustType, "error", ErrorCode))
  by Hour, PolicyId, PolicyName, Result, AccountObjectId, AccountUpn, AccountDisplayName,
     Application, RiskLevelDuringSignIn, RiskLevelAggregated, LogonType
```

plus a second, tiny query for the out-of-scope count that `verdictOf` uses (`Result in~ ("reportOnlyNotApplied", "8")`, summarized by `Hour, PolicyId` only — no user columns, so it never gets big).

What this buys: a day of 300,000 sign-ins on a tenant with five report-only policies collapses to (active users × policies evaluated × apps × verdict) rows — typically low thousands, a few hundred bytes each. A day is one query; seven days is seven, and they run in parallel. The halving logic stays as the fallback for a day that still exceeds 50 MB, so nothing gets worse.

What has to be true, and must be checked on a real tenant before this ships (the sandbox has no hunting schema — same caveat as 25328): `_X.result` is a word or a number (RESULT_N in signins.js assumes both, the `in~` list carries both); `enforcedGrantControls` is an array in the hunting JSON; `take_any(pack(...))` is accepted by the hunting engine (it is standard Kusto). Test 1 for the queue item: same day, same tenant, `N` per policy × verdict must equal what ReportImpact.build counts from a full-row read.

Per-user "combined effect" still works: the per-user view is a regroup of the same rows by `AccountUpn`. `riskWhy` becomes `N` per risk level, `denyWhy` is derived from `Controls` + `Compliant`/`Managed` exactly as `denyWhy(rec, ap)` does today, and the three samples per user become `Sample` (one per group — there are usually several groups per user, so two or three survive). ReportImpact gets a second entry point, `buildFromBuckets(rows, roPolicies)`, and T26 stops calling `readSignInWindow` for the hunting sources. The Entra-log source (P1, 10k cap) cannot aggregate server-side and keeps the row path.

Why hourly buckets and not one 7-day summary: buckets are **additive over disjoint time**. That is the property Layer B needs.

### A3. Note on the P1 Entra-log source

`ReportImpact.query` already filters `createdDateTime ge since`. Adding an upper bound (`and createdDateTime lt {newest cached}`) makes it a delta query, so Layer B works for it too — but the 10,000 cap is per read, and a tenant that fills 10,000 interactive sign-ins in an hour is beyond what that source can honestly report. Say so in the coverage line rather than pretend.

## 4. Layer B — keep what was read, on the device, with consent

### What it is

A module `js/signinstore.js` (`SigninStore`) over IndexedDB, keyed per tenant, that `readSignInWindow` consults before it asks Microsoft anything. The tools do not change: they still call `readSignInWindow(days, prog, force, onPartial)` and get the same `{records, capped, complete, oldest, newest, at}` shape. What changes is that a 7-day read at 09:00 followed by a 1-hour look at 10:00 reads one hour.

```
readSignInWindow(days)
  ├─ coverage = SigninStore.coverage(tenant, source, kind)     // [[from,to], …] already held
  ├─ missing  = window − coverage − unsettledTail(2h)            // what to ask Microsoft
  ├─ read missing intervals (A2 buckets, or rows)               // small
  ├─ SigninStore.put(...)  + coverage ∪= missing
  └─ return SigninStore.read(tenant, source, kind, window)      // merged, same shape as today
```

The **unsettled tail**: sign-ins reach the hunting table with a lag (minutes to a couple of hours). The newest two hours are never marked covered, so every refresh re-reads them. That is the honest version of "results appear as the days land".

### Schema (IndexedDB `enca-signins`, version 1)

| Store | Key | Holds |
|---|---|---|
| `tenants` | `tenantId` | `{consentAt, ttlDays, keepRows: bool, lastPurge}` — the consent record |
| `coverage` | `[tenantId, source, kind]` | settled intervals `[[from,to], …]`, merged on write |
| `buckets` | `[tenantId, "roimpact", hour, policyId, result, userId, app]` | A2 rows — the T26 store |
| `rows` | `[tenantId, source, id]`, index `[tenantId, source, ts]` | full records, for the Entra-log source (≤10k per window) and for 🕵/🌊/🛂 where rows are the point |
| `runs` | auto | `{tenantId, at, source, days, queries, rowsRead}` — for the coverage line and for you |

Retention: buckets and rows are deleted when older than the tenant's `ttlDays` (default 8 — a week plus the settle tail; maximum 30, which is all Microsoft keeps anyway). Purge runs at open and after every write. `navigator.storage.persist()` is requested once at consent so the browser does not evict the store under disk pressure.

Sizing: hourly RO buckets for a large tenant are a few MB per week. Full rows for a Perfetti-sized non-interactive week would be hundreds of MB — so `keepRows` is a separate tick, off by default, and the hunting-source row path only writes when a day came back under a threshold (say 50,000 rows). IndexedDB in Chrome/Edge allows well beyond this, but a laptop is not a database server.

### Consent, and the promise

ENCA says in three places that nothing survives the tab closing (index.html 1436, 1583; SELF-HOSTING.md 182; the T26 help copy says retention "is what your licence keeps"). Layer B changes that for one class of data — sign-in evidence, which carries UPNs, IPs and locations — so it has to be **opt-in per tenant, in words, with a way out**:

- A toggle next to the sign-in source segment: *Keep sign-ins on this device* — "Stores the sign-ins read for **{tenant}** in this browser for {N} days so later looks only read what is new. UPNs, IP addresses and locations are in it. Nothing leaves the device; **Forget** deletes it at once." Default off. The state and the first-consent date go in `tenants`.
- **Forget this tenant** on the same line, and a global **Forget all** under the ⚙ gear. The `signOutBtn` handler (app.js ~18028) forgets tenants that did *not* opt in, and leaves the ones that did — that is the whole point of opting in.
- The coverage line grows a clause: "… 6 of 7 days from this device (read 08:12), 1 day and the last 2 hours from Microsoft just now."
- Optional but cheap: encrypt values with WebCrypto AES-GCM under a non-extractable `CryptoKey` kept in the same database. It stops a copied browser profile from being greppable; it does not stop the same user in the same browser. Say exactly that in the consent text if it is done — do not oversell it.

The hosted-site promise then reads: "the site stores nothing anywhere; your browser can keep sign-ins for you if you ask it to, and only you can read them." Update the two index.html paragraphs, the T26 help section (enca-help-sections-upkeep), SECURITY.md, and the roadmap card, in the same commit.

### What each tool gets

🎚 T26 reads buckets: a week in seconds after the first read. 🚦 T17 enforced mode already filters server-side and stays as is. 🕵 T36 already reads per `userId` (small) — it can read rows from the store when `keepRows` is on, else as today. 🌊 T37 and 🛂 T38 need whole windows of rows; they benefit only with `keepRows`, and the store's `coverage` prevents the joined-read problem from recurring across sessions rather than only within one (`logInflight`).

## 5. Layer C — a self-hosted collector with SQLite

### What it is, and what it is not

Layer B still needs someone to open the tool for a read to happen. Layer C is a **scheduled collector** next to the container that runs the A2 queries every hour on its own identity and writes buckets into SQLite; the SPA reads `/api/roimpact?from&to` from the same origin. When the tool opens, the week is already there, and retention becomes yours (90 days, a year) instead of Microsoft's 30.

That is a different product from today's ENCA in three ways, all of which the SINGLE-TENANT.md audience will ask about:

1. **Identity.** Today every token is delegated, lives in the browser, and dies with it. A collector needs **application permissions** — `ThreatHunting.Read.All` for the buckets, and `Policy.Read.All` so it knows which policies are in report-only when it writes the *no data* rows — held by a service principal with a certificate, or by a managed identity federated onto the app registration (no secret at all). That is a tenant-wide, unattended read of sign-in evidence. Right for a single tenant that owns the registration; wrong for the shared multi-tenant registration, which is why this is S-numbered and never on enca.limon-it.nl.
2. **An API with its own authorization.** A Graph token cannot authorize a call to your API. The registration needs an exposed scope (`api://{clientId}/access_as_user`), the SPA acquires that token, and the collector validates it (issuer, audience, tenant) and checks the caller's directory role before serving buckets. Without this, anyone who can reach the container reads the tenant's sign-in evidence.
3. **Two processes.** nginx stays the static server; a second service — Node 22+ with the built-in `node:sqlite` (no native build) or `better-sqlite3` — is the collector and API, reverse-proxied under `/api/`. CSP already allows `connect-src 'self'`. Two images, so the static site can update without touching the collector and vice versa.

### Keeping the data across image updates

The image must never contain data, and the container must be disposable. Concretely:

**Volume, not image.** SQLite lives at `/data/enca.db` on a named volume:

```yaml
services:
  enca:
    image: ghcr.io/nurejev/enca:latest
    volumes: [ "./selfhost-branding.json:/usr/share/nginx/html/selfhost-branding.json:ro" ]
  collector:
    image: ghcr.io/nurejev/enca-collector:latest
    environment:
      ENCA_DB: /data/enca.db
      ENCA_TENANT_ID: ...
      ENCA_CLIENT_ID: ...
      ENCA_CERT_PATH: /run/secrets/collector.pfx
      ENCA_RETENTION_DAYS: "90"
      ENCA_INTERVAL_MIN: "60"
    volumes: [ "enca-data:/data" ]
    secrets: [ collector_cert ]
volumes:
  enca-data:
```

`docker compose pull && docker compose up -d` replaces both containers; `enca-data` is untouched. A bind mount (`./data:/data`) does the same and is easier to back up by hand.

**Schema migrations in the collector, forward-only.** At start: `PRAGMA user_version` → run `migrations/000N_*.sql` in order for every N above it, each in a transaction, then bump `user_version`. Before the first migration of a start-up, `VACUUM INTO '/data/backup/enca-before-vN.db'` so a bad migration is recoverable. Never rename or drop a column in a migration — add, backfill, ignore the old one. A downgrade of the image is then also safe: an older collector sees a higher `user_version`, refuses to start, and says which version it needs.

**SQLite settings that matter with one writer and many readers:** `PRAGMA journal_mode=WAL; PRAGMA synchronous=NORMAL; PRAGMA busy_timeout=5000;` The collector is the only writer; the API is read-only (`?mode=ro`).

**Backup and retention.** A nightly `VACUUM INTO '/data/backup/enca-YYYYMMDD.db'` (keep 7) inside the collector, and a documented one-liner for the host: `docker run --rm -v enca-data:/data -v "$PWD":/b alpine tar czf /b/enca-data.tgz /data`. Retention is a `DELETE FROM buckets WHERE hour < now - retention` after each run.

**Schema, first cut:**

```sql
CREATE TABLE runs     (id INTEGER PRIMARY KEY, started_at TEXT, finished_at TEXT, from_ts TEXT, to_ts TEXT, queries INT, ok INT, error TEXT);
CREATE TABLE coverage (source TEXT, kind TEXT, from_ts TEXT, to_ts TEXT, PRIMARY KEY (source, kind, from_ts));
CREATE TABLE ro_buckets (
  hour TEXT, policy_id TEXT, policy_name TEXT, result TEXT,
  user_id TEXT, upn TEXT, display_name TEXT, app TEXT,
  risk_signin TEXT, risk_user TEXT, logon_type TEXT,
  n INT, first_ts TEXT, last_ts TEXT, controls TEXT, sessions TEXT, compliant INT, managed INT, sample TEXT,
  PRIMARY KEY (hour, policy_id, result, user_id, app, risk_signin, risk_user, logon_type)
) WITHOUT ROWID;
CREATE TABLE ro_notapplied (hour TEXT, policy_id TEXT, n INT, PRIMARY KEY (hour, policy_id)) WITHOUT ROWID;
CREATE INDEX ro_buckets_hour ON ro_buckets(hour);
```

Same rows as Layer B's `buckets`, deliberately, so `ReportImpact.buildFromBuckets` serves both. Writes are `INSERT … ON CONFLICT DO UPDATE` — the unsettled-tail re-read overwrites the last two hours rather than double counting.

### Azure Container Apps is the awkward host for this

`selfhost/azuredeploy.json` and the Terraform production deployment are scale-to-zero Container Apps. Three facts collide there:

- The only persistent mount ACA offers is **Azure Files (SMB/NFS)**, and Microsoft's own guidance is *don't use storage mounts for local databases such as SQLite* — file locking over SMB is exactly what SQLite's WAL relies on.
- Scale-to-zero means nothing runs the hourly collection unless something wakes it. The natural ACA shape is a **Container Apps Job** on a cron trigger, which is a separate short-lived container — so the store must be reachable over the network, not a file on one container's disk.
- Two replicas of the API would be two SQLite openers on one SMB file.

So the storage layer in the collector should be an interface with two implementations: `sqlite` for docker compose / a VM / a NAS (the SELF-HOSTING.md audience, where a local disk exists), and a hosted store for ACA — Azure Table Storage is the cheapest fit for hourly buckets keyed the way they are (partition = policy_id, row = hour|user|app), Azure SQL serverless if you want SQL. Litestream (SQLite → Blob replication with restore at start) is the middle road if you insist on SQLite on ACA; it works with a single replica and ephemeral disk, but it is one more moving part to explain in a security review. In Terraform the store is its own resource next to the container app, so the image-digest pin that keeps production from updating itself never touches the data.

## 6. Order of work and where it lands

1. **Beta, now — T26 1.6 / T17 2.2 (Layer A1).** Stride memory, four workers, honest top line. One queue item, test: same window on the Perfetti-shaped tenant, count `queries` in the detail line before and after; expect roughly half.
2. **Beta, next — T26 2.0 (Layer A2).** Bucket query + `buildFromBuckets`; hunting sources only; row path kept as fallback and for the Entra log. Queue test: per-policy N vs a full-row read on the same day; the numeric-vs-word `result` check; a policy with zero traffic still shows *no data*.
3. **Roadmap R-number — Layer B.** `js/signinstore.js`, consent toggle, Forget, coverage line, copy changes in index.html/SECURITY.md/SELF-HOSTING.md/T26 help, jsdom smoke test with `indexedDB` shimmed (fake-indexeddb). Ships BETA-tagged like every new tool.
4. **S01 grows into S01 (drift snapshots) + S04 (collector) — Layer C.** Design the API authorization first; do not start with the database. Only when a single-tenant self-hoster asks.

## 7. Open questions to settle on a real tenant

- Does the hunting engine accept `take_any(pack(...))` and `mv-expand` over `ConditionalAccessPolicies` at this volume within 3 minutes? (Same class of unknown as 25328's `mv-apply`.)
- What is the actual ingestion lag of `EntraIdSignInEvents` on the tenants you work in? It decides the unsettled tail — two hours is a guess.
- Do you want `keepRows` at all on the hosted site, or buckets only? Buckets-only keeps the store small and the consent text short; rows are what 🌊 and 🛂 would need to benefit.
- A fifth source for later: tenants that export `SigninLogs` / `AADNonInteractiveUserSignInLogs` to Log Analytics have the same columns, customer-set retention, and no hunting CPU quota. Graph beta's `getRunHuntingQuery(..., workspaceId=…)` even reaches a Sentinel-onboarded workspace through the endpoint ENCA already uses; the direct route is `api.loganalytics.io` (another token audience and a CSP `connect-src` line — the same class of deliberate change the roadmap already flags for `api.anthropic.com`).

## 8. Status (2026-09-15, later the same day)

Built on the beta channel as four builds: **25375** Layer A1 (stride, four workers, honest progress line — queue 210), **25376** a Housekeeping fix that came in alongside (queue 211), **25377** Layer A2 (T26 2.0 bucket read — queue 212), **25378** Layer B for buckets only (R58 💾 Keep on this device — queue 213). Rows for 🕵 🌊 🛂 are not stored yet; that is R58's stated next step. Layer C is roadmap **S04**, planned, self-hosted only. The KQL of A2 and the delta read of B have offline tests (`tools/report-impact-buckets.test.cjs`, `tools/report-impact-store.test.cjs`, `tools/hunting-stride.test.cjs`, `tools/signinstore.test.cjs`); neither has run against a live hunting schema yet — that is test 2 on queue items 212 and 213.
