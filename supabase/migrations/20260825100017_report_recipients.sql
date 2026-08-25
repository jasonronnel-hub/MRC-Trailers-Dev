-- Per-supplier report distribution list (Jason: the inventory report goes to
-- "a super lengthy list of FedEx managers, plus a few at MRC"). Free-text
-- email list in v1, editable on the party form; the report screen turns it
-- into a pre-addressed draft.

alter table parties add column report_recipients text;
