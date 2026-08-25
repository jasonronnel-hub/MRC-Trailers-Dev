-- Scale pass: the pipeline-rail counts move server-side so they stay global
-- and cheap regardless of what page of units the client is looking at.
--
-- SECURITY INVOKER: the function runs under the caller's RLS. A user with no
-- role gets zero rows, same as querying units directly.
create or replace function public.unit_status_counts()
returns table (status_id int, n bigint)
language sql
stable
security invoker
set search_path = public
as $$
  select u.status_id, count(*)
  from units u
  where u.voided = false
  group by u.status_id
$$;

revoke execute on function public.unit_status_counts() from anon;

-- Supporting indexes for the common filter paths at 23k+ rows.
create index if not exists units_unit_number_idx on units (unit_number);
create index if not exists units_completion_date_idx on units (completion_date);
create index if not exists units_missing_idx on units (missing) where missing = true;
