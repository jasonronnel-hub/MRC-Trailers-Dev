-- Section 2.1: controlled vocabularies. Admin-editable lists, no free text —
-- this is the fix for ROM's polluted TrailerSizes/TrailerMakes (Field Mapping §7).

create table equipment_types (
  id serial primary key,
  name text unique not null,
  item_code text,                     -- 7000-series default
  default_ref_weight_lbs int,
  active boolean default true
);

create table unit_statuses (
  id serial primary key,
  name text unique not null,
  sort_order int not null
);

create table title_types (id serial primary key, name text unique not null);
create table party_groups (id serial primary key, name text unique not null);
create table trailer_makes (id serial primary key, name text unique not null, active boolean default true);

-- Seeds. unit_statuses MUST be inserted in pipeline order: units.status_id
-- defaults to 1, which has to mean "Purchased Not Ready" (NULL ReadyState in ROM).
insert into unit_statuses (name, sort_order) values
  ('Purchased Not Ready', 1),
  ('Ready — Sales Required', 2),
  ('Sold — Dispatch Required', 3),
  ('Dispatched — Delivery Required', 4),
  ('Delivered — Invoice Required', 5),
  ('Invoiced — Closed', 6),
  ('State Unknown', 7);

insert into equipment_types (name) values
  ('Drop Frame Pup'),
  ('Straight Rail Pup'),
  ('Long Straight Rail'),
  ('Aluminum Container'),
  ('Steel Container'),
  ('Chassis'),
  ('Tractor'),
  ('Switcher'),
  ('Converter Dolly'),
  ('Composite'),
  ('FRP');

insert into title_types (name) values ('Original'), ('Bill of Sale'), ('None');

insert into party_groups (name) values
  ('Trailer Buyer'), ('Trailer Supplier'), ('Freight'), ('Rail Freight'), ('HUB'), ('Other');

-- trailer_makes is seeded from the §7 cleanup crosswalk during migration build
-- (canonical spellings only — one Kwik-Load, one Freightliner).
