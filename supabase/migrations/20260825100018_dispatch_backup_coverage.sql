-- Business-continuity widening (Jason, Aug 2026): dispatch work was
-- logistics/admin-only, which means the whole workflow stops if Kim is out.
-- Widen to match the pattern already used for unit intake (createUnit =
-- office/sales/logistics/admin) so TJ or Janet can create dispatches,
-- assign units, and mark deliveries while she's out — same as any of them
-- already can with units generally.

drop policy "logistics admin create" on dispatches;
drop policy "logistics admin update" on dispatches;

create policy "ops staff create" on dispatches
  for insert to authenticated with check (my_role() in ('office', 'sales', 'logistics', 'admin'));
create policy "ops staff update" on dispatches
  for update to authenticated
  using (my_role() in ('office', 'sales', 'logistics', 'admin'))
  with check (my_role() in ('office', 'sales', 'logistics', 'admin'));
-- delete stays admin-only (destructive; Section 3 default).

-- units.dispatch_id / status_id updates (assign, mark delivered) go through
-- the units "pipeline update" policy — add office there too so the same
-- backup coverage actually works end-to-end, not just at the dispatches table.
drop policy "pipeline update" on units;
create policy "pipeline update" on units
  for update to authenticated
  using (my_role() in ('office', 'sales', 'logistics', 'accounting', 'admin'))
  with check (my_role() in ('office', 'sales', 'logistics', 'accounting', 'admin'));
