-- Structured deduction schedules (Jason, Aug 2026). Deductions come in a
-- 2×2: KIND (weight in lbs vs dollars) × BASIS (per tire vs per unit/fixed).
-- Jason named three (lbs/tire, $/tire, fixed $); MRC's own schedules add the
-- fourth ("Wood floor 2,000 lb" = fixed weight). Weight deductions reduce
-- billable pounds before pricing; dollar deductions subtract after.
--
-- These are the STANDARD schedules on the buyer. 'variable' buyers negotiate
-- per deal — that stays manual (the suggestion is a helper, never
-- authoritative; Katherine's Phase 3b settlement work owns the real math).

create table party_deductions (
  id bigint generated always as identity primary key,
  party_id bigint references parties on delete cascade not null,
  description text not null,                -- Wood floor, Tires, …
  kind text not null check (kind in ('weight', 'dollars')),
  basis text not null check (basis in ('per_tire', 'per_unit')),
  rate numeric not null,                    -- lbs or $ per the kind
  created_at timestamptz default now()
);
create index on party_deductions(party_id);

alter table party_deductions enable row level security;
create policy "division read" on party_deductions
  for select to authenticated using (my_role() is not null);
create policy "office admin sales write" on party_deductions
  for all to authenticated
  using (my_role() in ('office', 'admin', 'sales'))
  with check (my_role() in ('office', 'admin', 'sales'));

-- Tire count feeds the per-tire math; entered with the scale weights.
alter table units add column tire_count int;
