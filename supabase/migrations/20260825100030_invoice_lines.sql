-- Invoice line items (Kat, Oct 27): tire / wood / fee / extra-metal
-- adjustments show as their own visible lines on an invoice instead of being
-- folded into one total. Additive: invoices.amount stays the authoritative
-- total, and legacy invoices simply have no lines.
create table invoice_lines (
  id bigint generated always as identity primary key,
  invoice_id bigint not null references invoices on delete cascade,
  unit_id bigint references units on delete set null,
  kind text not null check (kind in ('sale', 'adjustment')),
  category text check (category in ('tires','wood','fees','extra_metal','freight','other')),
  direction text check (direction in ('deduct','add')),
  description text not null,
  detail text,                       -- "−150 lb", "1,320 lb" — the working shown beside the line
  amount numeric not null,           -- signed dollars: negative comes off the invoice
  sort int not null default 0,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz default now()
);
create index on invoice_lines(invoice_id);
create index on invoice_lines(unit_id);

alter table invoice_lines enable row level security;
create policy "division read" on invoice_lines
  for select to authenticated using (my_role() is not null);
create policy "accounting admin write" on invoice_lines
  for all to authenticated
  using (my_role() in ('accounting', 'admin'))
  with check (my_role() in ('accounting', 'admin'));
