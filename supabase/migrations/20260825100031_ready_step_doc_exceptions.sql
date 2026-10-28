-- TJ (Oct 28 call): the "Purchased Not Ready" step exists for FedEx Ground's
-- de-identification process. Every other fleet (Walmart, Hub, Milestone, UP…)
-- is ours to sell the moment the bill of sale is paid — those units go
-- straight to Ready — Sales Required. Per-supplier flag, default off.
alter table parties add column ready_step_required boolean not null default false;
update parties set ready_step_required = true
 where name ilike 'FedEx Ground%' or name ilike 'FedEx Home Delivery%'
    or name ilike 'FedEx Smart Post%' or name ilike 'FedEx Smartpost%';

-- Conditional document gate (proposed workflow, to validate with Kat):
-- a scale ticket or hauler invoice can legitimately be absent (per-piece
-- sale; buyer hauled / UP delivered on their own price), but the exception
-- must be recorded with a reason — never silently skipped. The release form
-- has no exception.
alter table units
  add column doc_scale_ticket_reason text,
  add column doc_hauler_invoice_reason text;
update units set doc_scale_ticket_reason = 'exception recorded before reasons were required'
 where doc_scale_ticket = 'na' and doc_scale_ticket_reason is null;
update units set doc_hauler_invoice_reason = 'exception recorded before reasons were required'
 where doc_hauler_invoice = 'na' and doc_hauler_invoice_reason is null;
alter table units
  add constraint units_scale_ticket_exception_reason
    check (doc_scale_ticket is distinct from 'na' or doc_scale_ticket_reason is not null),
  add constraint units_hauler_invoice_exception_reason
    check (doc_hauler_invoice is distinct from 'na' or doc_hauler_invoice_reason is not null);
