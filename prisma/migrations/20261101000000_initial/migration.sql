-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'CASHIER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sessionVersion" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Medicine" (
    "id" TEXT NOT NULL,
    "code" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "generic" TEXT NOT NULL DEFAULT '',
    "manufacturer" TEXT NOT NULL DEFAULT '',
    "category" TEXT NOT NULL DEFAULT '',
    "barcode" TEXT,
    "strength" TEXT NOT NULL DEFAULT '',
    "form" TEXT NOT NULL DEFAULT 'Tablet',
    "baseUnit" TEXT NOT NULL DEFAULT 'tablet',
    "unitsPerStrip" INTEGER NOT NULL DEFAULT 10,
    "stripsPerBox" INTEGER NOT NULL DEFAULT 10,
    "looseAllowed" BOOLEAN NOT NULL DEFAULT true,
    "prescription" BOOLEAN NOT NULL DEFAULT false,
    "purchasePrice" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "salePrice" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "stripPrice" DECIMAL(18,6),
    "boxPrice" DECIMAL(18,6),
    "mrp" DECIMAL(18,6),
    "minimumStock" INTEGER NOT NULL DEFAULT 10,
    "reorderQuantity" INTEGER NOT NULL DEFAULT 100,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Medicine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Supplier" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Supplier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Purchase" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "supplierId" TEXT NOT NULL,
    "supplierInvoice" TEXT NOT NULL,
    "invoiceDate" TEXT NOT NULL,
    "receivingDate" TEXT NOT NULL,
    "remarks" TEXT NOT NULL DEFAULT '',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "charges" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "discount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "postedAt" TIMESTAMP(3),

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PurchaseLine" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "expiry" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "factor" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "bonus" INTEGER NOT NULL DEFAULT 0,
    "unitCost" DECIMAL(18,6) NOT NULL,
    "discount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "sellingPrice" DECIMAL(18,6) NOT NULL,
    "net" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "PurchaseLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Batch" (
    "id" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "purchaseLineId" TEXT,
    "number" TEXT NOT NULL,
    "expiry" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'SELLABLE',
    "quantity" INTEGER NOT NULL,
    "received" INTEGER NOT NULL,
    "cost" DECIMAL(18,6) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Batch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sale" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "discount" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "total" DECIMAL(18,6) NOT NULL,
    "cogs" DECIMAL(18,6) NOT NULL,
    "prescriptionReference" TEXT NOT NULL DEFAULT '',

    CONSTRAINT "Sale_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SaleLine" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "factor" INTEGER NOT NULL,
    "quantity" INTEGER NOT NULL,
    "price" DECIMAL(18,6) NOT NULL,
    "discount" DECIMAL(18,6) NOT NULL,
    "net" DECIMAL(18,6) NOT NULL,
    "cogs" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "SaleLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Allocation" (
    "id" TEXT NOT NULL,
    "saleLineId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "returned" INTEGER NOT NULL DEFAULT 0,
    "cost" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "Allocation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "method" TEXT NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "tendered" DECIMAL(18,6) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Movement" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Movement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ReturnRecord" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "originalId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "cogs" DECIMAL(18,6) NOT NULL,
    "disposition" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReturnRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Audit" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "details" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Audit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Operation" (
    "key" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Operation_pkey" PRIMARY KEY ("key")
);

-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL DEFAULT 'store',
    "data" JSONB NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Medicine_code_key" ON "Medicine"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Medicine_barcode_key" ON "Medicine"("barcode");

-- CreateIndex
CREATE INDEX "Medicine_name_idx" ON "Medicine"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Medicine_name_strength_manufacturer_form_key" ON "Medicine"("name", "strength", "manufacturer", "form");

-- CreateIndex
CREATE UNIQUE INDEX "Supplier_name_key" ON "Supplier"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_number_key" ON "Purchase"("number");

-- CreateIndex
CREATE UNIQUE INDEX "Purchase_supplierId_supplierInvoice_key" ON "Purchase"("supplierId", "supplierInvoice");

-- CreateIndex
CREATE INDEX "Batch_medicineId_status_expiry_idx" ON "Batch"("medicineId", "status", "expiry");

-- CreateIndex
CREATE UNIQUE INDEX "Sale_number_key" ON "Sale"("number");

-- CreateIndex
CREATE INDEX "Movement_batchId_createdAt_idx" ON "Movement"("batchId", "createdAt");

-- CreateIndex
CREATE INDEX "ReturnRecord_type_originalId_idx" ON "ReturnRecord"("type", "originalId");

-- AddForeignKey
ALTER TABLE "Purchase" ADD CONSTRAINT "Purchase_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "Supplier"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseLine" ADD CONSTRAINT "PurchaseLine_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "Purchase"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PurchaseLine" ADD CONSTRAINT "PurchaseLine_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Batch" ADD CONSTRAINT "Batch_purchaseLineId_fkey" FOREIGN KEY ("purchaseLineId") REFERENCES "PurchaseLine"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SaleLine" ADD CONSTRAINT "SaleLine_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_saleLineId_fkey" FOREIGN KEY ("saleLineId") REFERENCES "SaleLine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Allocation" ADD CONSTRAINT "Allocation_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Movement" ADD CONSTRAINT "Movement_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Domain constraints complement server validation.
ALTER TABLE "User" ADD CONSTRAINT user_role CHECK (role IN ('ADMIN','MANAGER','CASHIER'));
ALTER TABLE "Medicine" ADD CONSTRAINT medicine_packaging CHECK ("unitsPerStrip">0 AND "stripsPerBox">0 AND "unitsPerStrip"::bigint*"stripsPerBox"<=10000000), ADD CONSTRAINT medicine_prices CHECK ("purchasePrice">=0 AND "salePrice">=0 AND ("stripPrice" IS NULL OR "stripPrice">=0) AND ("boxPrice" IS NULL OR "boxPrice">=0));
ALTER TABLE "Batch" ADD CONSTRAINT batch_balance CHECK (quantity>=0 AND received>0 AND cost>=0), ADD CONSTRAINT batch_status CHECK(status IN ('SELLABLE','QUARANTINED','RECALLED','DAMAGED'));
ALTER TABLE "Purchase" ADD CONSTRAINT purchase_status CHECK(status IN ('DRAFT','POSTED')), ADD CONSTRAINT purchase_total CHECK(total>=0);
ALTER TABLE "PurchaseLine" ADD CONSTRAINT purchase_quantity CHECK(quantity>0 AND bonus>=0 AND factor>0 AND "unitCost">=0 AND discount>=0 AND net>=0);
ALTER TABLE "Sale" ADD CONSTRAINT sale_total CHECK(total>=0 AND cogs>=0 AND discount>=0);
ALTER TABLE "SaleLine" ADD CONSTRAINT sale_quantity CHECK(quantity>0 AND factor>0 AND price>=0 AND discount>=0 AND net>=0);
ALTER TABLE "Allocation" ADD CONSTRAINT allocation_return CHECK(quantity>0 AND returned>=0 AND returned<=quantity);
ALTER TABLE "Movement" ADD CONSTRAINT movement_quantity CHECK(quantity<>0);
ALTER TABLE "ReturnRecord" ADD CONSTRAINT return_quantity CHECK(quantity>0 AND amount>=0 AND cogs>=0), ADD CONSTRAINT return_batch_fk FOREIGN KEY ("batchId") REFERENCES "Batch"(id);
CREATE FUNCTION prevent_history_mutation() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Posted history is append-only'; END; $$;
CREATE TRIGGER movement_immutable BEFORE UPDATE OR DELETE ON "Movement" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER audit_immutable BEFORE UPDATE OR DELETE ON "Audit" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER sale_immutable BEFORE UPDATE OR DELETE ON "Sale" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER sale_line_immutable BEFORE UPDATE OR DELETE ON "SaleLine" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER payment_immutable BEFORE UPDATE OR DELETE ON "Payment" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER return_immutable BEFORE UPDATE OR DELETE ON "ReturnRecord" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
