-- Section 3: roles + Row-Level Security.
--
-- Roles: admin (Jason/Steve), sales (TJ), logistics (Kim), accounting (Katherine),
-- office (Janet), readonly.
--
-- Principles:
--   * RLS ON for every table; no anon access anywhere.
--   * A Supabase auth user with NO row in user_roles sees nothing — being
--     authenticated is not enough, you must be a division user.
--   * party_banking is deny-by-default: the ONLY policies on it grant
--     accounting and admin (implements Field Mapping §8).
--   * user_roles is managed server-side (service role / SQL); users can only
--     read their own role.

create table user_roles (
  user_id uuid primary key references auth.users on delete cascade,
  role text not null check (role in ('admin','sales','logistics','accounting','office','readonly')),
  created_at timestamptz default now()
);

-- Helper: the calling user's role, or null. SECURITY DEFINER so policies can
-- consult user_roles without recursive RLS lookups.
create or replace function public.my_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from user_roles where user_id = auth.uid()
$$;

revoke execute on function public.my_role() from anon;

-- ---------------------------------------------------------------- user_roles
alter table user_roles enable row level security;

create policy "read own role" on user_roles
  for select to authenticated using (user_id = auth.uid());
-- no insert/update/delete policies: role assignment happens with the service key.

-- ------------------------------------------------------------------- lookups
alter table equipment_types enable row level security;
alter table unit_statuses  enable row level security;
alter table title_types    enable row level security;
alter table party_groups   enable row level security;
alter table trailer_makes  enable row level security;

create policy "division read" on equipment_types for select to authenticated using (my_role() is not null);
create policy "division read" on unit_statuses  for select to authenticated using (my_role() is not null);
create policy "division read" on title_types    for select to authenticated using (my_role() is not null);
create policy "division read" on party_groups   for select to authenticated using (my_role() is not null);
create policy "division read" on trailer_makes  for select to authenticated using (my_role() is not null);

create policy "admin write" on equipment_types for all to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');
create policy "admin write" on unit_statuses  for all to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');
create policy "admin write" on title_types    for all to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');
create policy "admin write" on party_groups   for all to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');
create policy "admin write" on trailer_makes  for all to authenticated using (my_role() = 'admin') with check (my_role() = 'admin');

-- ------------------------------------------------------------------- parties
alter table parties enable row level security;

create policy "division read" on parties
  for select to authenticated using (my_role() is not null);

-- office/admin create parties ("only Janet creates accounts" as default
-- workflow); sales may edit buyers, so sales gets update but not insert.
create policy "office admin create" on parties
  for insert to authenticated
  with check (my_role() in ('office','admin'));

create policy "office admin sales edit" on parties
  for update to authenticated
  using (my_role() in ('office','admin','sales'))
  with check (my_role() in ('office','admin','sales'));

create policy "admin delete" on parties
  for delete to authenticated using (my_role() = 'admin');

alter table party_contacts enable row level security;

create policy "division read" on party_contacts
  for select to authenticated using (my_role() is not null);
create policy "office admin sales write" on party_contacts
  for all to authenticated
  using (my_role() in ('office','admin','sales'))
  with check (my_role() in ('office','admin','sales'));

-- ------------------------------------------------------- party_banking (§8)
-- DENY BY DEFAULT. These are the only policies on this table; nothing else
-- may grant access. Only accounting and admin can even see that a row exists.
alter table party_banking enable row level security;
revoke all on party_banking from anon;

create policy "accounting admin read" on party_banking
  for select to authenticated using (my_role() in ('accounting','admin'));
create policy "accounting admin write" on party_banking
  for insert to authenticated with check (my_role() in ('accounting','admin'));
create policy "accounting admin update" on party_banking
  for update to authenticated
  using (my_role() in ('accounting','admin'))
  with check (my_role() in ('accounting','admin'));
create policy "admin delete" on party_banking
  for delete to authenticated using (my_role() = 'admin');

-- -------------------------------------------------------------- sales_orders
alter table sales_orders enable row level security;

create policy "division read" on sales_orders
  for select to authenticated using (my_role() is not null);
create policy "sales admin write" on sales_orders
  for insert to authenticated with check (my_role() in ('sales','admin'));
create policy "sales admin accounting update" on sales_orders
  for update to authenticated
  using (my_role() in ('sales','admin','accounting'))
  with check (my_role() in ('sales','admin','accounting'));
create policy "admin delete" on sales_orders
  for delete to authenticated using (my_role() = 'admin');

-- --------------------------------------------------------------------- units
alter table units enable row level security;

create policy "division read" on units
  for select to authenticated using (my_role() is not null);
-- office keys in purchase lists; sales/logistics/admin work units through the
-- pipeline. Which FIELDS each role may touch is enforced at the app layer in
-- v1 (column-level splits revisited with the paid security review, Spec §6).
create policy "division create" on units
  for insert to authenticated
  with check (my_role() in ('office','sales','logistics','admin'));
create policy "pipeline update" on units
  for update to authenticated
  using (my_role() in ('sales','logistics','accounting','admin'))
  with check (my_role() in ('sales','logistics','accounting','admin'));
create policy "admin delete" on units
  for delete to authenticated using (my_role() = 'admin');

-- --------------------------------------------------------------------- notes
alter table notes enable row level security;

create policy "division read" on notes
  for select to authenticated using (my_role() is not null);
create policy "division create own" on notes
  for insert to authenticated
  with check (my_role() is not null and my_role() <> 'readonly' and author = auth.uid());
create policy "author or admin edit" on notes
  for update to authenticated
  using (author = auth.uid() or my_role() = 'admin')
  with check (author = auth.uid() or my_role() = 'admin');

-- ---------------------------------------------------------------- status_log
-- Written only by the SECURITY DEFINER trigger; clients read, never write.
alter table status_log enable row level security;

create policy "division read" on status_log
  for select to authenticated using (my_role() is not null);
