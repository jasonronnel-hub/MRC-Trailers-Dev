-- Security hardening pass (Jason: "bomb-proof this").
--
-- party_banking now requires MFA AT THE DATABASE LAYER, not just at login:
-- a session must be aal2 (password + TOTP) to touch banking — unless the
-- user has no verified factor yet (the app forces admin/accounting to
-- enroll at first login, so in practice every real admin/accounting session
-- is aal2). This is Supabase's documented "require MFA for enrolled users"
-- pattern; it means a stolen password alone can never reach banking data.

create or replace function public.mfa_satisfied()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(auth.jwt()->>'aal', 'aal1') = 'aal2'
      or not exists (
        select 1 from auth.mfa_factors
        where user_id = auth.uid() and status = 'verified'
      )
$$;

revoke execute on function public.mfa_satisfied() from anon;

drop policy "accounting admin read" on party_banking;
drop policy "accounting admin write" on party_banking;
drop policy "accounting admin update" on party_banking;
drop policy "admin delete" on party_banking;

create policy "accounting admin read" on party_banking
  for select to authenticated
  using (my_role() in ('accounting', 'admin') and mfa_satisfied());
create policy "accounting admin write" on party_banking
  for insert to authenticated
  with check (my_role() in ('accounting', 'admin') and mfa_satisfied());
create policy "accounting admin update" on party_banking
  for update to authenticated
  using (my_role() in ('accounting', 'admin') and mfa_satisfied())
  with check (my_role() in ('accounting', 'admin') and mfa_satisfied());
create policy "admin delete" on party_banking
  for delete to authenticated
  using (my_role() = 'admin' and mfa_satisfied());
