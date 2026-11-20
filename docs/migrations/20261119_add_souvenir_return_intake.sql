-- CreateTable
CREATE TABLE "SouvenirReturnIntake" (
    "id" TEXT NOT NULL,
    "orderItemId" TEXT NOT NULL,
    "receivedById" TEXT NOT NULL,
    "qty" INTEGER NOT NULL,
    "clientActionId" TEXT NOT NULL,
    "condition" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceNote" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECEIVED',
    "reviewedById" TEXT,
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),

    CONSTRAINT "SouvenirReturnIntake_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SouvenirReturnIntake_clientActionId_key" ON "SouvenirReturnIntake"("clientActionId");

-- CreateIndex
CREATE INDEX "SouvenirReturnIntake_orderItemId_status_idx" ON "SouvenirReturnIntake"("orderItemId", "status");

-- CreateIndex
CREATE INDEX "SouvenirReturnIntake_createdAt_idx" ON "SouvenirReturnIntake"("createdAt");

-- AddForeignKey
ALTER TABLE "SouvenirReturnIntake" ADD CONSTRAINT "SouvenirReturnIntake_orderItemId_fkey" FOREIGN KEY ("orderItemId") REFERENCES "SouvenirOrderItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SouvenirReturnIntake" ADD CONSTRAINT "SouvenirReturnIntake_receivedById_fkey" FOREIGN KEY ("receivedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SouvenirReturnIntake" ADD CONSTRAINT "SouvenirReturnIntake_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
