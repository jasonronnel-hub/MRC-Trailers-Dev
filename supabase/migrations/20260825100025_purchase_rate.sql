-- Bulk purchase uploads carry a rate as well as a price (Jason's intake list:
-- "purchase amounts ... purchase rate"). Additive.
alter table units
  add column purchase_rate numeric,
  add column purchase_rate_unit text check (purchase_rate_unit in ('per_lb', 'per_nt', 'per_gt', 'per_mt', 'flat'));
