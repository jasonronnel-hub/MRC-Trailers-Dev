-- ROM TrailerDetails.ReplacementFor. Meant for the old trailer's info when a
-- replacement unit comes in; Kim uses it as the dispatch note ("pick up ASAP",
-- "wheels may be seized up") because ROM had nowhere else. Kept as its own
-- field so it migrates 1:1 and stays searchable; labelled honestly in the UI.
alter table units add column replacement_for text;
alter table staging_units add column replacement_for text;
