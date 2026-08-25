# MRC Trailers Home Base — Build Specification v1

**Owner:** Jason Ronnel · **Started:** August 24, 2026 · **Target:** evaluation-ready system by December 2026
**Companion documents:** `MRC_ROM_Field_Mapping.md` (data migration blueprint), the operations manual ("trailers bible", business process), the prototype (`mrc-trailers.html`, target UX), and the `rom_*.txt` schema/logic exports.

## 0. Mission and Definition of Done

Build the daily home base for MRC's Trailers & Containers division (~6 users: Steve, TJ, Kim, Katherine, Janet, Jason). Done means the team can run a full unit lifecycle — purchase list in → ready → sold → dispatched → delivered — entirely in this system, with ROM running in parallel as the fallback, such that the team can confidently answer "yes, we can move to this."

Accounting/invoicing: moves only when frictionless. Until then the system generates invoice-ready data (Phase 3b export/handoff), and Katherine keeps invoicing in ROM. Do not couple cutover to the GL.

## 1. Architecture (decided)

- **Backend:** Supabase (managed Postgres + Auth + Row-Level Security + Storage). One project, region US-central or US-east.
- **Frontend:** React (Vite), evolved from the prototype's design language and screens. Deployed on Vercel (or Supabase hosting). Desktop-first, tablet-friendly.
- **AI assistant feature:** server-side calls to the Anthropic API (keys kept server-side in Supabase Edge Functions — never in the browser).
- **Email generation (Phase 3):** generate .eml/mailto drafts first; direct sending via Resend or SMTP later. Kim reviews everything before send in v1.
- **Version control:** git from day one, private GitHub repo. Claude Code manages commits.
- **Environments:** `dev` and `prod` as two Supabase projects. Real data only in prod. Migration rehearsals run against dev.

## 2. Data Model (Postgres)

Naming: snake_case. All tables get `id` (bigint identity or uuid), `created_at`, `updated_at`, `created_by`, plus `legacy_id` columns preserving ROM IDs for audit continuity.

### 2.1 Lookups (controlled vocabularies — admin-editable, no free text)

```sql
create table equipment_types (
  id serial primary key,
  name text unique not null,          -- Drop Frame Pup, Straight Rail Pup, Long Straight Rail,
                                      -- Aluminum Container, Steel Container, Chassis, Tractor,
                                      -- Switcher, Converter Dolly, Composite, FRP
  item_code text,                     -- 7000-series default
  default_ref_weight_lbs int,
  active boolean default true
);

create table unit_statuses (
  id serial primary key,
  name text unique not null,          -- Purchased Not Ready / Ready — Sales Required /
                                      -- Sold — Dispatch Required / Dispatched — Delivery Required /
                                      -- Delivered — Invoice Required / Invoiced — Closed / State Unknown
  sort_order int not null
);

create table title_types (id serial primary key, name text unique not null);  -- Original, Bill of Sale, None
create table party_groups (id serial primary key, name text unique not null); -- Trailer Buyer, Trailer Supplier, Freight, Rail Freight, HUB, Other
create table trailer_makes (id serial primary key, name text unique not null, active boolean default true);
```

Seed `trailer_makes` from the §7 cleanup crosswalk (canonical spellings only — one Kwik-Load, one Freightliner).

### 2.2 Parties (dealers: buyers, suppliers, haulers — one table, role-tagged)

```sql
create table parties (
  id bigint generated always as identity primary key,
  legacy_dealer_id int unique,             -- EntDealers.DealerID
  name text not null,
  group_id int references party_groups,
  merged_parent boolean default false,      -- Sims-style central billing
  parent_party_id bigint references parties,
  billing_address text, city text, state text, zip text, country text,
  phone text, email text,
  payment_terms text, payment_method text,
  credit_limit numeric,
  deduction_model text check (deduction_model in ('none','standard','variable')) ,
  standard_deductions text,                 -- structured later; text in v1
  destruction_agreement_signed date,        -- first-class, per ops manual
  rema_member boolean default false,
  general_notes text,
  trucking_notes text,                      -- Kim's field
  purchase_hot_notes text,                  -- pop-up warnings
  active boolean default true,
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table party_contacts (
  id bigint generated always as identity primary key,
  legacy_contact_id int unique,
  party_id bigint references parties not null,
  name text, email text, phone text, notes text, trucking_notes text,
  is_default boolean default false, active boolean default true
);

-- SENSITIVE: banking lives in its own table so RLS can wall it off entirely
create table party_banking (
  party_id bigint primary key references parties,
  wire_details jsonb,                       -- migrated from EntDealers.Wire* columns
  federal_id text,
  updated_at timestamptz default now()
);
```

### 2.3 Units (the BWT, merged with TrailerDetails — one row per physical unit)

```sql
create table units (
  id bigint generated always as identity primary key,
  legacy_bwt_id int unique,                 -- BrokerWTHDR.BrokerWTID
  unit_number text, alt_unit_number text,
  vin text,                                  -- unique when present; ROM data has 'N/A' and blanks — allow null, index non-null
  equipment_type_id int references equipment_types,
  make_id int references trailer_makes, model_year int,
  status_id int references unit_statuses not null default 1,  -- NULL ReadyState in ROM → Purchased Not Ready
  source_party_id bigint references parties,      -- FedEx, Walmart, UP, Hub, JB Hunt, Milestone
  purchase_order_ref text, purchase_price numeric,
  pickup_location_code text, pickup_address text, physical_location text,
  condition_comments text,
  ready_date date, scheduled_date date, dispatch_date date,
  pickup_date date, completion_date date,
  missing boolean default false,             -- TrailerDetails.MIA
  title_type_id int references title_types,
  title_received boolean default false, title_received_date date,
  title_sent_date date, title_tracking_num text,
  sold_to_party_id bigint references parties,
  sales_order_id bigint references sales_orders,
  hauler_party_id bigint references parties,
  gross_wt numeric, tare_wt numeric, net_wt numeric,
  confirmed_gross numeric, confirmed_tare numeric, confirmed_net numeric,
  ref_weight_lbs int,
  voided boolean default false,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
create index on units(status_id); create index on units(source_party_id);
create index on units(sold_to_party_id); create index on units(vin) where vin is not null;
```

### 2.4 Sales Orders

```sql
create table sales_orders (
  id bigint generated always as identity primary key,
  legacy_order_id int unique,
  order_number text unique,                 -- SO-1042 style, generated
  buyer_party_id bigint references parties not null,
  customer_reference text,                  -- 'AUG 26' convention — enforce format in UI
  item_code text, price numeric,
  price_unit text check (price_unit in ('per_lb','per_ton','flat')),
  ref_weight_lbs int,                       -- Catherine's spot-check flag
  header_notes text,                        -- pasted confirmation emails live here
  detail_notes text,
  open boolean default true, closed_at timestamptz,
  created_at timestamptz default now(), updated_at timestamptz default now()
);
```

### 2.5 Notes, documents, and audit

```sql
create table notes (
  id bigint generated always as identity primary key,
  legacy_note_id int,
  entity_type text check (entity_type in ('unit','party','sales_order','dispatch')),
  entity_id bigint not null,
  note_text text not null,
  note_type text,                            -- migrate romNoteTypes labels
  popup boolean default false,               -- must-see warnings (ROM PopUpNote)
  author uuid references auth.users, authored_at timestamptz default now(),
  voided boolean default false
);

create table status_log (                    -- every status change, who and when (ROM lacks this; we won't)
  id bigint generated always as identity primary key,
  unit_id bigint references units not null,
  from_status int, to_status int not null,
  changed_by uuid references auth.users, changed_at timestamptz default now(),
  context text                               -- e.g. 'attached to SO-1042'
);
```

Dispatch records, generated documents (dispatch orders, releases), and the Tuesday Report tables get designed at the top of Phase 3 with Kim at the table — do not guess her workflow, ask her.

### 2.6 Status automation

Attaching a unit to a sales order sets `sold_to_party_id`, `sales_order_id`, and flips status to Sold — Dispatch Required (mirrors ROM's trigger behavior). Implement as a Postgres function + trigger, and log to `status_log`. All bulk updates require an explicit unit-id list — never "whatever the current view shows" (the ROM bulk-update footgun, designed out).

## 3. Roles and Row-Level Security

Roles via a `user_roles` table keyed to Supabase auth users: `admin` (Jason/Steve), `sales` (TJ), `logistics` (Kim), `accounting` (Katherine), `office` (Janet), `readonly`.

RLS policy summary:
- All authenticated division users: read parties, units, sales_orders, notes.
- `sales`, `admin`: write sales_orders, attach units, edit buyers.
- `logistics`, `admin`: write dispatch fields, hauler assignment, status moves dispatch→delivered.
- `accounting`, `admin`: write invoicing-related fields; only roles that can read `party_banking`.
- `party_banking`: **deny by default.** Select/update only `accounting` and `admin`. No other policy grants it. This implements Field-Mapping §8.
- `office`, `admin`: create parties (mirrors the "only Janet creates accounts" rule as a default workflow, not a hard block for admin).
- Every table: RLS ON, no anon access, service-role key never leaves server functions.

## 4. Migration Plan (rehearsable, idempotent)

Source: restored ROM backup in local Docker SQL Server (procedure proven 8/24/26; see chat log / commands file). Extraction uses the **validated join**:

```sql
FROM BrokerWTHDR h
JOIN TrailerDetails td
  ON td.pTransID = h.BrokerWTID AND td.pObjCompanyID = h.CompanyID
 AND td.pObjID = 915 AND td.pObjTypeID = 8
WHERE (td.UnitNum <> '' OR td.VIN <> '')      -- 23,081 rows, trailer division = CompanyID 7675
```

Steps (scripted, re-runnable weekly as cutover rehearsal):
1. Restore latest `.bak` into Docker (2-minute documented procedure).
2. Export to CSV: trailer units (join above + BrokerWTDTL weights), parties (EntDealers filtered to groups 13/14/18/21/22 **plus any dealer id referenced by a trailer unit**), contacts, orders (OrderHeader/OrderDetails referenced by trailer units), notes (romNotes where pObj points at a trailer unit/dealer/order).
3. Clean through crosswalks: `TrailerSizes` → `equipment_types` (field-map §7), `TrailerMakes` → canonical makes, NULL ReadyState → Purchased Not Ready, SaleOrderID=0 → null (and resolve completed-unit linkage via BrokerWTDTL.SOID — open item §9.3).
4. Load into Supabase staging tables, then upsert on `legacy_*` ids (idempotent — rerunning updates rather than duplicates).
5. Validation report after every run: row counts vs. source, status distribution, units with no source party, VIN duplicates, orphaned order references. Human-review the report; fix crosswalks; rerun.

The `.bak` and any exported CSVs are sensitive (banking data, per §8) — they stay on Jason's controlled machine and get deleted after each rehearsal; only the loaded prod database (behind auth + RLS) retains real data.

## 5. Application Screens (Phase 1–2 scope)

From the prototype, in build order:
1. **Login** (Supabase auth, email + password, MFA for admin/accounting).
2. **Pipeline rail + Inventory** — status counts, filterable table, unit drawer. Read-only milestone: end of September.
3. **Buyers** — list + drawer with destruction-agreement red flag, deduction model, Kim's notes, pop-up warnings.
4. **Sales Orders** — list + drawer with attached units.
5. **Create/edit forms + attach-units flow** (with the status automation).
6. **Importers** — Walmart bid sheet (columns: Unit #, VIN, Pickup Location, Pickup Address, Comments, MRC price — parser proven in prototype) and FedEx weekly list (get a real sample from Selena's Friday email before building).
7. **Assistant** — chatbot for conversational create/attach/query, via server-side Anthropic calls. Ships after forms work; the forms are the fallback when the model mishears.

Phase 3 (November, designed with Kim): dispatch orders, release documents, the three standard emails, Tuesday Report generator. Phase 3b (with Katherine): invoice-ready export → whatever accounting lands on; invoicing itself stays in ROM until the alternative is real and frictionless.

## 6. Non-negotiables before real data goes live

1. Paid professional **security + code review** (few $K): RLS policies, auth flows, API key handling, backup restore test.
2. **Backups verified:** Supabase point-in-time recovery enabled on prod; one restore actually rehearsed.
3. **Named backup human** (retainer with the reviewing dev) so the division isn't one person deep.
4. ROM server stays on through at least Q1 2027.

## 7. Day-One Instructions for Claude Code

Working directory contains: this spec, `MRC_ROM_Field_Mapping.md`, the `rom_*.txt` exports, and the prototype `mrc-trailers.html`. First tasks, in order:
1. Initialize git repo; scaffold Vite + React app; connect to the dev Supabase project.
2. Create the Section 2 schema as SQL migration files; apply to dev.
3. Implement auth + user_roles + the Section 3 RLS policies; write tests that prove `party_banking` is invisible to non-accounting roles.
4. Build screens 1–2 against seeded fake data (reuse the prototype's seed).
5. Write the Section 4 extraction scripts (sqlcmd → CSV) and the staging loader; dry-run against the Docker restore.
Then iterate with Jason screen by screen.
