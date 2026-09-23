#!/usr/bin/env bash
# ROM extraction (Spec §4 step 2): Docker SQL Server → delimited files.
#
# Usage:  bash scripts/rom/extract.sh
# Env:    ROM_CONTAINER (default mrc-sql), ROM_DB (default MrcTrailers),
#         MSSQL_SA_PASSWORD (default read from the container's env)
#
# Output: exports/*.psv — field delimiter |~| , newlines in text encoded
# as literal \n (decoded by the loader). exports/ is gitignored; these
# files hold REAL data including banking columns. Delete after each
# rehearsal (npm run rom:clean).
set -euo pipefail
cd "$(dirname "$0")/../.."

CONTAINER="${ROM_CONTAINER:-mrc-sql}"
DB="${ROM_DB:-MrcTrailers}"
PASS="${MSSQL_SA_PASSWORD:-$(docker inspect "$CONTAINER" --format '{{range .Config.Env}}{{println .}}{{end}}' | grep '^MSSQL_SA_PASSWORD=' | cut -d= -f2-)}"

mkdir -p exports

run_query() { # $1 = output file, $2 = SQL
  # -y 0 (unlimited nvarchar) forbids -h -1, so headers/dashes come through;
  # real rows always contain the |~| delimiter — keep only those.
  docker exec "$CONTAINER" /opt/mssql-tools18/bin/sqlcmd \
    -S localhost -U sa -P "$PASS" -C -d "$DB" \
    -w 65535 -y 0 \
    -Q "SET NOCOUNT ON; $2" | grep -F '|~|' > "exports/$1"
  echo "  exports/$1: $(wc -l < "exports/$1" | tr -d ' ') rows"
}

# T(col): text column → trimmed, newline-encoded, null-safe.
# D(col): datetime → ISO. N(col): numeric → plain string.
# These are inlined below because sqlcmd has no macro facility.
# CHAR(92)+'n' builds the literal backslash-n in SQL itself — a plain \n here
# would be eaten by printf's escape handling and re-emit a real newline.
TXT="REPLACE(REPLACE(REPLACE(ISNULL(CAST(%s AS nvarchar(max)),''),CHAR(13),''),CHAR(10),CHAR(92)+'n'),'|~|','|-|')"
DT="ISNULL(CONVERT(varchar(23),%s,126),'')"
NUM="ISNULL(CONVERT(varchar(30),CAST(%s AS decimal(18,3))),'')"
INT="ISNULL(CONVERT(varchar(20),%s),'')"

t() { printf "$TXT" "$1"; }
d() { printf "$DT"  "$1"; }
n() { printf "$NUM" "$1"; }
i() { printf "$INT" "$1"; }

SEP="+'|~|'+"

SCOPE="scoped AS (
  SELECT h.BrokerWTID, h.CompanyID, h.Void, h.PurchDealerID, h.PurchOrderID, h.PurchCustRef,
         h.SaleDealerID, h.SaleOrderID, h.SaleCustRef, h.HaulerID, h.DispatchID, h.TicketNotes,
         h.ContactID, h.SoldToContactID, h.DeliverToID, h.DeliverWTID, h.CreatedDate,
         td.UnitNum, td.AltUnitNum, td.VIN, td.TrailerSizeID, td.TrailerMakeID, td.TrailerYear,
         td.TrailerTypeInvID, td.MaterialTypeID,
         td.ReadyState, td.ReadyDate, td.SchedDate, td.DispatchDate, td.PickUpDate, td.CompletionDate,
         td.MIA, td.TitleTypeID, td.TitleRec, td.TitleRecDate, td.TitleSentDate, td.TitleTrackingNum,
         td.ReplacementFor
  FROM dbo.BrokerWTHDR h
  JOIN dbo.TrailerDetails td
    ON td.pTransID = h.BrokerWTID AND td.pObjCompanyID = h.CompanyID
   AND td.pObjID = 915 AND td.pObjTypeID = 8
  WHERE (td.UnitNum <> '' OR td.VIN <> '')
)"

echo "Extracting from $CONTAINER/$DB …"

# One-time helper index on the restored copy (rehearsal DB only — never the
# live ROM server): makes the invoice-linkage lookup a seek instead of a scan.
docker exec "$CONTAINER" /opt/mssql-tools18/bin/sqlcmd \
  -S localhost -U sa -P "$PASS" -C -d "$DB" \
  -Q "IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name='ix_mrc_owt' AND object_id=OBJECT_ID('dbo.InvoiceDetail'))
      CREATE INDEX ix_mrc_owt ON dbo.InvoiceDetail(OurWeightTicket, TicketCompanyID)
      INCLUDE (InvoiceID, InvoiceType, CompanyID, DTLVoid);" >/dev/null

# ---- units (the validated 23,081-row join + first non-void weight line) ----
run_query units.psv ";WITH $SCOPE
SELECT $(i s.BrokerWTID)$SEP$(i s.CompanyID)$SEP$(i s.Void)$SEP$(t s.UnitNum)$SEP$(t s.AltUnitNum)$SEP$(t s.VIN)$SEP$(i s.TrailerSizeID)$SEP$(i s.TrailerMakeID)$SEP$(i s.TrailerYear)$SEP$(i s.ReadyState)$SEP$(d s.ReadyDate)$SEP$(d s.SchedDate)$SEP$(d s.DispatchDate)$SEP$(d s.PickUpDate)$SEP$(d s.CompletionDate)$SEP$(i s.MIA)$SEP$(i s.TitleTypeID)$SEP$(i s.TitleRec)$SEP$(d s.TitleRecDate)$SEP$(d s.TitleSentDate)$SEP$(t s.TitleTrackingNum)$SEP$(i s.PurchDealerID)$SEP$(i s.PurchOrderID)$SEP$(t s.PurchCustRef)$SEP$(i s.SaleDealerID)$SEP$(i s.SaleOrderID)$SEP$(t s.SaleCustRef)$SEP$(i s.HaulerID)$SEP$(i s.DispatchID)$SEP$(t s.TicketNotes)$SEP$(n dd.Gross)$SEP$(n dd.Tare)$SEP$(n dd.Net)$SEP$(n dd.AdjWT)$SEP$(t dd.AdjReason)$SEP$(n dd.ConfirmedGross)$SEP$(n dd.ConfirmedTare)$SEP$(n dd.ConfirmedGross-dd.ConfirmedTare)$SEP$(i dd.SOID)$SEP$(i s.TrailerTypeInvID)$SEP$(t inv.ItemName)$SEP$(t mt.Description)$SEP$(t pc.ContactName)$SEP$(t pc.Address)$SEP$(t sc.ContactName)$SEP$(i s.DeliverToID)$SEP$(t s.DeliverWTID)$SEP$(i dd.POID)$SEP$(i dd.PurchTicketID)$SEP$(i dd.SalesTicketID)$SEP$(t dd.WTUM)$SEP$(i ivd.InvoiceID)$SEP$(d s.CreatedDate)$SEP$(t s.ReplacementFor)
FROM scoped s
OUTER APPLY (SELECT TOP 1 * FROM dbo.BrokerWTDTL d
             WHERE d.BrokerWTID = s.BrokerWTID AND d.CompanyID = s.CompanyID AND d.DTLVoid = 0
             ORDER BY d.LineID) dd
OUTER APPLY (SELECT TOP 1 x.InvoiceID FROM dbo.InvoiceDetail x
             JOIN dbo.Invoice iv2 ON iv2.InvoiceID = x.InvoiceID AND iv2.InvoiceType = x.InvoiceType AND iv2.CompanyID = x.CompanyID
             WHERE x.OurWeightTicket = s.BrokerWTID AND x.TicketCompanyID = s.CompanyID
               AND x.DTLVoid = 0 AND iv2.CustomerID = s.SaleDealerID
             ORDER BY x.InvoiceID DESC) ivd
LEFT JOIN dbo.EntInventory inv ON inv.InventoryID = s.TrailerTypeInvID
LEFT JOIN dbo.MaterialType mt ON mt.MaterialTypeID = s.MaterialTypeID AND mt.CompanyID = s.CompanyID
LEFT JOIN dbo.EntContacts pc ON pc.ContactID = s.ContactID
LEFT JOIN dbo.EntContacts sc ON sc.ContactID = s.SoldToContactID"

# ---- dealers (trailer groups + anyone referenced by a scoped ticket) ----
run_query dealers.psv ";WITH $SCOPE
SELECT $(i e.DealerID)$SEP$(t e.CompanyName)$SEP$(i e.DealerGroupID)$SEP$(t e.BillingAddress)$SEP$(t e.City)$SEP$(t e.State)$SEP$(t e.ZipCode)$SEP$(t e.Phone1)$SEP$(t e.Email)$SEP$(t e.PaymentTerms)$SEP$(i e.TermsType)$SEP$(i e.TermsDays)$SEP$(n e.CreditLimit)$SEP$(t e.Notes)$SEP$(t e.PurchaseHotNotes)$SEP$(t e.TruckingNotes)$SEP$(i e.Active)$SEP$(t e.FederalID)$SEP$(t e.WireBenefBank)$SEP$(t e.WireABANum)$SEP$(t e.WireBankCredit)$SEP$(t e.WireBankAcctNum)$SEP$(t e.WireBankAcctName)$SEP$(t e.WireBankMoreInfo)$SEP$(t e.WireAddBeneficiary)$SEP$(t e.WireBenefBankInfo)$SEP$(t e.WireBenefAcctNum)$SEP$(t e.WireBenefAcctName)$SEP$(t e.WireBenefABA)$SEP$(t e.WireInterABA)$SEP$(t e.WireInterAcctNum)$SEP$(t e.WireInterAcctName)$SEP$(t e.WireInterBank)$SEP$(t e.WireInterBankInfo)
FROM dbo.EntDealers e
WHERE e.DealerGroupID IN (13,14,18,21,22)
   OR e.DealerID IN (SELECT PurchDealerID FROM scoped UNION SELECT SaleDealerID FROM scoped UNION SELECT HaulerID FROM scoped)"

# ---- contacts (for exported dealers) ----
run_query contacts.psv ";WITH $SCOPE
SELECT $(i c.ContactID)$SEP$(i c.DealerID)$SEP$(t c.ContactName)$SEP$(t c.EmailAddress)$SEP$(t c.Phone1)$SEP$(t c.Notes)$SEP$(t c.TruckingNotes)$SEP$(i c.IsDefaultContact)$SEP$(i c.Active)
FROM dbo.EntContacts c
WHERE c.DealerID IN (
  SELECT DealerID FROM dbo.EntDealers WHERE DealerGroupID IN (13,14,18,21,22)
  UNION SELECT PurchDealerID FROM scoped UNION SELECT SaleDealerID FROM scoped UNION SELECT HaulerID FROM scoped)"

# ---- orders (referenced by scoped tickets, either leg, incl. BrokerWTDTL.SOID) ----
run_query orders.psv ";WITH $SCOPE
SELECT $(i o.OrderID)$SEP$(i o.CompanyID)$SEP$(i o.CustomerID)$SEP$(i o.OrderType)$SEP$(d o.OrderDate)$SEP$(d o.CreatedDate)$SEP$(t o.ExternalOrderNum)$SEP$(t o.OrderNotes)$SEP$(t o.Terms)$SEP$(d o.ClosedDate)$SEP$(i o.Void)$SEP$(t od.ItemText)$SEP$(t od.UMID)$SEP$(t od.WTUM)$SEP$(n od.UnitsOrdered)$SEP$(n od.Price)$SEP$(i od.InventoryID)
FROM dbo.OrderHeader o
OUTER APPLY (SELECT TOP 1 * FROM dbo.OrderDetails x
             WHERE x.OrderID = o.OrderID AND x.CompanyID = o.CompanyID
             ORDER BY x.OrderDetailID) od
WHERE o.OrderID IN (
  SELECT SaleOrderID FROM scoped WHERE SaleOrderID > 0
  UNION SELECT PurchOrderID FROM scoped WHERE PurchOrderID > 0
  UNION SELECT d.SOID FROM dbo.BrokerWTDTL d JOIN scoped s2 ON d.BrokerWTID = s2.BrokerWTID AND d.CompanyID = s2.CompanyID WHERE d.SOID > 0)"

# Invoice amount: ROM keeps no total on the header (TransactionTotal is
# null everywhere) — it is the sum of the settlement lines: per-each price,
# or settle weight in the line's unit (LB / NT / GT / MT) x settle price.
# Matched the one trailer invoice with a recorded payment to the cent;
# CONFIRM WITH KATHERINE before cutover.
# ---- invoices (headers for every invoice a scoped unit's sale line points at) ----
run_query invoices.psv ";WITH $SCOPE,
linked AS (
  SELECT DISTINCT x.InvoiceID, x.InvoiceType, x.CompanyID
  FROM scoped sc2
  JOIN dbo.InvoiceDetail x ON x.OurWeightTicket = sc2.BrokerWTID
   AND x.TicketCompanyID = sc2.CompanyID AND x.DTLVoid = 0
  JOIN dbo.Invoice iv2 ON iv2.InvoiceID = x.InvoiceID AND iv2.InvoiceType = x.InvoiceType AND iv2.CompanyID = x.CompanyID
   AND iv2.CustomerID = sc2.SaleDealerID)
SELECT $(i i.InvoiceID)$SEP$(i i.CompanyID)$SEP$(i i.CustomerID)$SEP$(d i.InvoiceDate)$SEP$(d i.DueDate)$SEP$(t i.Terms)$SEP$(i i.isOpen)$SEP$(d i.PaymentRecDate)$SEP$(n i.CashPaid)$SEP$(n i.CheckPaid)$SEP$(n i.WirePaid)$SEP$(i i.CheckNumber)$SEP$(t i.PaymentRef)$SEP$(i i.Void)$SEP$(t i.Notes)$SEP$(n "(SELECT SUM(CASE WHEN x.PriceUM IN ('EA','Each') THEN x.SettlePrice WHEN x.PriceUM='LB' THEN x.SettleWTTotal*x.SettlePrice WHEN x.PriceUM='GT' THEN x.SettleWTTotal/2240.0*x.SettlePrice WHEN x.PriceUM IN ('MT','MTon') THEN x.SettleWTTotal/2204.62262*x.SettlePrice WHEN x.PriceUM IN ('NT','NTon','TON') THEN x.SettleWTTotal/2000.0*x.SettlePrice END) FROM dbo.InvoiceDetail x WHERE x.InvoiceID=i.InvoiceID AND x.InvoiceType=i.InvoiceType AND x.CompanyID=i.CompanyID AND x.DTLVoid=0)")
FROM dbo.Invoice i JOIN linked l
  ON l.InvoiceID = i.InvoiceID AND l.InvoiceType = i.InvoiceType AND l.CompanyID = i.CompanyID"

# ---- notes (attached to scoped units, or to exported dealers) ----
run_query notes.psv ";WITH $SCOPE
SELECT $(i n.romNoteID)$SEP$(i n.romNoteDetailID)$SEP$(i n.NoteTypeID)$SEP$(t nt.NoteTypeDesc)$SEP$(i n.DealerID)$SEP$(i n.pObjCompanyID)$SEP$(i n.pObjID)$SEP$(i n.pObjTypeID)$SEP$(i n.pTransID)$SEP$(i n.ObjectID)$SEP$(i n.ObjectTypeID)$SEP$(i n.InternalNote)$SEP$(i n.PopUpNote)$SEP$(i n.ItemNote)$SEP$(i n.CreatedByID)$SEP$(d n.CreatedDate)$SEP$(d n.LastEditedDate)$SEP$(i n.Void)$SEP$(t n.NoteText)
FROM dbo.romNotes n
LEFT JOIN dbo.romNoteTypes nt ON nt.NoteTypeID = n.NoteTypeID AND nt.CompanyID = n.CompanyID
WHERE (n.pObjID = 915 AND n.pObjTypeID = 8 AND n.pTransID IN (SELECT BrokerWTID FROM scoped))
   OR (n.pObjID = 937 AND n.pObjTypeID = 8 AND n.pTransID IN (
        SELECT SaleOrderID FROM scoped WHERE SaleOrderID > 0
        UNION SELECT PurchOrderID FROM scoped WHERE PurchOrderID > 0))
   OR (n.DealerID > 0 AND n.DealerID IN (
        SELECT DealerID FROM dbo.EntDealers WHERE DealerGroupID IN (13,14,18,21,22)
        UNION SELECT PurchDealerID FROM scoped UNION SELECT SaleDealerID FROM scoped UNION SELECT HaulerID FROM scoped))"

echo "Done. Files in exports/ — REAL DATA, delete after the rehearsal (npm run rom:clean)."
