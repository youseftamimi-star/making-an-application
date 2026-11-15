# פנקס — digital debt ledger for grocery stores

Seller-only PWA that replaces the paper "הקפה" notebook. Every debt or payment is saved only after the
customer types their 4-digit PIN on the seller's screen. Source of truth for the product: the PRD v2.0
(Hebrew) the owner wrote; key rules are summarized below. UI is **Hebrew only, RTL, ₪**.

## Stack
- Next.js 15 App Router + TypeScript, React 19, Tailwind v4, TanStack Query (polls every ~5s for multi-register sync)
- PostgreSQL + Drizzle ORM (`pg` driver). Our own auth: argon2id (`@node-rs/argon2`) + DB sessions in an httpOnly cookie
- Tests: Vitest with in-memory PGlite (`tests/unit`); Playwright e2e with the installed Google Chrome (`tests/e2e`)

## Setup / commands
Node is not installed system-wide on this machine; it lives in `~/.local/node`. Prefix commands with
`export PATH="$HOME/.local/node/bin:$PATH"`.

```bash
npm install
npm run db:start      # local Postgres 17 on :5433 (embedded-postgres, data in .pgdata/) — keep running
npm run db:migrate    # apply drizzle/ migrations
npm run seed          # demo store; logins are in the header of scripts/seed.ts
npm run dev           # http://localhost:3000
npm test              # ledger unit tests
npm run test:e2e      # browser tests; needs db:start running. Uses its own DB (pinkas_e2e, recreated each run),
                      # port 3100 and build dir .next-e2e, so it can run next to `npm run dev`
npm run typecheck && npm run build
```
Schema change: edit `src/db/schema.ts` → `npm run db:generate` → `npm run db:migrate`. Never edit generated SQL in `drizzle/`.
Production: set `DATABASE_URL` to any Postgres 14+, run `db:migrate`, `build`, `start`. First visit goes to `/setup`.

## Layout
- `src/server/ledger.ts` — **all balance-changing business logic** (create/cancel transaction, customers, PIN reset). Routes stay thin.
- `src/server/{session,staff,audit,hash,errors,api,rateLimit}.ts` — auth, staff, audit log, error → HTTP mapping, zod helpers
- `app/api/**/route.ts` — JSON API; wrap handlers with `handler()` and validate input with `body(req, zodSchema)`
- `app/(app)/*` — logged-in screens: `/` register search, `/c/[id]` customer, `/c/new`, `/recent`, `/admin`
- `src/components/PinOverlay.tsx` — full-screen customer-facing PIN screen (confirm / set-new-PIN / owner override)
- `src/lib/client.ts` — `api()` fetch wrapper and Hebrew error messages (`errorText`) for every `ErrorCode`

## Business rules — do not break
- **BR-01/04:** a transaction (debt or payment) is written only with a valid customer PIN or an owner override, in one DB transaction that locks the customer row (`SELECT … FOR UPDATE`).
- **BR-02:** amounts and dates only, no line items.
- **BR-03:** PINs and passwords are argon2 hashes. Never return `pinHash` / `passwordHash` / `managerPinHash` from an API — use `toPublicCustomer()`.
- **BR-05:** one customer per phone per store (`customers_store_phone_uq`).
- **BR-06:** online only. The service worker caches static assets only, never `/api`.
- Cancel = mark `cancelled`, never delete. Employee + customer PIN within 15 min (`CANCEL_WINDOW_MS`); after that owner override only.
- 5 wrong PINs → locked 5 min. Owner override = owner session, or owner's manager code typed on an employee device. Every override, cancel, PIN reset and failed PIN goes to `audit_log`.
- Credit limit: a debt over the limit needs an owner override. A payment can't exceed the balance.
- Money is **integer agorot** everywhere (DB and code). Convert only at the edges: `parseShekelsToAgorot`, `formatAgorot`.
- Wrong-PIN state must be committed, so ledger functions *return* an `AppError` from the transaction callback (see `runCommitting`) instead of throwing.

## Conventions
- New error code: add to `ErrorCode` + status map in `src/server/errors.ts` and a Hebrew message in `errorText()`.
- UI text in Hebrew; use logical Tailwind classes (`ms-`, `me-`, `text-end`) for RTL. Numbers/phones get `dir="ltr"` where needed.
- Speed is a product KPI (< 7 s per transaction): keep the register flow at search → amount → PIN, auto-submit on the 4th digit.
- Add a unit test in `tests/unit/ledger.test.ts` for any change to a business rule, and an e2e test in `tests/e2e/core-flow.spec.ts` for any change to a register flow.
- In e2e tests, tap the on-screen PIN pad (`tapPin`) and scope `getByRole("alert")` to `main` or `dialog`: Next.js adds its own hidden alert element.

## Not built yet (from the PRD)
- Premium: monthly SMS reminders + remote payment link (stub card in `/admin`).
- Offline optimistic queue (post-MVP).
- Rate limiting is in-memory; move to Redis/DB before running several app instances.
