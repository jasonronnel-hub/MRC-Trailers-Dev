-- Sections 2.3 + 2.4. sales_orders comes first because units references it.

create table sales_orders (
  id bigint generated always as identity primary key,
  legacy_order_id int unique,
  order_number text unique,                 -- SO-1042 style, generated
  buyer_party_id bigint references parties not null,
  customer_reference text,                  -- 'AUG 26' convention — enforce format in UI
  item_code text, price numeric,
  price_unit text check (price_unit in ('per_lb','per_ton','flat')),
  ref_weight_lbs int,                       -- Catherine's spot-check flag
  header_notes text,                        -- pasted confirmation emails live here
  detail_notes text,
  open boolean default true, closed_at timestamptz,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz default now(), updated_at timestamptz default now()
);

-- Section 2.3: one row per physical unit (ROM's BWT merged with TrailerDetails).
create table units (
  id bigint generated always as identity primary key,
  legacy_bwt_id int unique,                 -- BrokerWTHDR.BrokerWTID
  unit_number text, alt_unit_number text,
  vin text,                                 -- ROM data has 'N/A' and blanks — allow null, index non-null
  equipment_type_id int references equipment_types,
  make_id int references trailer_makes, model_year int,
  status_id int references unit_statuses not null default 1,  -- NULL ReadyState in ROM → Purchased Not Ready
  source_party_id bigint references parties,      -- FedEx, Walmart, UP, Hub, JB Hunt, Milestone
  purchase_order_ref text, purchase_price numeric,
  pickup_location_code text, pickup_address text, physical_location text,
  condition_comments text,
  ready_date date, scheduled_date date, dispatch_date date,
  pickup_date date, completion_date date,
  missing boolean default false,            -- TrailerDetails.MIA
  title_type_id int references title_types,
  title_received boolean default false, title_received_date date,
  title_sent_date date, title_tracking_num text,
  sold_to_party_id bigint references parties,
  sales_order_id bigint references sales_orders,
  hauler_party_id bigint references parties,
  gross_wt numeric, tare_wt numeric, net_wt numeric,
  confirmed_gross numeric, confirmed_tare numeric, confirmed_net numeric,
  ref_weight_lbs int,
  voided boolean default false,
  created_by uuid references auth.users default auth.uid(),
  created_at timestamptz default now(), updated_at timestamptz default now()
);

create index on units(status_id);
create index on units(source_party_id);
create index on units(sold_to_party_id);
create index on units(vin) where vin is not null;
create index on units(sales_order_id);

create trigger touch_sales_orders before update on sales_orders
  for each row execute function touch_updated_at();
create trigger touch_units before update on units
  for each row execute function touch_updated_at();
