-- CreateTable
CREATE TABLE "MarketplaceStore" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "orgId" TEXT,
    "name" TEXT NOT NULL,
    "tagline" TEXT,
    "description" TEXT,
    "category" TEXT NOT NULL,
    "logoUrl" TEXT,
    "coverUrl" TEXT,
    "website" TEXT,
    "country" TEXT NOT NULL DEFAULT 'GH',
    "city" TEXT,
    "pickupAddress" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "verificationState" TEXT NOT NULL DEFAULT 'UNVERIFIED',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceStore_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceProduct" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "shortDesc" TEXT,
    "description" TEXT NOT NULL,
    "brand" TEXT,
    "category" TEXT NOT NULL,
    "productKind" TEXT NOT NULL DEFAULT 'GOODS',
    "specifications" TEXT NOT NULL DEFAULT '{}',
    "images" TEXT NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceProduct_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceVariant" (
    "id" TEXT NOT NULL,
    "storeId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "sku" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "optionValues" TEXT NOT NULL DEFAULT '{}',
    "priceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GHS',
    "stockOnHand" INTEGER NOT NULL DEFAULT 0,
    "stockReserved" INTEGER NOT NULL DEFAULT 0,
    "stockSold" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MarketplaceVariant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MarketplaceStockMovement" (
    "id" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "qtyDelta" INTEGER NOT NULL,
    "balanceAfter" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MarketplaceStockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceStore_slug_key" ON "MarketplaceStore"("slug");

-- CreateIndex
CREATE INDEX "MarketplaceStore_ownerId_status_idx" ON "MarketplaceStore"("ownerId", "status");

-- CreateIndex
CREATE INDEX "MarketplaceStore_status_category_idx" ON "MarketplaceStore"("status", "category");

-- CreateIndex
CREATE INDEX "MarketplaceStore_country_city_idx" ON "MarketplaceStore"("country", "city");

-- CreateIndex
CREATE INDEX "MarketplaceProduct_storeId_status_idx" ON "MarketplaceProduct"("storeId", "status");

-- CreateIndex
CREATE INDEX "MarketplaceProduct_category_status_idx" ON "MarketplaceProduct"("category", "status");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceProduct_storeId_slug_key" ON "MarketplaceProduct"("storeId", "slug");

-- CreateIndex
CREATE INDEX "MarketplaceVariant_productId_active_idx" ON "MarketplaceVariant"("productId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceVariant_storeId_sku_key" ON "MarketplaceVariant"("storeId", "sku");

-- CreateIndex
CREATE INDEX "MarketplaceStockMovement_variantId_createdAt_idx" ON "MarketplaceStockMovement"("variantId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "MarketplaceStockMovement_variantId_requestKey_key" ON "MarketplaceStockMovement"("variantId", "requestKey");

-- AddForeignKey
ALTER TABLE "MarketplaceStore" ADD CONSTRAINT "MarketplaceStore_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceStore" ADD CONSTRAINT "MarketplaceStore_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceProduct" ADD CONSTRAINT "MarketplaceProduct_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "MarketplaceStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceVariant" ADD CONSTRAINT "MarketplaceVariant_storeId_fkey" FOREIGN KEY ("storeId") REFERENCES "MarketplaceStore"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceVariant" ADD CONSTRAINT "MarketplaceVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "MarketplaceProduct"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceStockMovement" ADD CONSTRAINT "MarketplaceStockMovement_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "MarketplaceVariant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MarketplaceStockMovement" ADD CONSTRAINT "MarketplaceStockMovement_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

