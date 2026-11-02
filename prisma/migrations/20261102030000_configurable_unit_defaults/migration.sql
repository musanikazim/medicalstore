-- Replace legacy enum-like checks so product-specific UOM identifiers are accepted.
-- The application validates these against ProductUnit inside the same transaction.
ALTER TABLE "Medicine" DROP CONSTRAINT "Medicine_purchaseUnit_check";
ALTER TABLE "Medicine" DROP CONSTRAINT "Medicine_sellingUnit_check";
ALTER TABLE "Medicine" ADD CONSTRAINT medicine_default_units_nonempty CHECK(length("purchaseUnit")>0 AND length("sellingUnit")>0);
