-- ROM Invoice.TransactionTotal → invoices.amount (open invoices had no amount).
alter table staging_invoices add column transaction_total text;
