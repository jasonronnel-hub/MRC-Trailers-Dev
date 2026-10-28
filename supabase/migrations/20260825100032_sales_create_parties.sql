-- Jason (Oct 28): TJ creates new buyers himself instead of emailing Janet.
-- Sales joins office/admin on parties INSERT. Contacts and deductions already
-- allowed sales; banking stays accounting/admin only. The new-account form
-- now warns about similar existing names (Janet used to be the duplicate check).
drop policy "office admin create" on parties;
create policy "office admin sales create" on parties
  for insert to authenticated
  with check (my_role() in ('office', 'admin', 'sales'));
