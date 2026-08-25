-- Supplier fleet snapshots (strawman). Selena's Friday "FXG Asset List"
-- turned out to be a fleet-wide summary matrix (model year × equipment
-- type counts, ~109k assets), NOT a unit pick list — so this stores dated
-- snapshots of a supplier's fleet for trend/aging analysis, completely
-- separate from units/inventory. How the team actually uses these reports
-- is a question for TJ/Jason; the raw labels (28DF (BC), 53SR (RC)…) are
-- preserved verbatim.

create table fleet_snapshots (
  id bigint generated always as identity primary key,
  supplier_party_id bigint references parties,
  report_date date not null,
  source_note text,                          -- e.g. filename or "Selena's Friday email"
  total_assets int,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz default now()
);

create table fleet_snapshot_counts (
  id bigint generated always as identity primary key,
  snapshot_id bigint references fleet_snapshots on delete cascade not null,
  equipment_label text not null,             -- supplier's own label, verbatim
  model_year int,
  n int not null
);
create index on fleet_snapshot_counts(snapshot_id);

alter table fleet_snapshots enable row level security;
alter table fleet_snapshot_counts enable row level security;

create policy "division read" on fleet_snapshots
  for select to authenticated using (my_role() is not null);
create policy "office sales admin write" on fleet_snapshots
  for insert to authenticated with check (my_role() in ('office', 'sales', 'admin'));
create policy "admin delete" on fleet_snapshots
  for delete to authenticated using (my_role() = 'admin');

create policy "division read" on fleet_snapshot_counts
  for select to authenticated using (my_role() is not null);
create policy "office sales admin write" on fleet_snapshot_counts
  for insert to authenticated with check (my_role() in ('office', 'sales', 'admin'));
create policy "admin delete" on fleet_snapshot_counts
  for delete to authenticated using (my_role() = 'admin');
