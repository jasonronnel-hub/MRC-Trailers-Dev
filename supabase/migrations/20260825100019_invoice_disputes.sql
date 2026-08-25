-- Disputed invoice state (Katherine, via Jason, Aug 2026): "if a buyer's
-- payment differs from the deductions agreed in advance, Kathryn flags it;
-- TJ then pursues the collection effort." That needs a state distinct from
-- plain "open" so TJ can see what actually needs chasing versus what's just
-- awaiting a normal payment date.
--
-- Flagging/clearing the dispute stays accounting/admin (Katherine owns the
-- invoice record — matches her "doesn't need party edit access" answer:
-- narrow by default). TJ logs his collection legwork as ordinary notes on
-- the invoice, same mechanism as units/parties — he doesn't need to toggle
-- the flag himself, just report back to her.

alter table invoices
  add column disputed boolean default false,
  add column dispute_reason text,
  add column dispute_amount numeric,        -- the shortfall, if known
  add column disputed_at timestamptz,
  add column disputed_by uuid references auth.users,
  add column dispute_resolved_at timestamptz;

-- Notes can now attach to invoices too (collection-effort log for TJ).
alter table notes drop constraint notes_entity_type_check;
alter table notes add constraint notes_entity_type_check
  check (entity_type in ('unit', 'party', 'sales_order', 'dispatch', 'invoice'));
