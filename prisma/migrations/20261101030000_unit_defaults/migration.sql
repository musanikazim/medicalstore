ALTER TABLE "Medicine" ADD COLUMN "purchaseUnit" TEXT NOT NULL DEFAULT 'box' CHECK ("purchaseUnit" IN ('base','strip','box')), ADD COLUMN "sellingUnit" TEXT NOT NULL DEFAULT 'base' CHECK ("sellingUnit" IN ('base','strip','box'));
ALTER TABLE "Movement" ADD COLUMN "effectiveDate" TEXT NOT NULL DEFAULT '';
-- Existing ledger rows remain unchanged; blank effective date means createdAt.
