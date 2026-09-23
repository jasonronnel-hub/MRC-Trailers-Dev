-- Purchase locations are SITE records under the fleet account (ROM
-- EntContacts: "FXG - Portland OR - 972" with its street address), and the
-- ticket points at one. The migration had flattened that onto the unit as
-- two text fields; a unit created here had nothing to point at. Now the
-- site carries its address and the unit links to it. The flattened
-- purchase_location / purchase_location_address stay as the migrated
-- fallback.
alter table party_contacts add column address text;
alter table units add column purchase_contact_id bigint references party_contacts;
create index on units (purchase_contact_id);
alter table staging_contacts add column address text;
alter table staging_units add column purch_contact_id text;
