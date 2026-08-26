-- Payment terms as a controlled lookup (Jason, Aug 2026), seeded from ROM's
-- own exhaustive picklist (screenshots of the ROM terms dropdown). Unlike
-- the trailer size/make crosswalks, this isn't messy free-text needing
-- cleanup — ROM already constrained it to these exact values. The z/zz
-- prefixes are ROM's own trick for sinking legacy/rare terms to the bottom
-- of an alphabetically-sorted picklist; preserved via sort_order so the new
-- dropdown behaves the same way (common terms first).

create table payment_terms (
  id serial primary key,
  name text unique not null,
  sort_order int not null,
  active boolean default true
);

insert into payment_terms (name, sort_order) values
  ('30 Days from Delivery', 1),
  ('30 Days Net', 2),
  ('35 Days from Delivery', 3),
  ('45 Days from Shipment', 4),
  ('70% on rec wts-bal@finals', 5),
  ('70% Upon Mill Acceptance', 6),
  ('80% NC Via ACH,Bal ACH N7', 7),
  ('90% adv on rec wts-Bal 21', 8),
  ('Advance Payment', 9),
  ('Apply to Advance / Note', 10),
  ('CAD', 11),
  ('COD', 12),
  ('Net 10 Days', 13),
  ('Net 10th Following', 14),
  ('Net 15 Days', 15),
  ('Net 20 Days', 16),
  ('Net 25 Days', 17),
  ('Net 30 Days', 18),
  ('Net 30 Days From Delivery', 19),
  ('Net 35 Days', 20),
  ('Net 45 Days', 21),
  ('Net 5 Days', 22),
  ('Net 60 Days', 23),
  ('Net 7 Days', 24),
  ('NP Upon Consumer Payment', 25),
  ('See notes below', 26),
  ('zCOD', 27),
  ('zNet 15 Days', 28),
  ('zNet 30 Days', 29),
  ('zzNet 15 Days', 30);

alter table parties add column payment_terms_id int references payment_terms;

-- One-time backfill: existing payment_terms text was always one of the seed
-- names above (created via this same dev session, no dirty variants yet).
update parties p set payment_terms_id = pt.id
  from payment_terms pt where pt.name = p.payment_terms;

alter table parties drop column payment_terms;

alter table payment_terms enable row level security;
create policy "division read" on payment_terms
  for select to authenticated using (my_role() is not null);
create policy "admin write" on payment_terms
  for all to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');
