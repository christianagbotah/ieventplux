-- Additive migration only; existing KycProviderJob default drift intentionally not modified.
-- CreateTable
CREATE TABLE "EventContributor" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'GUEST_SPEAKER',
    "topic" TEXT,
    "bio" TEXT,
    "photoUrl" TEXT,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "published" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventContributor_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventSouvenirProduct" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "variantLabel" TEXT,
    "sku" TEXT NOT NULL,
    "description" TEXT,
    "imageUrl" TEXT,
    "priceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "stockTotal" INTEGER NOT NULL,
    "stockReserved" INTEGER NOT NULL DEFAULT 0,
    "stockSold" INTEGER NOT NULL DEFAULT 0,
    "stockFulfilled" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventSouvenirProduct_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventContributor_eventId_sortOrder_idx" ON "EventContributor"("eventId", "sortOrder");

-- CreateIndex
CREATE INDEX "EventSouvenirProduct_eventId_active_idx" ON "EventSouvenirProduct"("eventId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "EventSouvenirProduct_eventId_sku_key" ON "EventSouvenirProduct"("eventId", "sku");

-- AddForeignKey
ALTER TABLE "EventContributor" ADD CONSTRAINT "EventContributor_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventSouvenirProduct" ADD CONSTRAINT "EventSouvenirProduct_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

