-- Phase 3 strawman: dispatch records. Built ahead of Kim's design pass so she
-- edits a working thing instead of a blank page — field set and workflow are
-- PROVISIONAL. Additive only: new table + one new units column; nothing in
-- the existing schema changes shape (ARCHITECTURE.md).

create table dispatches (
  id bigint generated always as identity primary key,
  legacy_dispatch_id int unique,            -- ROM EntDispatch id (mapped in a later rehearsal)
  dispatch_number text unique not null,     -- D-1001 style, generated
  hauler_party_id bigint references parties,
  hauler_contact text,                      -- driver/dispatcher name + phone, free text in v1
  pickup_location text,
  pickup_address text,
  destination_party_id bigint references parties,   -- usually the buying yard
  destination_address text,
  scheduled_pickup date,
  delivery_eta date,
  rate numeric,
  rate_basis text check (rate_basis in ('flat', 'per_unit', 'per_mile')),
  notes text,                               -- Kim's field
  cancelled boolean default false,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz default now(), updated_at timestamptz default now()
);

alter table units add column dispatch_id bigint references dispatches;
create index on units(dispatch_id);

create trigger touch_dispatches before update on dispatches
  for each row execute function touch_updated_at();

-- Assigning a unit to a dispatch mirrors the attach-to-SO automation:
-- fills hauler + dispatch_date, flips status to Dispatched — Delivery
-- Required, and the audit trigger logs it with context.
create or replace function public.units_assign_dispatch()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hauler bigint;
  v_number text;
  v_status int;
begin
  if new.dispatch_id is not null
     and new.dispatch_id is distinct from old.dispatch_id then
    select hauler_party_id, dispatch_number into v_hauler, v_number
      from dispatches where id = new.dispatch_id;
    select id into v_status
      from unit_statuses where name = 'Dispatched — Delivery Required';

    new.hauler_party_id := coalesce(v_hauler, new.hauler_party_id);
    new.dispatch_date := coalesce(new.dispatch_date, current_date);
    new.status_id := v_status;
    perform set_config('mrc.status_context',
                       'dispatched on ' || coalesce(v_number, 'dispatch id ' || new.dispatch_id),
                       true);
  end if;
  return new;
end;
$$;

create trigger units_dispatch_assign before update on units
  for each row execute function units_assign_dispatch();

-- RLS (Spec §3: logistics/admin write dispatch fields; everyone in the
-- division reads).
alter table dispatches enable row level security;

create policy "division read" on dispatches
  for select to authenticated using (my_role() is not null);
create policy "logistics admin create" on dispatches
  for insert to authenticated with check (my_role() in ('logistics', 'admin'));
create policy "logistics admin update" on dispatches
  for update to authenticated
  using (my_role() in ('logistics', 'admin'))
  with check (my_role() in ('logistics', 'admin'));
create policy "admin delete" on dispatches
  for delete to authenticated using (my_role() = 'admin');
