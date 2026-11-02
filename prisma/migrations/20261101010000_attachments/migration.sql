CREATE TABLE "Attachment" (
 id TEXT PRIMARY KEY,
 "purchaseId" TEXT UNIQUE NOT NULL REFERENCES "Purchase"(id),
 filename TEXT NOT NULL,
 mime TEXT NOT NULL CHECK (mime IN ('application/pdf','image/png','image/jpeg')),
 data BYTEA NOT NULL CHECK (octet_length(data)<=1048576),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
