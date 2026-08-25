# MRC Trailers Home Base

Daily home base for MRC's Trailers & Containers division. See
[MRC_Build_Spec_v1.md](MRC_Build_Spec_v1.md) for the full build spec and
[MRC_ROM_Field_Mapping.md](MRC_ROM_Field_Mapping.md) for the ROM migration blueprint.

## Stack

- **Backend:** Supabase (Postgres + Auth + RLS + Storage), `dev` and `prod` as separate projects
- **Frontend:** React (Vite), evolved from the prototype `mrc-trailers.html`
- **Migrations:** Supabase CLI, in `supabase/migrations/` (numbered, one concern each)

## Setup

1. `cp .env.example .env` and fill in the dev project's URL + keys (Supabase → Settings → API).
2. `npm install`
3. `npm run dev`

## Database

Apply migrations (dev project `dsgyhdinkmbyzkfazfep`, region us-east-2). The
direct `db.<ref>.supabase.co` host is IPv6-only and unreachable from this
network — use the session pooler:

```
npx supabase db push --db-url "postgresql://postgres.dsgyhdinkmbyzkfazfep:<DB-PASSWORD-URL-ENCODED>@aws-0-us-east-2.pooler.supabase.com:5432/postgres"
```

Verify RLS (creates and removes throwaway `rls-test-*` users in the **dev** project):

```
npm run test:rls
```

This proves `party_banking` is invisible to every role except `accounting`/`admin`,
that role-less authenticated users see nothing, and that the attach-to-sales-order
status trigger fires and writes `status_log`.

## Roles

Assign roles by inserting into `user_roles` (service key / SQL editor — there are
deliberately no client-side write policies on that table):

```sql
insert into user_roles (user_id, role) values ('<auth-user-uuid>', 'admin');
```

Roles: `admin`, `sales`, `logistics`, `accounting`, `office`, `readonly`.

## Sensitive data

`rom_*.txt`, `*.bak`, and `*.csv` are gitignored — the ROM exports contain real
dealer/banking data (Field Mapping §8) and must never be committed. They live only
on the controlled working machine.
