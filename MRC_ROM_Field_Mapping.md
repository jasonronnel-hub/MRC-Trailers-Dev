# MRC Trailers & Containers — ROM Data Migration Blueprint

**Prepared:** August 24, 2026
**Source:** Restored ROM database backup ("june 2026 trailers backup", SQL Server, 10.2 GB, unencrypted)
**Purpose:** Field-level mapping from ROM's schema to a replacement system's data model. Intended audience: software developer or platform vendor (e.g., ReSpark) scoping the migration.

---

## 1. Executive Summary

MRC's trailer-division data is **fully portable**. The ROM backup restored cleanly into standard Microsoft SQL Server with no encryption, no vendor keys, and no proprietary format barriers. The database (internally named `RecyclingDB`) contains 839 tables, of which roughly a dozen hold everything the Trailers & Containers division needs. The rest is general scrap-yard ERP surface area (retail scale operations, ATM hardware, glass CRV, furnace processing) that the division does not use.

Key quantities as of the June 2026 backup:

| Entity | ROM Table | Rows |
|---|---|---|
| Broker Weight Tickets — ALL MRC brokerage divisions combined | BrokerWTHDR | 108,617 |
| **— of which Trailers & Containers division (CompanyID 7675), validated** | BrokerWTHDR ⋈ TrailerDetails | **23,081** |
| Ticket line detail (weights) | BrokerWTDTL | 118,681 |
| Trailer-specific attributes | TrailerDetails | 89,591 |
| Dealers (buyers AND suppliers AND haulers, all in one table) | EntDealers | 5,839 |
| Dealer contacts | EntContacts | 3,037 |
| Sales/purchase order headers | OrderHeader | 25,831 |
| Order line items (pricing) | OrderDetails | 74,202 |
| Notes (attached to any object) | romNotes | 117,826 |
| Invoices | Invoice / InvoiceDetail | 151,940 / 431,895 |
| Dispatch records | EntDispatch + related | ~28,000 combined |
| Hauler/freight movement info | HaulInfo | 98,991 |

The database was running on an old SQL Server engine version (2008-era file format, upgraded on restore), consistent with an aging on-premises deployment.

---

## 2. Core Concept: the Broker Weight Ticket

ROM models each physical unit (trailer, container, dolly, tractor, switcher) as one **BrokerWTHDR** row — the BWT. A single BWT carries both transaction legs:

- **Purchase side:** `PurchDealerID` (fleet customer: FedEx, Walmart, UP…), `PurchOrderID`, `PurchCustRef`
- **Sale side:** `SaleDealerID` (scrap yard), `SaleOrderID`, `SaleCustRef`

Trailer-specific attributes live in **TrailerDetails**. The join — extracted from ROM's own views and **validated against live data** — is:

```sql
FROM BrokerWTHDR h
JOIN TrailerDetails td
  ON  td.pTransID       = h.BrokerWTID
  AND td.pObjCompanyID  = h.CompanyID
  AND td.pObjID         = 915   -- ROM internal object constant
  AND td.pObjTypeID     = 8     -- ROM internal object-type constant
WHERE td.UnitNum <> '' OR td.VIN <> ''   -- excludes blank stubs auto-created for other divisions
```

**Critical scoping facts:** the BWT table serves ALL of MRC's brokerage divisions (the newest tickets in the June backup are aluminum-export deals from CompanyID 7677). The Trailers & Containers division is **CompanyID 7675**, and blank TrailerDetails stubs exist for non-trailer tickets — hence the UnitNum/VIN filter. The validated trailer-division migration scope is **23,081 tickets**, not the raw 108,617. Weights live in **BrokerWTDTL** (`Gross`, `Tare`, `Net`, plus `ConfirmedGross/Tare/Net` for the scale-verified values — the mechanism behind Catherine's weight spot-check).

A replacement system should preserve this one-record-per-unit, both-legs-linked design. It matches how the division actually thinks ("the BWT ties purchase, sale, dispatch, delivery, and invoice together").

---

## 3. Field Mapping — Units

Target model: `Unit` (prototype naming shown; rename freely).

| New field | ROM source | Notes |
|---|---|---|
| id (BWT #) | BrokerWTHDR.BrokerWTID | Preserve original IDs for history/audit continuity |
| unitNumber | TrailerDetails.UnitNum | Fleet operator's stenciled number |
| altUnitNumber | TrailerDetails.AltUnitNum | **Missing from prototype — add.** Walmart bid sheets carry it |
| vin | TrailerDetails.VIN | The true unique identifier |
| equipmentType | TrailerDetails.TrailerSizeID → TrailerSizes | **Dirty lookup — see §7.** Needs mapping table during migration |
| make | TrailerDetails.TrailerMakeID → TrailerMakes | **Dirty lookup — see §7** |
| year | TrailerDetails.TrailerYear | |
| status | TrailerDetails.ReadyState → TrailerStatus | Clean 7-value enum — see §6. **Live-data caveat:** ReadyState is frequently NULL on units not yet worked; migration should map NULL → "Purchased not ready" |
| readyDate | TrailerDetails.ReadyDate | |
| dispatchDate | TrailerDetails.DispatchDate | |
| scheduledDate | TrailerDetails.SchedDate | |
| pickupDate | TrailerDetails.PickUpDate | |
| completionDate | TrailerDetails.CompletionDate | |
| missingFlag | TrailerDetails.MIA | Units lost track of — keep this, it's operationally real |
| titleType | TrailerDetails.TitleTypeID → TrailerTitleTypes | 1 = Original, 2 = Bill of Sale |
| titleReceived / date | TrailerDetails.TitleRec, TitleRecDate | |
| titleSentDate | TrailerDetails.TitleSentDate | Supports the overnight-title workflow |
| titleTrackingNum | TrailerDetails.TitleTrackingNum | **Missing from prototype — add.** FedEx/UPS tracking for shipped titles |
| purchasedFrom | BrokerWTHDR.PurchDealerID → EntDealers | The fleet source |
| purchaseOrder | BrokerWTHDR.PurchOrderID | |
| soldTo | BrokerWTHDR.SaleDealerID → EntDealers | The scrap-yard buyer |
| salesOrder | BrokerWTHDR.SaleOrderID → OrderHeader | **Live-data caveat:** 0 (not NULL) on unsold units, and some Completed/sold units also show 0 — sale linkage for those may live in BrokerWTDTL.SOID or OrderAssign; verify during migration build |
| hauler | BrokerWTHDR.HaulerID → EntDealers | Haulers are dealers too (group = Freight) |
| dispatchRef | BrokerWTHDR.DispatchID → EntDispatch | |
| ticketNotes | BrokerWTHDR.TicketNotes (250 ch) + romNotes rows | See §5 |
| grossWt / tareWt / netWt | BrokerWTDTL.Gross / Tare / Net | Plus AdjWT + AdjReason for adjustments |
| confirmedWt (scale) | BrokerWTDTL.ConfirmedGross/Tare/Net | The verified numbers Catherine invoices against |
| voided | BrokerWTHDR.Void / BrokerWTDTL.DTLVoid | Respect voids when migrating — don't import voided tickets as live |

---

## 4. Field Mapping — Buyers, Suppliers, Haulers

ROM keeps **everyone** in one table (`EntDealers`) and distinguishes roles by `DealerGroupID`. The division's relevant groups (from EntDealerGroups): **21 = Trailer Buyer**, **22 = Trailer Supplier** (FedEx, Walmart, UP…), **13 = Freight** (haulers), **14 = HUB**, **18 = Rail Freight**.

Recommendation for the new system: keep one "party" table with role tags rather than separate buyer/supplier/hauler tables — it matches reality (the same company can be several things) and simplifies migration.

| New field | ROM source | Notes |
|---|---|---|
| name | EntDealers.CompanyName | |
| role/group | EntDealers.DealerGroupID → EntDealerGroups | Filter migration to groups 13/14/18/21/22 + any dealer referenced by a trailer BWT |
| billingAddress | EntDealers.BillingAddress (+ City/State/ZipCode) | |
| deliveryAddress | EntDealers.DeliveryAddress | |
| phone(s) | EntDealers.Phone1–3 (+types) | |
| email | EntDealers.Email (500 ch — may hold multiple addresses) | |
| paymentTerms | EntDealers.PaymentTerms, TermsType, TermsDays | |
| creditLimit | EntDealers.CreditLimit | |
| generalNotes | EntDealers.Notes (250 ch) | |
| purchaseHotNotes | EntDealers.PurchaseHotNotes | Pop-up style warnings |
| truckingNotes | EntDealers.TruckingNotes | **Kim's field** on the dealer record |
| wire/ACH details | EntDealers.Wire* (16 columns) | **Sensitive — see §8.** Bank account data present in plain columns |
| active | EntDealers.Active | Migrate inactive dealers as archived, not deleted |
| contacts | EntContacts (by DealerID) | ContactName, EmailAddress, Notes, TruckingNotes (1,000 ch), LastCallDate |

Not structured anywhere in ROM (lives in notes/email per the operations manual — the new system should make these first-class fields):

- **Deduction model** (no-deduction vs. standard vs. variable) and the standard deduction schedule per buyer
- **Destruction agreement** signed date (currently a note Kim keeps on the account)
- **REMA membership**

---

## 5. Notes — three layers, all in scope

Notes are load-bearing at MRC (Kim's references, Catherine's invoicing flags, TJ's pasted confirmation emails). ROM stores them in three places, all of which must migrate:

1. **Inline short fields:** BrokerWTHDR.TicketNotes, EntDealers.Notes/PurchaseHotNotes/TruckingNotes, OrderHeader.OrderNotes (1,250 ch — where confirmation emails get pasted), OrderDetails.ItemText/ItemNotes.
2. **romNotes** (117,826 rows): polymorphic notes attached to any object via `pObjID`/`pObjTypeID`. Unlimited length (`NoteText nvarchar(max)`), typed (`NoteTypeID` → romNoteTypes, 28 types), with flags that encode behavior: `PopUpNote` (forces display), `InternalNote`, `ItemNote`. Authored/edited/voided metadata included.
3. **romAttachments** (1,667 rows): file attachments linked the same way.

Migration rule: preserve note authorship and dates; map PopUpNote to an equivalent "must-see" mechanism in the new system (this is how warnings like "no deductions — call TJ" actually reach the team today).

---

## 6. Enum Decodes

**TrailerStatus (ReadyState)** — note the IDs run in reverse pipeline order:

| ID | ROM label | Pipeline position |
|---|---|---|
| 6 | Purchased not ready | 1st |
| 5 | Ready - Sales Required | 2nd |
| 4 | Sold - Dispatch Required | 3rd |
| 3 | Dispatched - Delivery Required | 4th |
| 2 | Delivered Invoice Required | 5th |
| 1 | Complete | 6th |
| 7 | State Unknown | error state |

**TrailerTitleTypes:** 1 = Original, 2 = Bill of Sale.

**BrokerDelivStatus:** At sea / In transit (export legacy; likely irrelevant to trailers).

**EntDealerGroups:** 31 groups; trailer-relevant = 13 Freight, 14 HUB, 18 Rail Freight, 21 Trailer Buyer, 22 Trailer Supplier.

---

## 7. Data-Quality Findings (migration will need a cleanup pass)

The two trailer lookup tables are free-entry and polluted. This is normal for a decade-old ERP but must be planned for:

**TrailerSizes (71 rows)** mixes real sizes (53, 48, 45, 28, 28df, 33, dolly, switcher, Tractor, Chassis) with junk: numeric weights entered as sizes (107, 185, 412…), item codes ("7048-48TRAIL", "7054-53SR", "7703-53STCON"), a make ("Hyundai"), and free-text noise ("Type", "0.01", "Rush Location", "Has scrap metal on it", "No Title", two full VINs).

**TrailerMakes (56 rows)** contains at least six spellings of Kwik-Load ("kwick loc", "Kwic Loc", "kwik lock", "Kwik Lok", "Kwick Loc", "Kiwk Loc"), plus "Frieghtliner"/"Frightliner", "?", "-", "Make", and two VINs entered as makes.

Migration implications:

1. Build a **crosswalk table** (old ID → clean canonical value) for sizes and makes; roughly 70 + 56 rows to hand-review — an hour of work that prevents a decade of dirty data from seeding the new system.
2. The new system should use **controlled dropdowns** (admin-managed lists), not free entry, for equipment type, size, and make. This single change eliminates the root cause.
3. Expect similar cleanup in city/location fields.

---

## 8. Sensitive Data Inventory (for the security design)

Found in the schema and relevant to the "MRC eyes-only" requirement:

- **EntDealers.Wire\*** — 16 columns of bank/wire/ACH details for dealers, in plain table columns.
- **EntDealers.FederalID / DLNum** — tax IDs and driver's license numbers.
- **EntContacts.PersonalInfo / BirthDay** — personal contact data.
- Dealer balances and credit data (CreditLimit, DealerCurrentBalance on tickets).

Requirements this implies for the replacement (server-side, not client-side):

1. Role-based access: dispatch/logistics roles should not see banking columns; invoicing sees financials; sales sees pricing but not bank details.
2. Encrypt banking identifiers at rest; restrict to the payment workflow.
3. Audit log on reads of sensitive columns.
4. The migration workspace itself (any restored copy of this backup) must be treated as sensitive: controlled machine, deleted after use.

---

## 9. Open Items / Next Steps

1. ~~Sample-data validation~~ — **DONE.** 200-row joined sample validated (real FedEx/Walmart/Hub/UP units, real buyers incl. SA Recycling, Sims, BlueScope, AIM Ottawa). Join and constants confirmed as documented in §2.
2. **OrderDetails semantics:** confirm `UnitsOrdered` is used as the per-unit reference weight (per the operations manual) and `Price` + `WTUM` carry the per-lb/per-ton pricing. (Verifiable from the exported OrderDetails schema + a data pull during migration build.)
3. **Sale linkage for SaleOrderID=0 completed units** (see §3 caveat) — resolve via BrokerWTDTL.SOID / OrderAssign during migration build.
4. **Dispatch & invoice mapping** (Kim's and Catherine's legs): EntDispatch*, HaulInfo, Invoice/InvoiceDetail — map when scoping those modules; schemas already captured in the full-schema export.
5. **Row-count scoping for quotes (corrected):** **23,081 trailer-division tickets**, ~5,839 dealers (filter to trailer-relevant groups), ~26K order headers across divisions. Materially smaller than raw table counts — quote against these numbers.
6. **Cleanup crosswalks** for TrailerSizes and TrailerMakes (§7).

## 10. Archive Inventory (developer handoff package)

Everything needed to redevelop without touching ROM or the raw backup:

| File | Contents |
|---|---|
| MRC_ROM_Field_Mapping.md | This document — the migration blueprint |
| rom_full_schema.txt | Every column of all 839 tables + 1,142 views (1.5 MB) |
| rom_keys_constraints.txt | Foreign keys, check constraints, primary keys |
| rom_procedures_views_triggers.txt | Full T-SQL source of 661 stored procedures, 1,142 views, 176 triggers, 81 functions (10 MB) — the recoverable database-side business logic |
| rom_reference_and_sample.txt | EntInventory item codes + note types, units of measure, terms, order groups |
| rom_trailer_sample2.txt | 200 validated real trailer records proving the join map (SENSITIVE — real data) |
| june 2026 trailers backup (.bak) | The master archive itself (10.2 GB, SENSITIVE) — restorable in ~2 minutes via documented Docker procedure |

Plus, outside this package: the operations manual ("trailers bible") for business process, and the working prototype for target design.

---

*Produced from a restored copy of the June 30, 2026 ROM backup. No live systems were touched. The restored copy should be deleted from the working machine once sample extraction is complete.*
