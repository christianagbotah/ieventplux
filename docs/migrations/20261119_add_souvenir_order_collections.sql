-- AlterTable
ALTER TABLE "RefundCase" ADD COLUMN     "createdByKind" TEXT NOT NULL DEFAULT 'USER',
ALTER COLUMN "requestedBy" DROP NOT NULL;

-- CreateTable
CREATE TABLE "SouvenirOrderItem" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "unitPriceMinor" INTEGER NOT NULL,
    "lineTotalMinor" INTEGER NOT NULL,
    "holdStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "collectedQty" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SouvenirOrderItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SouvenirCollection" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "collectorId" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "clientActionId" TEXT NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SouvenirCollection_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SouvenirOrderItem_productId_holdStatus_idx" ON "SouvenirOrderItem"("productId", "holdStatus");

-- CreateIndex
CREATE UNIQUE INDEX "SouvenirOrderItem_orderId_productId_key" ON "SouvenirOrderItem"("orderId", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "SouvenirCollection_clientActionId_key" ON "SouvenirCollection"("clientActionId");

-- CreateIndex
CREATE INDEX "SouvenirCollection_eventId_createdAt_idx" ON "SouvenirCollection"("eventId", "createdAt");

-- CreateIndex
CREATE INDEX "SouvenirCollection_orderItemId_idx" ON "SouvenirCollection"("orderItemId");

-- AddForeignKey
ALTER TABLE "SouvenirOrderItem" ADD CONSTRAINT "SouvenirOrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SouvenirOrderItem" ADD CONSTRAINT "SouvenirOrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "EventSouvenirProduct"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SouvenirCollection" ADD CONSTRAINT "SouvenirCollection_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "SouvenirOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SouvenirCollection" ADD CONSTRAINT "SouvenirCollection_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SouvenirCollection" ADD CONSTRAINT "SouvenirCollection_collectorId_fkey" FOREIGN KEY ("collectorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

