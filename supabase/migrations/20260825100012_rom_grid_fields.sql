-- ROM grid parity (Jason, Aug 2026): fields that exist in ROM's working
-- grids but hadn't been carried into the new system. All additive.
--
--   * purchase_location / sale_location — ROM stores pickup and sale
--     locations as CONTACT records (BrokerWTHDR.ContactID /
--     SoldToContactID); the grid's "Purch Loc" column. 22,651 of 23,081
--     units carry a purchase location.
--   * sale_cust_ref — the "AUG 26" ref on the TICKET itself (grid:
--     SaleCustRef), distinct from the order-level ref.
--   * deliver_wt_ref — ROM's DeliverWTID (varchar ref, 21,323 populated).
--   * purch/sales ticket refs, wt_um — scale-ticket linkage + unit of
--     measure from BrokerWTDTL (WT UM "EA" in the grid).
--   * material_type — grid column; only 335/23,081 populated in ROM, kept
--     for completeness.
-- DeliverToID (int) resolves to neither dealers nor contacts in the backup;
-- it stays in staging only until its meaning is confirmed.

alter table units
  add column purchase_location text,
  add column purchase_location_address text,
  add column sale_location text,             -- merged accounts: the actual yard (Sims rule)
  add column sale_cust_ref text,
  add column deliver_wt_ref text,
  add column purch_ticket_ref text,
  add column sales_ticket_ref text,
  add column wt_um text,
  add column material_type text;

alter table staging_units
  add column type_inv_id text,
  add column type_item_name text,
  add column material_type text,
  add column purch_contact_name text,
  add column purch_contact_address text,
  add column sold_contact_name text,
  add column deliver_to_id text,
  add column deliver_wt_ref text,
  add column po_id text,
  add column purch_ticket_id text,
  add column sales_ticket_id text,
  add column wt_um text;
