-- Section 4: staging tables for the ROM migration pipeline.
--
-- Raw landing zone: every column text, loaded verbatim from the sqlcmd
-- extracts. The transform step (scripts/rom/transform.mjs) reads these and
-- upserts into the live tables on legacy_* ids — rerunning updates rather
-- than duplicates.
--
-- SECURITY: RLS is enabled with NO policies on every staging table. App
-- users (any role) can see nothing here; only the service-role key used by
-- the migration scripts can read or write. Staging holds real ROM data
-- during rehearsals, including banking columns (Field Mapping §8).

create table staging_units (
  bwt_id text, company_id text, void text,
  unit_num text, alt_unit_num text, vin text,
  size_id text, make_id text, trailer_year text,
  ready_state text, ready_date text, sched_date text, dispatch_date text,
  pickup_date text, completion_date text, mia text,
  title_type_id text, title_rec text, title_rec_date text,
  title_sent_date text, title_tracking text,
  purch_dealer_id text, purch_order_id text, purch_cust_ref text,
  sale_dealer_id text, sale_order_id text, sale_cust_ref text,
  hauler_id text, dispatch_id text, ticket_notes text,
  gross text, tare text, net text, adj_wt text, adj_reason text,
  confirmed_gross text, confirmed_tare text, confirmed_net text,
  dtl_soid text
);

create table staging_dealers (
  dealer_id text, company_name text, group_id text,
  billing_address text, city text, state text, zip text,
  phone1 text, email text,
  payment_terms text, terms_type text, terms_days text, credit_limit text,
  notes text, purchase_hot_notes text, trucking_notes text,
  active text, federal_id text,
  wire_benef_bank text, wire_aba_num text, wire_bank_credit text,
  wire_bank_acct_num text, wire_bank_acct_name text, wire_bank_more_info text,
  wire_add_beneficiary text, wire_benef_bank_info text, wire_benef_acct_num text,
  wire_benef_acct_name text, wire_benef_aba text, wire_inter_aba text,
  wire_inter_acct_num text, wire_inter_acct_name text, wire_inter_bank text,
  wire_inter_bank_info text
);

create table staging_contacts (
  contact_id text, dealer_id text, contact_name text,
  email text, phone1 text, notes text, trucking_notes text,
  is_default text, active text
);

create table staging_orders (
  order_id text, company_id text, customer_id text, order_type text,
  order_date text, created_date text, external_order_num text,
  order_notes text, terms text, closed_date text, void text,
  item_text text, um_id text, wtum text, units_ordered text, price text
);

create table staging_notes (
  note_id text, note_detail_id text, note_type_id text, note_type_desc text,
  dealer_id text, p_obj_company_id text, p_obj_id text, p_obj_type_id text,
  p_trans_id text, object_id text, object_type_id text,
  internal_note text, popup text, item_note text,
  created_by text, created_date text, edited_date text, void text,
  note_text text
);

alter table staging_units    enable row level security;
alter table staging_dealers  enable row level security;
alter table staging_contacts enable row level security;
alter table staging_orders   enable row level security;
alter table staging_notes    enable row level security;
-- No policies on purpose: service-role only.

create index on staging_units (bwt_id);
create index on staging_dealers (dealer_id);
