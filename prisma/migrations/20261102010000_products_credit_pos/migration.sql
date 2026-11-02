-- AlterTable
ALTER TABLE "Medicine" ADD COLUMN     "baseUnitId" TEXT,
ADD COLUMN     "batchTracked" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "brand" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "categoryId" TEXT,
ADD COLUMN     "dosageFormId" TEXT,
ADD COLUMN     "expiryTracked" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "fractionalAllowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "model" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "productTypeId" TEXT,
ADD COLUMN     "serialTracked" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "specification" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "warranty" TEXT NOT NULL DEFAULT '';

-- AlterTable
ALTER TABLE "PurchaseLine" ADD COLUMN     "mrp" DECIMAL(18,6),
ADD COLUMN     "serialNumbers" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "unitLabel" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "factor" SET DATA TYPE DECIMAL(24,6),
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(24,6),
ALTER COLUMN "bonus" SET DEFAULT 0,
ALTER COLUMN "bonus" SET DATA TYPE DECIMAL(24,6);

-- AlterTable
ALTER TABLE "Batch" ADD COLUMN     "mrp" DECIMAL(18,6),
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(24,6),
ALTER COLUMN "received" SET DATA TYPE DECIMAL(24,6);

-- AlterTable
ALTER TABLE "Sale" ADD COLUMN     "cashierName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "creditAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "customerName" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "dueDate" TEXT,
ADD COLUMN     "invoicePrefix" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "notes" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "tax" DECIMAL(18,6) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "SaleLine" ADD COLUMN     "mrp" DECIMAL(18,6),
ADD COLUMN     "tax" DECIMAL(18,6) NOT NULL DEFAULT 0,
ADD COLUMN     "unitLabel" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "factor" SET DATA TYPE DECIMAL(24,6),
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(24,6);

-- AlterTable
ALTER TABLE "Allocation" ADD COLUMN     "serialNumbers" JSONB NOT NULL DEFAULT '[]',
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(24,6),
ALTER COLUMN "returned" SET DEFAULT 0,
ALTER COLUMN "returned" SET DATA TYPE DECIMAL(24,6);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "bankAccountId" TEXT,
ADD COLUMN     "cardLastFour" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "paymentDate" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "reference" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "remarks" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "terminal" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "verification" TEXT NOT NULL DEFAULT 'OPERATOR_RECORDED';

-- AlterTable
ALTER TABLE "Movement" ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(24,6);

-- AlterTable
ALTER TABLE "ReturnRecord" ADD COLUMN     "customerId" TEXT,
ADD COLUMN     "receivableReduction" DECIMAL(18,6) NOT NULL DEFAULT 0,
ADD COLUMN     "refundAmount" DECIMAL(18,6) NOT NULL DEFAULT 0,
ADD COLUMN     "refundMethod" TEXT NOT NULL DEFAULT 'CASH',
ADD COLUMN     "serialNumbers" JSONB NOT NULL DEFAULT '[]',
ALTER COLUMN "quantity" SET DATA TYPE DECIMAL(24,6);

-- CreateTable
CREATE TABLE "MasterData" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameKey" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "data" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MasterData_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProductUnit" (
    "id" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "factor" DECIMAL(24,6) NOT NULL,
    "salePrice" DECIMAL(18,6),
    "fractionalAllowed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProductUnit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockSerial" (
    "id" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "serial" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'AVAILABLE',
    "allocationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockSerial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BankAccount" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bankName" TEXT NOT NULL,
    "accountTitle" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BankAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Customer" (
    "id" TEXT NOT NULL,
    "code" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "mobile" TEXT NOT NULL DEFAULT '',
    "alternateMobile" TEXT NOT NULL DEFAULT '',
    "address" TEXT NOT NULL DEFAULT '',
    "typeId" TEXT,
    "creditEnabled" BOOLEAN NOT NULL DEFAULT false,
    "creditLimit" DECIMAL(18,6),
    "creditDays" INTEGER NOT NULL DEFAULT 30,
    "openingOutstanding" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "advance" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "notes" TEXT NOT NULL DEFAULT '',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Customer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditAccount" (
    "saleId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "original" DECIMAL(18,6) NOT NULL,
    "settled" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "returned" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "dueDate" TEXT NOT NULL,

    CONSTRAINT "CreditAccount_pkey" PRIMARY KEY ("saleId")
);

-- CreateTable
CREATE TABLE "CustomerLedger" (
    "id" TEXT NOT NULL,
    "sequence" SERIAL NOT NULL,
    "customerId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "saleId" TEXT,
    "collectionId" TEXT,
    "debit" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "credit" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "remarks" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CustomerLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Collection" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "advance" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "openingAllocation" DECIMAL(18,6) NOT NULL DEFAULT 0,
    "method" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "reference" TEXT NOT NULL DEFAULT '',
    "paymentDate" TEXT NOT NULL,
    "remarks" TEXT NOT NULL DEFAULT '',
    "cardLastFour" TEXT NOT NULL DEFAULT '',
    "terminal" TEXT NOT NULL DEFAULT '',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Collection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Settlement" (
    "id" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "collectionId" TEXT,
    "amount" DECIMAL(18,6) NOT NULL,
    "kind" TEXT NOT NULL,
    "reference" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Settlement_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CollectionReversal" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CollectionReversal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CreditNote" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" DECIMAL(18,6) NOT NULL,
    "reference" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CreditNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PosDraft" (
    "id" TEXT NOT NULL,
    "number" SERIAL NOT NULL,
    "ownerId" TEXT NOT NULL,
    "customerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "version" INTEGER NOT NULL DEFAULT 1,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PosDraft_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MasterData_kind_nameKey_key" ON "MasterData"("kind", "nameKey");

-- CreateIndex
CREATE UNIQUE INDEX "ProductUnit_medicineId_unitId_key" ON "ProductUnit"("medicineId", "unitId");

-- CreateIndex
CREATE INDEX "StockSerial_batchId_status_idx" ON "StockSerial"("batchId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "StockSerial_medicineId_serial_key" ON "StockSerial"("medicineId", "serial");

-- CreateIndex
CREATE UNIQUE INDEX "Customer_code_key" ON "Customer"("code");

-- CreateIndex
CREATE INDEX "Customer_name_idx" ON "Customer"("name");

-- CreateIndex
CREATE INDEX "Customer_mobile_idx" ON "Customer"("mobile");

-- CreateIndex
CREATE INDEX "CreditAccount_customerId_dueDate_idx" ON "CreditAccount"("customerId", "dueDate");

-- CreateIndex
CREATE UNIQUE INDEX "CustomerLedger_sequence_key" ON "CustomerLedger"("sequence");

-- CreateIndex
CREATE INDEX "CustomerLedger_customerId_sequence_idx" ON "CustomerLedger"("customerId", "sequence");

-- CreateIndex
CREATE UNIQUE INDEX "Collection_number_key" ON "Collection"("number");

-- CreateIndex
CREATE UNIQUE INDEX "CollectionReversal_collectionId_key" ON "CollectionReversal"("collectionId");

-- CreateIndex
CREATE UNIQUE INDEX "PosDraft_number_key" ON "PosDraft"("number");

-- CreateIndex
CREATE INDEX "PosDraft_ownerId_status_idx" ON "PosDraft"("ownerId", "status");

-- AddForeignKey
ALTER TABLE "ProductUnit" ADD CONSTRAINT "ProductUnit_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProductUnit" ADD CONSTRAINT "ProductUnit_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "MasterData"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockSerial" ADD CONSTRAINT "StockSerial_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "Batch"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "Sale"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CreditAccount" ADD CONSTRAINT "CreditAccount_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomerLedger" ADD CONSTRAINT "CustomerLedger_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Collection" ADD CONSTRAINT "Collection_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_saleId_fkey" FOREIGN KEY ("saleId") REFERENCES "CreditAccount"("saleId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Settlement" ADD CONSTRAINT "Settlement_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CollectionReversal" ADD CONSTRAINT "CollectionReversal_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "Collection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Initial editable master data; these are database records, not runtime fixed lists.
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'CATEGORY','Pain Relief','pain relief','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'CATEGORY','Fever','fever','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'CATEGORY','Antibiotics','antibiotics','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'CATEGORY','Allergy','allergy','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'CATEGORY','Vitamins & Supplements','vitamins & supplements','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'CATEGORY','Diabetes','diabetes','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'CATEGORY','Blood Pressure','blood pressure','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'CATEGORY','Gastrointestinal','gastrointestinal','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'CATEGORY','Respiratory','respiratory','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'CATEGORY','Dermatology','dermatology','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'CATEGORY','Surgical Supplies','surgical supplies','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'CATEGORY','Medical Consumables','medical consumables','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'CATEGORY','First Aid','first aid','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'CATEGORY','General Healthcare','general healthcare','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'CATEGORY','General','general','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'CATEGORY','Other','other','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'DOSAGE_FORM','Tablet','tablet','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'DOSAGE_FORM','Capsule','capsule','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'DOSAGE_FORM','Syrup','syrup','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'DOSAGE_FORM','Suspension','suspension','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'DOSAGE_FORM','Oral Solution','oral solution','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'DOSAGE_FORM','Drops','drops','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'DOSAGE_FORM','Sachet','sachet','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'DOSAGE_FORM','Powder','powder','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'DOSAGE_FORM','Granules','granules','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'DOSAGE_FORM','Injection','injection','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'DOSAGE_FORM','Injectable Solution','injectable solution','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'DOSAGE_FORM','Vial','vial','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'DOSAGE_FORM','Ampoule','ampoule','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'DOSAGE_FORM','Infusion','infusion','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'DOSAGE_FORM','Cream','cream','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'DOSAGE_FORM','Ointment','ointment','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'DOSAGE_FORM','Gel','gel','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'DOSAGE_FORM','Lotion','lotion','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'DOSAGE_FORM','Spray','spray','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'DOSAGE_FORM','Inhaler','inhaler','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'DOSAGE_FORM','Nebulizer Solution','nebulizer solution','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'DOSAGE_FORM','Suppository','suppository','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'DOSAGE_FORM','Eye Drops','eye drops','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'DOSAGE_FORM','Ear Drops','ear drops','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'DOSAGE_FORM','Nasal Drops','nasal drops','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'DOSAGE_FORM','Patch','patch','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'DOSAGE_FORM','Other','other','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'PRODUCT_TYPE','Medicine','medicine','{"pharmaceutical": true, "requiresBatch": true, "requiresExpiry": true}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'PRODUCT_TYPE','Injection / Injectable Medicine','injection / injectable medicine','{"pharmaceutical": true, "requiresBatch": true, "requiresExpiry": true}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'PRODUCT_TYPE','IV Fluid / Infusion','iv fluid / infusion','{"pharmaceutical": true, "requiresBatch": true, "requiresExpiry": true}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'PRODUCT_TYPE','Surgical Item','surgical item','{"pharmaceutical": false, "requiresBatch": false, "requiresExpiry": false}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'PRODUCT_TYPE','Medical Consumable','medical consumable','{"pharmaceutical": false, "requiresBatch": false, "requiresExpiry": false}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'PRODUCT_TYPE','Medical Device','medical device','{"pharmaceutical": false, "requiresBatch": false, "requiresExpiry": false}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'PRODUCT_TYPE','General Healthcare Product','general healthcare product','{"pharmaceutical": false, "requiresBatch": false, "requiresExpiry": false}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'PRODUCT_TYPE','Other','other','{"pharmaceutical": false, "requiresBatch": false, "requiresExpiry": false}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'UOM','Tablet','tablet','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'UOM','Capsule','capsule','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'UOM','Strip','strip','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'UOM','Box','box','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'UOM','Ampoule','ampoule','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'UOM','Vial','vial','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'UOM','Piece','piece','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'UOM','Carton','carton','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'UOM','Bottle','bottle','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'UOM','Sachet','sachet','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'UOM','Tube','tube','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'UOM','Pair','pair','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'UOM','Pack','pack','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'UOM','Gram','gram','{"fractionalAllowed": true}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'UOM','Kilogram','kilogram','{"fractionalAllowed": true}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'UOM','Millilitre','millilitre','{"fractionalAllowed": true}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'UOM','Litre','litre','{"fractionalAllowed": true}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'UOM','Metre','metre','{"fractionalAllowed": true}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'CUSTOMER_TYPE','Walk-in','walk-in','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'CUSTOMER_TYPE','Regular','regular','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'CUSTOMER_TYPE','Business','business','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") VALUES (gen_random_uuid()::text,'CUSTOMER_TYPE','Other','other','{}',now()) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") SELECT gen_random_uuid()::text,'CATEGORY',min(btrim("category")),lower(btrim("category")),'{}',now() FROM "Medicine" WHERE btrim("category")<>'' GROUP BY lower(btrim("category")) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") SELECT gen_random_uuid()::text,'DOSAGE_FORM',min(btrim("form")),lower(btrim("form")),'{}',now() FROM "Medicine" WHERE btrim("form")<>'' GROUP BY lower(btrim("form")) ON CONFLICT (kind,"nameKey") DO NOTHING;
INSERT INTO "MasterData" (id,kind,name,"nameKey",data,"updatedAt") SELECT gen_random_uuid()::text,'UOM',min(btrim("baseUnit")),lower(btrim("baseUnit")),'{}',now() FROM "Medicine" WHERE btrim("baseUnit")<>'' GROUP BY lower(btrim("baseUnit")) ON CONFLICT (kind,"nameKey") DO NOTHING;
UPDATE "Medicine" m SET "categoryId"=d.id FROM "MasterData" d WHERE d.kind='CATEGORY' AND d."nameKey"=lower(btrim(m."category"));
UPDATE "Medicine" m SET "dosageFormId"=d.id FROM "MasterData" d WHERE d.kind='DOSAGE_FORM' AND d."nameKey"=lower(btrim(m."form"));
UPDATE "Medicine" m SET "baseUnitId"=d.id FROM "MasterData" d WHERE d.kind='UOM' AND d."nameKey"=lower(btrim(m."baseUnit"));
UPDATE "Medicine" SET "productTypeId"=(SELECT id FROM "MasterData" WHERE kind='PRODUCT_TYPE' AND "nameKey"='medicine');
ALTER TABLE "Medicine" ADD CONSTRAINT medicine_category_fk FOREIGN KEY("categoryId") REFERENCES "MasterData"(id), ADD CONSTRAINT medicine_dosage_fk FOREIGN KEY("dosageFormId") REFERENCES "MasterData"(id), ADD CONSTRAINT medicine_type_fk FOREIGN KEY("productTypeId") REFERENCES "MasterData"(id), ADD CONSTRAINT medicine_base_unit_fk FOREIGN KEY("baseUnitId") REFERENCES "MasterData"(id);
CREATE UNIQUE INDEX master_case_insensitive ON "MasterData" (kind,lower(btrim(name)));
ALTER TABLE "MasterData" ADD CONSTRAINT master_kind CHECK(kind IN ('CATEGORY','DOSAGE_FORM','PRODUCT_TYPE','UOM','CUSTOMER_TYPE'));
ALTER TABLE "ProductUnit" ADD CONSTRAINT unit_factor CHECK(factor>0 AND ("salePrice" IS NULL OR "salePrice">=0));
ALTER TABLE "Customer" ADD CONSTRAINT customer_balances CHECK("openingOutstanding">=0 AND advance>=0 AND ("creditLimit" IS NULL OR "creditLimit">=0) AND "creditDays">=0), ADD CONSTRAINT customer_type_fk FOREIGN KEY("typeId") REFERENCES "MasterData"(id);
ALTER TABLE "CreditAccount" ADD CONSTRAINT receivable_balance CHECK(original>=0 AND settled>=0 AND returned>=0 AND settled+returned<=original);
ALTER TABLE "CustomerLedger" ADD CONSTRAINT ledger_amount CHECK(debit>=0 AND credit>=0 AND ((debit>0 AND credit=0) OR (credit>0 AND debit=0)));
ALTER TABLE "Collection" ADD CONSTRAINT collection_amount CHECK(amount>0 AND advance>=0 AND "openingAllocation">=0 AND advance+"openingAllocation"<=amount);
ALTER TABLE "Settlement" ADD CONSTRAINT settlement_amount CHECK(amount>0);
ALTER TABLE "Sale" ADD CONSTRAINT sale_customer_fk FOREIGN KEY("customerId") REFERENCES "Customer"(id);
ALTER TABLE "Payment" ADD CONSTRAINT payment_bank_fk FOREIGN KEY("bankAccountId") REFERENCES "BankAccount"(id), ADD CONSTRAINT payment_amount CHECK(amount>=0 AND tendered>=0), ADD CONSTRAINT card_last_four CHECK("cardLastFour"='' OR "cardLastFour" ~ '^[0-9]{4}$');
ALTER TABLE "Collection" ADD CONSTRAINT collection_bank_fk FOREIGN KEY("bankAccountId") REFERENCES "BankAccount"(id), ADD CONSTRAINT collection_last_four CHECK("cardLastFour"='' OR "cardLastFour" ~ '^[0-9]{4}$');
ALTER TABLE "StockSerial" ADD CONSTRAINT serial_product_fk FOREIGN KEY("medicineId") REFERENCES "Medicine"(id), ADD CONSTRAINT serial_allocation_fk FOREIGN KEY("allocationId") REFERENCES "Allocation"(id), ADD CONSTRAINT serial_status CHECK(status IN ('AVAILABLE','SOLD','QUARANTINED','DAMAGED','DISPOSED','RECALLED'));
ALTER TABLE "ReturnRecord" ADD CONSTRAINT return_customer_fk FOREIGN KEY("customerId") REFERENCES "Customer"(id);
ALTER TABLE "CreditNote" ADD CONSTRAINT note_customer_fk FOREIGN KEY("customerId") REFERENCES "Customer"(id), ADD CONSTRAINT credit_note_amount CHECK(amount>0);
ALTER TABLE "CustomerLedger" ADD CONSTRAINT ledger_sale_fk FOREIGN KEY("saleId") REFERENCES "Sale"(id), ADD CONSTRAINT ledger_collection_fk FOREIGN KEY("collectionId") REFERENCES "Collection"(id);
ALTER TABLE "PosDraft" ADD CONSTRAINT draft_owner_fk FOREIGN KEY("ownerId") REFERENCES "User"(id), ADD CONSTRAINT draft_customer_fk FOREIGN KEY("customerId") REFERENCES "Customer"(id), ADD CONSTRAINT draft_status CHECK(status IN ('ACTIVE','HELD','COMPLETED','DISCARDED'));
CREATE TRIGGER customerledger_immutable BEFORE UPDATE OR DELETE ON "CustomerLedger" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER collection_immutable BEFORE UPDATE OR DELETE ON "Collection" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER settlement_immutable BEFORE UPDATE OR DELETE ON "Settlement" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER collectionreversal_immutable BEFORE UPDATE OR DELETE ON "CollectionReversal" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
CREATE TRIGGER creditnote_immutable BEFORE UPDATE OR DELETE ON "CreditNote" FOR EACH ROW EXECUTE FUNCTION prevent_history_mutation();
