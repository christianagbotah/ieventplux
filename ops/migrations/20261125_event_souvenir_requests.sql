CREATE TABLE IF NOT EXISTS "EventSouvenirRequest" (
 "id" TEXT PRIMARY KEY,
 "productId" TEXT NOT NULL REFERENCES "EventSouvenirProduct"("id") ON DELETE RESTRICT,
 "buyerId" TEXT NOT NULL,
 "requestKey" TEXT NOT NULL,
 "quantity" INTEGER NOT NULL CHECK ("quantity" BETWEEN 1 AND 20),
 "unitPriceMinor" INTEGER NOT NULL CHECK ("unitPriceMinor" BETWEEN 1 AND 100000000),
 "totalMinor" INTEGER NOT NULL CHECK ("totalMinor" BETWEEN 1 AND 100000000),
 "currency" TEXT NOT NULL CHECK ("currency"='GHS'),
 "productName" TEXT NOT NULL,
 "productSku" TEXT NOT NULL,
 "status" TEXT NOT NULL DEFAULT 'REQUESTED' CHECK ("status" IN ('REQUESTED','ACKNOWLEDGED','DECLINED','WITHDRAWN')),
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 CHECK ("totalMinor"::bigint = "quantity"::bigint * "unitPriceMinor"::bigint),
 UNIQUE ("productId","buyerId","requestKey")
);
CREATE INDEX IF NOT EXISTS "EventSouvenirRequest_buyerId_createdAt_idx" ON "EventSouvenirRequest"("buyerId","createdAt");
