-- Additive only: existing draft/posted lines remain unchanged and unacknowledged.
ALTER TABLE "PurchaseLine" ADD COLUMN "ignoreExpiryWarning" BOOLEAN NOT NULL DEFAULT false;
