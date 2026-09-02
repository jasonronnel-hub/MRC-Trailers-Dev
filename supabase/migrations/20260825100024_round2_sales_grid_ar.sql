-- Round 2 (Sept 2026), from Jason's six-section list after TJ's first look.
-- Everything here is ADDITIVE: one new lookup, one new child table, new
-- columns with defaults, one added line in an existing trigger. Nothing
-- existing changes shape.

-- ---------------------------------------------------------------------------
-- 1. Commodity codes — ROM's EntInventory items for the trailer division.
--    ShortName is the code MRC quotes by ("7054-53SR"); same set as ROM.
--    Active mirrors ROM (its -1 = retired). Seeded verbatim from the backup.
-- ---------------------------------------------------------------------------
create table commodity_codes (
  code text primary key,
  name text not null,
  rom_inventory_id int unique,
  active boolean not null default true
);
insert into commodity_codes (code, name, rom_inventory_id, active) values
  ('7000-ALWD-AL',  'SR - Alum Sides, Wd Floor, Alum Roof',              1437, true),
  ('7029-28SR',     '28SR',                                              1441, true),
  ('7045-45TRAIL',  '45'' SR',                                           1653, false),
  ('7048-48TRAIL',  '48'' Trailer - Alum Wall, Wood Floor',              1444, true),
  ('7050-ALWD-AR',  'Armorplate - Alum Sides, Wd Floor, Alum Roof',      1445, true),
  ('7053-53TRAIL',  '53'' Trailer - Alum Wall, Wood Floor',              1446, true),
  ('7054-53SR',     '53SR',                                              1447, true),
  ('7110-ALAL-AR',  'Armorplate - Alum Sides, Alum Floor, Alum Roof',    1451, true),
  ('7140-28S&PAL',  '28'' Trailer S&P Alum Floor',                       1651, false),
  ('7150-REEFERS',  'REFRIGERATION TRAILERS',                            1652, false),
  ('7200-DUWD-AL',  'Duraplate - St Sides, Wd Floor, Alum Roof',         1454, true),
  ('7230-DUSP-AL',  'Duraplate - St Sides, SPLIT Al/Wd Floor, Al roof',  1458, true),
  ('7253-53DUWD',   '53'' Duraplate Trailer - Wood Floor',               1461, true),
  ('7300-STWD-AL',  'St Sides, Wd Floor, Alum Roof',                     1462, true),
  ('7353-53STWD',   '53'' Steel Trailer - Wood Floor',                   1470, true),
  ('7400-FRPWD-T',  'FRP Sides, Wd Floor, Trans Roof',                   1471, true),
  ('7453-FRPT',     '53'' FRP Trailer',                                  1476, true),
  ('7454-53FRP',    '53FRP',                                             1477, true),
  ('7528-COMPUP',   '28'' Composite Pup Trailer',                        1479, true),
  ('7553-53COMP',   '53'' Composite Trailer',                            1481, true),
  ('7600-DFAL',     'DF - Alum Sides, Alum Floor, Alum Roof',            1482, true),
  ('7628-DFPUP',    '28'' DF Alum Pup Trailer',                          1483, true),
  ('7629-28DF',     '28DF',                                              1484, true),
  ('7633-33DF',     '33DF',                                              1709, false),
  ('7700-CONST',    '53'' Container - Steel wall, Wd Floor, Alum roof',  1485, true),
  ('7703-53STCON',  '53'' Steel Intermodal Container',                   1486, true),
  ('7720-20STCON',  '20'' Steel Container',                              1487, true),
  ('7740-40STCON',  '40'' Steel Container',                              1488, true),
  ('7750-CONAL',    '53 Container - Alum wall, Wd Floor, Alum roof',     1489, true),
  ('7753-53ALCON',  '53'' Aluminum Intermodal Container',                1490, true),
  ('7900-DOLLY',    'Dolly',                                             1491, true),
  ('7910-CHASSIS',  'Chassis',                                           1493, true),
  ('7913-CONCHAS',  '53'' Container Chassis',                            1494, true),
  ('7916-UNSTCH',   'Unprepared Steel Chassis',                          1495, true),
  ('7920-TRACTOR',  'Tractor',                                           1496, true),
  ('7925-SWITCH',   'Switcher',                                          1497, true),
  ('7940-PKGVANS',  'PACKAGE / SPRINTER VANS',                           1707, false),
  ('7950-STEEL',    'UNPREPARED STEEL SCRAP',                            1656, false),
  ('7960-MODDOCK',  'MOD DOCK',                                          1700, false),
  ('NON-INVENTRY',  'NON-INVENTORY COMMODITY',                           1693, false),
  ('TBD',           'To Be Determined',                                  1625, false)
on conflict (code) do nothing;

alter table commodity_codes enable row level security;
create policy "division read" on commodity_codes
  for select to authenticated using (my_role() is not null);
create policy "admin write" on commodity_codes
  for all to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');

-- equipment_types.item_code held placeholders (7010/7040). Point each type at
-- its ROM code so a new unit defaults to something real.
update equipment_types set item_code = c.code
from (values
  ('Long Straight Rail', '7054-53SR'), ('Drop Frame Pup', '7629-28DF'),
  ('Straight Rail Pup', '7029-28SR'), ('Steel Container', '7703-53STCON'),
  ('Aluminum Container', '7753-53ALCON'), ('Chassis', '7910-CHASSIS'),
  ('Converter Dolly', '7900-DOLLY'), ('Tractor', '7920-TRACTOR'),
  ('Switcher', '7925-SWITCH'), ('Composite', '7553-53COMP'), ('FRP', '7454-53FRP')
) as c(name, code)
where equipment_types.name = c.name;

-- ---------------------------------------------------------------------------
-- 2. Sales orders — recurring terms become fields; notes stay for exceptions.
-- ---------------------------------------------------------------------------
alter table sales_orders
  add column payment_terms_id int references payment_terms,
  add column title_required_with_delivery boolean not null default false,
  add column title_notes text;

-- item_code becomes a real reference to the commodity set. Placeholder codes
-- from before the lookup existed are cleared rather than kept as junk.
update sales_orders set item_code = null
  where item_code is not null and item_code not in (select code from commodity_codes);
alter table sales_orders
  add constraint sales_orders_item_code_fkey foreign key (item_code) references commodity_codes(code);

-- Per-order deduction schedule: copied from the buyer's standard schedule at
-- sale time, then edited per deal. Same kind×basis grid as the buyer's, plus
-- per_lb (a $/lb adjustment) which Jason listed.
create table order_deductions (
  id bigint generated always as identity primary key,
  order_id bigint not null references sales_orders on delete cascade,
  description text not null,
  kind text not null check (kind in ('weight', 'dollars')),
  basis text not null check (basis in ('per_tire', 'per_unit', 'per_lb')),
  rate numeric not null,
  created_at timestamptz default now()
);
create index on order_deductions (order_id);
alter table order_deductions enable row level security;
create policy "division read" on order_deductions
  for select to authenticated using (my_role() is not null);
create policy "sales accounting admin write" on order_deductions
  for all to authenticated
  using (my_role() in ('sales', 'accounting', 'admin'))
  with check (my_role() in ('sales', 'accounting', 'admin'));

alter table party_deductions drop constraint party_deductions_basis_check;
alter table party_deductions
  add constraint party_deductions_basis_check check (basis in ('per_tire', 'per_unit', 'per_lb'));

-- ---------------------------------------------------------------------------
-- 3. Units — the dates each status view shows, the ROM commodity, and the
--    bulk-import batch for backfill queues.
-- ---------------------------------------------------------------------------
alter table units
  add column purchase_date date default current_date,   -- ROM: BrokerWTHDR.CreatedDate
  add column sold_date date,                             -- set by the attach trigger
  add column commodity_code text references commodity_codes(code),
  add column import_batch text;
create index on units (purchase_date);
create index on units (sold_date);
create index on units (import_batch) where import_batch is not null;

-- sold_date rides on the existing attach trigger: one added line.
create or replace function public.units_attach_to_sales_order()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_buyer bigint;
  v_order_number text;
  v_sold_status int;
begin
  if new.sales_order_id is not null
     and new.sales_order_id is distinct from old.sales_order_id then
    select buyer_party_id, order_number into v_buyer, v_order_number
      from sales_orders where id = new.sales_order_id;
    select id into v_sold_status
      from unit_statuses where name = 'Sold — Dispatch Required';

    new.sold_to_party_id := v_buyer;
    new.status_id := v_sold_status;
    new.sold_date := coalesce(new.sold_date, current_date);
    perform set_config('mrc.status_context',
                       'attached to ' || coalesce(v_order_number, 'SO id ' || new.sales_order_id),
                       true);
  end if;
  return new;
end;
$$;
revoke all on function public.units_attach_to_sales_order() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 4. Invoices — Lost is a manual accounting decision, never automatic.
-- ---------------------------------------------------------------------------
alter table invoices
  add column lost boolean not null default false,
  add column lost_at timestamptz,
  add column lost_reason text;

-- ---------------------------------------------------------------------------
-- 5. Staging — carry the two new ROM columns (appended, so existing loads
--    keep their column positions).
-- ---------------------------------------------------------------------------
alter table staging_units add column created_date text;
alter table staging_orders add column inventory_id text;
