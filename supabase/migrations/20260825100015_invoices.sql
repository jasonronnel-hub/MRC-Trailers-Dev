-- Invoices strawman (Jason: "invoiced ≠ paid — patch it"). Built ahead of
-- Katherine's Phase 3b pass, same doctrine as the dispatch strawman: a
-- working thing she edits, all additive, everything provisional labeled.
--
-- Design rule (ARCHITECTURE.md): payment state lives on the INVOICE, never
-- as a unit status — one invoice covers many units, and ROM's AR ledger
-- shows payments applying partially. "Invoiced — Closed" on a unit keeps
-- meaning exactly what ROM meant: an invoice went out.

create table invoices (
  id bigint generated always as identity primary key,
  legacy_invoice_id int unique,             -- ROM Invoice.InvoiceID
  invoice_number text unique not null,      -- INV-1001 style; legacy rows use R-INV-<id>
  buyer_party_id bigint references parties,
  invoice_date date,
  due_date date,
  terms text,
  amount numeric,                           -- invoice total; legacy rows carry paid totals
  open boolean default true,                -- true = money not (fully) received
  paid_date date,
  paid_amount numeric,
  payment_method text,                      -- Wire / Check / Cash / ACH (free text in v1)
  payment_ref text,                         -- check #, wire ref…
  notes text,
  voided boolean default false,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz default now(), updated_at timestamptz default now()
);

alter table units add column invoice_id bigint references invoices;
create index on units(invoice_id);
create index on invoices(buyer_party_id);
create index on invoices(open);

create trigger touch_invoices before update on invoices
  for each row execute function touch_updated_at();

-- Attaching a unit to an invoice mirrors the SO/dispatch automations:
-- flips status to Invoiced — Closed, audit-logged with context.
create or replace function public.units_assign_invoice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_number text;
  v_status int;
begin
  if new.invoice_id is not null
     and new.invoice_id is distinct from old.invoice_id then
    select invoice_number into v_number from invoices where id = new.invoice_id;
    select id into v_status from unit_statuses where name = 'Invoiced — Closed';
    new.status_id := v_status;
    perform set_config('mrc.status_context',
                       'invoiced on ' || coalesce(v_number, 'invoice id ' || new.invoice_id),
                       true);
  end if;
  return new;
end;
$$;

create trigger units_invoice_assign before update on units
  for each row execute function units_assign_invoice();
revoke all on function public.units_assign_invoice() from public, anon, authenticated;

-- RLS (Spec §3: accounting writes invoicing; division reads).
alter table invoices enable row level security;

create policy "division read" on invoices
  for select to authenticated using (my_role() is not null);
create policy "accounting admin create" on invoices
  for insert to authenticated with check (my_role() in ('accounting', 'admin'));
create policy "accounting admin update" on invoices
  for update to authenticated
  using (my_role() in ('accounting', 'admin'))
  with check (my_role() in ('accounting', 'admin'));
create policy "admin delete" on invoices
  for delete to authenticated using (my_role() = 'admin');

-- Staging for the ROM invoice-header migration.
create table staging_invoices (
  invoice_id text, company_id text, customer_id text,
  invoice_date text, due_date text, terms text,
  is_open text, payment_rec_date text,
  cash_paid text, check_paid text, wire_paid text,
  check_number text, payment_ref text,
  void text, notes text
);
alter table staging_invoices enable row level security;  -- no policies: service-role only

alter table staging_units add column sale_invoice_id text;
