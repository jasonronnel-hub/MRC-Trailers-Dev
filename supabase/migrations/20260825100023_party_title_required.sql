-- Buyer requirement TJ currently writes for Kim as a free-text note when he
-- sets up a new yard: some buyers will not accept a unit unless the title
-- travels with the delivery. Structured so it surfaces on the buyer record,
-- the sell step, the dispatch drawer, and the release paperwork.
alter table parties
  add column if not exists title_required_with_delivery boolean not null default false;
