-- Section 2.2: parties — buyers, suppliers, haulers in one role-tagged table
-- (mirrors ROM's EntDealers; Field Mapping §4 recommends keeping this shape).

create table parties (
  id bigint generated always as identity primary key,
  legacy_dealer_id int unique,              -- EntDealers.DealerID
  name text not null,
  group_id int references party_groups,
  merged_parent boolean default false,      -- Sims-style central billing
  parent_party_id bigint references parties,
  billing_address text, city text, state text, zip text, country text,
  phone text, email text,
  payment_terms text, payment_method text,
  credit_limit numeric,
  deduction_model text check (deduction_model in ('none','standard','variable')),
  standard_deductions text,                 -- structured later; text in v1
  destruction_agreement_signed date,        -- first-class, per ops manual
  rema_member boolean default false,
  general_notes text,
  trucking_notes text,                      -- Kim's field
  purchase_hot_notes text,                  -- pop-up warnings
  active boolean default true,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create table party_contacts (
  id bigint generated always as identity primary key,
  legacy_contact_id int unique,
  party_id bigint references parties not null,
  name text, email text, phone text, notes text, trucking_notes text,
  is_default boolean default false, active boolean default true,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz default now(), updated_at timestamptz default now()
);

-- SENSITIVE: banking lives in its own table so RLS can wall it off entirely
-- (Field Mapping §8: EntDealers.Wire* / FederalID). Deny-by-default policies
-- live in the RLS migration.
create table party_banking (
  party_id bigint primary key references parties,
  wire_details jsonb,                       -- migrated from EntDealers.Wire* columns
  federal_id text,
  updated_at timestamptz default now()
);

create trigger touch_parties before update on parties
  for each row execute function touch_updated_at();
create trigger touch_party_contacts before update on party_contacts
  for each row execute function touch_updated_at();
create trigger touch_party_banking before update on party_banking
  for each row execute function touch_updated_at();

create index on parties(group_id);
create index on party_contacts(party_id);
