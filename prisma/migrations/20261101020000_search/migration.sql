CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE INDEX medicine_name_search ON "Medicine" USING gin (name gin_trgm_ops);
CREATE INDEX medicine_generic_search ON "Medicine" USING gin (generic gin_trgm_ops);
CREATE INDEX medicine_barcode_search ON "Medicine" USING gin (barcode gin_trgm_ops);
