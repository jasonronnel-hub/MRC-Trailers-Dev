-- Section 2.6: status automation.
--
-- 1. Attaching a unit to a sales order auto-fills sold_to_party_id and flips
--    status to "Sold — Dispatch Required" (mirrors ROM's trigger behavior).
-- 2. EVERY status change is written to status_log, whatever caused it.
--
-- Bulk updates always take an explicit unit-id list at the application layer —
-- never "whatever the current view shows" (the ROM footgun, designed out).

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
    -- status_log row is written by units_log_status_change below,
    -- but stash the context for it via a transaction-local setting.
    perform set_config('mrc.status_context',
                       'attached to ' || coalesce(v_order_number, 'SO id ' || new.sales_order_id),
                       true);
  end if;
  return new;
end;
$$;

create or replace function public.units_log_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'INSERT' or new.status_id is distinct from old.status_id then
    insert into status_log (unit_id, from_status, to_status, changed_by, context)
    values (
      new.id,
      case when tg_op = 'UPDATE' then old.status_id end,
      new.status_id,
      auth.uid(),
      nullif(current_setting('mrc.status_context', true), '')
    );
  end if;
  return new;
end;
$$;

create trigger units_attach_so before update on units
  for each row execute function units_attach_to_sales_order();

create trigger units_status_audit after insert or update on units
  for each row execute function units_log_status_change();
