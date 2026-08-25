# Security posture — MRC Trailers Home Base (dev)

Last hardening pass: 2026-08-25. This documents what protects the data today,
what is deliberately accepted, and what remains open. The paid professional
security review (Build Spec §6.1) remains a NON-NEGOTIABLE before real data
goes live in prod — this document is its starting inventory, not its substitute.

## Enforced at the database (RLS — verified by `npm run test:rls`, 33 checks)

- Every table: RLS on, no anon access anywhere. A Supabase event trigger
  (`rls_auto_enable`) auto-enables RLS on any new table as a backstop.
- `party_banking` (wire/ACH + federal IDs): deny-by-default; only
  `accounting`/`admin` — **and only with an MFA-verified (aal2) session**.
  A stolen password alone can never reach banking data.
- `staging_*` (raw ROM data during rehearsals): zero policies — invisible to
  every app role including admin; service-role only.
- An authenticated user with no `user_roles` row sees nothing. Roles are
  assigned server-side only (no client write path).
- Notes cannot be forged under another author; `status_log` is written only
  by SECURITY DEFINER triggers.
- SECURITY DEFINER functions: pinned `search_path`, EXECUTE revoked from
  PUBLIC/anon (and from everyone on trigger functions); future functions get
  no default PUBLIC execute.

## Enforced at the auth layer

- Public signup DISABLED at the server (probe-verified: `signUp()` →
  "Signups not allowed"). Accounts exist only if created by an admin.
- TOTP MFA forced by the app for `admin`/`accounting` at first login;
  the aal2 RLS rule above makes the DB independently enforce it for banking.
- Minimum password length 12; password changes require re-authentication;
  email alerts on password change and MFA factor enroll/unenroll.

## Key handling

- Anthropic API key: Supabase Edge Function secret only — never in repo,
  browser, or client. The function requires a valid user JWT.
- service_role key: gitignored `.env` on Jason's machine only; never in the
  browser bundle (Vite only exposes `VITE_`-prefixed vars).
- Repo secret scan runs before commits; `.gitignore` excludes `.env`,
  `rom_*.txt`, `*.bak`, `exports/`, `*.csv` (crosswalk lookups excepted).

## Data-at-rest rules (Spec §4 / Field Mapping §8)

- Real ROM data enters dev ONLY during migration rehearsals and is wiped
  after (`npm run rom:wipe` + `rom:clean`); the `.bak` and extracts live only
  on Jason's controlled machine.
- Real data permanently lives only in prod (not yet created).

## Accepted findings (reviewed, intentional)

- Advisor WARN "Signed-In Users Can Execute SECURITY DEFINER Function" for
  `my_role()` / `mfa_satisfied()`: required — RLS policies evaluate these as
  the calling role. They leak nothing beyond the caller's own role/MFA state.
- Advisor INFO "RLS enabled, no policies" on `staging_*`: that IS the design.

## Open items (owner: Jason)

1. Paid security + code review before cutover (§6.1) — non-negotiable.
2. Prod project on a paid plan: PITR backups + one rehearsed restore (§6.2),
   leaked-password (HIBP) protection (402 on free tier), custom SMTP.
3. Offsite code backup: private GitHub repo (repo currently local-only).
4. Consider rotating the dev DB password + Supabase access token before prod
   cutover (both have passed through chat/terminal during development).
5. FileVault on any machine holding the `.bak`/extracts.
6. Read-audit on banking access (Field Mapping §8.3) — needs pgaudit or a
   view-based access log; scope with the security reviewer.
