-- From the 2026-10-27 call with Kat (accounting). Additive.

-- 1. The three things Kat needs before she invoices: scale ticket, hauler
--    invoice, release form (signed by FedEx/Walmart when the trailer leaves
--    the yard). ROM does NOT enforce them and neither do we: sometimes there
--    is no scale ticket (buyer bought per piece) or no hauler invoice (buyer
--    hauled it, or UP delivered on their own price). 'na' records that.
alter table units
  add column doc_scale_ticket  text check (doc_scale_ticket  in ('received', 'missing', 'na')),
  add column doc_hauler_invoice text check (doc_hauler_invoice in ('received', 'missing', 'na')),
  add column doc_release       text check (doc_release       in ('received', 'missing', 'na'));

-- 2. Adjustments go both ways and have a kind. In ROM every adjustment line
--    is filed under "freight" and Kat types what it really is; she asked for
--    that to be cleaned up. An "add" is extra weight/money (extra strap,
--    extra metal); a "deduct" is tires, wood, fees.
alter table party_deductions
  add column category  text check (category in ('tires', 'wood', 'fees', 'extra_metal', 'freight', 'other')),
  add column direction text not null default 'deduct' check (direction in ('deduct', 'add'));
alter table order_deductions
  add column category  text check (category in ('tires', 'wood', 'fees', 'extra_metal', 'freight', 'other')),
  add column direction text not null default 'deduct' check (direction in ('deduct', 'add'));

-- 3. Saved import mappings. Every supplier's spreadsheet is different and
--    Kat spent two years getting Walmart's to load into ROM. Map a sheet
--    once; the same headers next month load with no clicks.
create table import_profiles (
  id bigint generated always as identity primary key,
  name text not null,
  supplier_party_id bigint references parties,
  header_signature text not null unique,   -- normalized header cells, joined
  mapping jsonb not null,                  -- field key -> column index
  defaults jsonb,                          -- { equipId, commodity, rateUnit }
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz default now(), updated_at timestamptz default now()
);
alter table import_profiles enable row level security;
create policy "division read" on import_profiles
  for select to authenticated using (my_role() is not null);
create policy "intake write" on import_profiles
  for all to authenticated
  using (my_role() in ('office', 'sales', 'accounting', 'admin'))
  with check (my_role() in ('office', 'sales', 'accounting', 'admin'));
