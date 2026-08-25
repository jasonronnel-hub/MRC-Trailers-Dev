-- Ton disambiguation (Jason, Aug 2026). The scrap trade prices in three
-- different tons and ROM's own order lines prove all of them matter here
-- (GT on 3,661 trailer-scope lines, NT/NTon on 1,426):
--   per_nt  = net/short ton   = 2,000 lb
--   per_gt  = gross/long ton  = 2,240 lb
--   per_mt  = metric tonne    = 2,204.62262 lb
-- Weights themselves stay stored and entered in POUNDS (canonical);
-- conversion happens only at pricing time.
--
-- Existing 'per_ton' rows were created before the distinction existed and
-- meant the industry-default net ton — migrated to per_nt.

alter table sales_orders drop constraint sales_orders_price_unit_check;
update sales_orders set price_unit = 'per_nt' where price_unit = 'per_ton';
alter table sales_orders add constraint sales_orders_price_unit_check
  check (price_unit in ('per_lb', 'per_nt', 'per_gt', 'per_mt', 'flat'));
