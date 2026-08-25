# Architecture — what's load-bearing vs. designed to change

Guardrail doc for future edits (including the ones coming from Kim's and TJ's
input). The system is deliberately layered so that the volatile parts can be
reworked without touching the stable core. Before changing something in the
left column, stop and think; the right column is expected to churn.

## Stable core — change rarely, migrate carefully

| Piece | Why it's load-bearing |
|---|---|
| **Schema migrations** (`supabase/migrations/`) | Append-only chain. Never edit an applied migration — add a new one. Column renames/drops need a deliberate migration + app update in the same commit. |
| **`legacy_*` id columns** | The migration pipeline upserts on these. They are the bridge to ROM history and must never be repurposed. Demo seed data deliberately leaves them NULL. |
| **RLS policies + `user_roles`** (`...07_roles_rls.sql`) | The security boundary. `party_banking` deny-by-default is a hard requirement (Field Mapping §8). New tables MUST enable RLS in the same migration that creates them (the grants migration gives `authenticated` table-level access to future tables — RLS is what actually protects them). |
| **Status automation triggers** (`...06_status_automation.sql`) | Attach→Sold flip + status_log audit. UI and assistant both rely on the DB doing this, not themselves. |
| **The mutation layer** (`src/lib/api.js`) | Single write path. Forms, importer, and assistant all call these functions. New write features should extend this file, not bypass it. |
| **Design tokens** (`src/index.css` `:root`) | The standing MRC design system (copper/steel on light). Screens restyle freely; tokens change only as a brand decision. |

## Designed to change — edit freely

| Piece | Expected change driver |
|---|---|
| **Screens** (`src/components/*.jsx`) | Everything here is presentational. Kim/TJ feedback lands as component edits with no schema impact. |
| **Crosswalks** (`scripts/rom/crosswalks/*.csv`) | Hand-review with Jason; every edit + pipeline rerun updates the same rows idempotently. REVIEW-flagged rows are open questions, not decisions. |
| **Seed data** (`scripts/seed-dev.mjs`) | Disposable demo content. |
| **Assistant prompt** (`supabase/functions/assistant/index.ts`) | Action vocabulary grows as features do. The function stays "dumb" — never give it a service key or direct DB access. |
| **Role→capability map** (`CAN` in `api.js`) | UI convenience only. The DB policies are the real gate; keep the two in sync when policies change. |
| **Extraction column lists** (`scripts/rom/extract.sh` + loader manifests) | Adding a ROM column = add to SELECT, manifest, staging migration (new migration!), transform. Four small edits, all additive. |

## Deliberately deferred (don't guess — ask the person)

- **Dispatch records, release documents, emails, Tuesday Report** — built as
  a WORKING STRAWMAN (Jason's call, Aug 2026) so Kim edits a running thing
  instead of a blank page. It landed additively as planned: `dispatches`
  table + `units.dispatch_id` in their own migration. Everything Kim is
  expected to reshape is isolated: email wording in
  `src/lib/emailTemplates.js`, document layout in `PrintDoc.jsx`, report
  sections in `TuesdayReport.jsx`, workflow in `Dispatch.jsx`. Field
  additions to `dispatches` = new migration. Nothing else depends on the
  strawman's choices.
- **Invoicing** — stays in ROM until Phase 3b *with Katherine*. `Invoiced —
  Closed` status and `confirmed_*` weights are the only hooks so far.
  **Invoiced ≠ paid** (Jason, Aug 2026): ROM tracks payment on the Invoice
  table (`isOpen`, `PaymentRecDate`, `CashPaid/CheckPaid/WirePaid`, `DueDate`)
  plus a full AR ledger with partial application (`ARAppliedByInvoice`,
  `ARUnapplied`). Built as a WORKING STRAWMAN (Aug 2026): `invoices` table
  with open/paid state — deliberately NOT a unit status — Invoices screen,
  mark-paid flow, invoice-ready CSV, and ROM invoice-header migration
  (linkage: `InvoiceDetail.OurWeightTicket → BrokerWTID` + buyer match;
  `isOpen` is NOT the AR flag — `PaymentRecDate`/paid amounts are; confirm
  with Katherine). Detail-level settlement (Our/Their/Settle weights,
  deductions, partial application) stays Phase 3b with Katherine.
  Known scale wart: the Invoices tab reads fetchAll's newest-10k window —
  server-page it like units before cutover.
- **`notes` order/dispatch mapping** — legacy notes migrate to units and
  parties today; order-attached notes stay in staging until entity mapping is
  confirmed against real data.
- **`sale_cust_ref` per unit** — ROM stores the "AUG 26" ref on the ticket
  as well as the order; currently only staged, not migrated. Decide with TJ
  whether units need their own ref field.

## Migration pipeline (rehearsable end to end)

```
npm run rom:extract    # Docker SQL Server → exports/*.psv   (real data!)
npm run rom:load       # exports → staging_* tables          (service key only)
npm run rom:transform  # staging → live tables, upsert on legacy_* ids
npm run rom:validate   # report → exports/validation-report.md
npm run rom:wipe       # dev back to demo state (real data only in prod — Spec §1)
npm run rom:clean      # delete exports/
```

First full rehearsal ran 2026-08-24: 23,081/23,081 units through, 3,268
parties, 434 banking rows, 3,805 orders (4,156 cross-division duplicate ids
collapsed, 527 skipped for unresolvable buyers), 12,834 notes, 463 units
recovered their sale link via the BrokerWTDTL.SOID fallback (Field Mapping
§9.3 answered). Known cleanup queue: size/make crosswalk REVIEW rows (8,739
units without equipment type, mostly TrailerSizeID=0/blank), 603 duplicate
VINs in source data, 225 sold-without-order units.
