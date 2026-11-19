-- Release B additive foundation; DO NOT activate checkout or collection by applying this migration.
-- Apply only after scratch rehearsal, verified backup, staging and authorization review.
CREATE TABLE "MerchandiseOrderLine" (
  "id" TEXT PRIMARY KEY, "orderId" TEXT NOT NULL, "eventId" TEXT NOT NULL,
  "productId" TEXT NOT NULL, "skuSnapshot" TEXT NOT NULL,
  "variantSnapshot" TEXT, "nameSnapshot" TEXT NOT NULL,
  "qty" INTEGER NOT NULL, "unitPriceMinor" INTEGER NOT NULL,
  "lineTotalMinor" INTEGER NOT NULL, "currency" TEXT NOT NULL DEFAULT 'GHS',
  "status" TEXT NOT NULL DEFAULT 'HELD', "reservedUntil" TIMESTAMP(3) NOT NULL,
  "paidAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MerchandiseOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON UPDATE CASCADE,
  CONSTRAINT "MerchandiseOrderLine_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON UPDATE CASCADE,
  CONSTRAINT "MerchandiseOrderLine_productId_fkey" FOREIGN KEY ("productId") REFERENCES "EventSouvenirProduct"("id") ON UPDATE CASCADE,
  CONSTRAINT "MerchandiseOrderLine_qty_check" CHECK ("qty" > 0),
  CONSTRAINT "MerchandiseOrderLine_price_check" CHECK ("unitPriceMinor" >= 0 AND "lineTotalMinor" >= 0)
);
CREATE INDEX "MerchandiseOrderLine_orderId_idx" ON "MerchandiseOrderLine"("orderId");
CREATE INDEX "MerchandiseOrderLine_productId_status_reservedUntil_idx" ON "MerchandiseOrderLine"("productId", "status", "reservedUntil");
CREATE INDEX "MerchandiseOrderLine_eventId_status_idx" ON "MerchandiseOrderLine"("eventId", "status");
CREATE TABLE "MerchandiseCollectionEntitlement" (
  "id" TEXT PRIMARY KEY, "orderLineId" TEXT NOT NULL UNIQUE,
  "codeHash" TEXT NOT NULL UNIQUE, "status" TEXT NOT NULL DEFAULT 'UNPAID',
  "qtyPurchased" INTEGER NOT NULL, "qtyCollected" INTEGER NOT NULL DEFAULT 0,
  "qtyRefunded" INTEGER NOT NULL DEFAULT 0, "qrVersion" INTEGER NOT NULL DEFAULT 1,
  "readyAt" TIMESTAMP(3), "collectedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "MerchandiseCollectionEntitlement_orderLineId_fkey" FOREIGN KEY ("orderLineId") REFERENCES "MerchandiseOrderLine"("id") ON UPDATE CASCADE,
  CONSTRAINT "MerchandiseCollectionEntitlement_quantities_check" CHECK ("qtyPurchased" > 0 AND "qtyCollected" >= 0 AND "qtyRefunded" >= 0 AND "qtyCollected" + "qtyRefunded" <= "qtyPurchased"),
  CONSTRAINT "MerchandiseCollectionEntitlement_qrVersion_check" CHECK ("qrVersion" > 0)
);
CREATE INDEX "MerchandiseCollectionEntitlement_status_updatedAt_idx" ON "MerchandiseCollectionEntitlement"("status", "updatedAt");
CREATE TABLE "MerchandiseCollectionAction" (
  "id" TEXT PRIMARY KEY, "entitlementId" TEXT NOT NULL,
  "actorUserId" TEXT NOT NULL, "idempotencyKey" TEXT NOT NULL,
  "action" TEXT NOT NULL, "qty" INTEGER NOT NULL DEFAULT 0,
  "beforeStatus" TEXT NOT NULL, "afterStatus" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "MerchandiseCollectionAction_entitlementId_fkey" FOREIGN KEY ("entitlementId") REFERENCES "MerchandiseCollectionEntitlement"("id") ON UPDATE CASCADE,
  CONSTRAINT "MerchandiseCollectionAction_qty_check" CHECK ("qty" >= 0)
);
CREATE UNIQUE INDEX "MerchandiseCollectionAction_entitlementId_idempotencyKey_key" ON "MerchandiseCollectionAction"("entitlementId", "idempotencyKey");
CREATE INDEX "MerchandiseCollectionAction_entitlementId_createdAt_idx" ON "MerchandiseCollectionAction"("entitlementId", "createdAt");
CREATE INDEX "MerchandiseCollectionAction_actorUserId_createdAt_idx" ON "MerchandiseCollectionAction"("actorUserId", "createdAt");
