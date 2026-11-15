-- Imported original invoices and supplier openings remain append-only.
CREATE TRIGGER historicalinvoice_immutable BEFORE UPDATE OR DELETE ON "HistoricalInvoice"
FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
