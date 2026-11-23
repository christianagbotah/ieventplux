-- CreateTable
CREATE TABLE "EventCompetition" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "votingMethod" TEXT NOT NULL DEFAULT 'FREE',
    "resultsVisibility" TEXT NOT NULL DEFAULT 'AFTER_CLOSE',
    "votingStartsAt" TIMESTAMP(3) NOT NULL,
    "votingEndsAt" TIMESTAMP(3) NOT NULL,
    "openedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EventCompetition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionCategory" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "position" INTEGER NOT NULL,

    CONSTRAINT "CompetitionCategory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionNominee" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "bio" TEXT,
    "photoUrl" TEXT,
    "position" INTEGER NOT NULL,

    CONSTRAINT "CompetitionNominee_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompetitionVote" (
    "id" TEXT NOT NULL,
    "competitionId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "nomineeId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompetitionVote_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "EventCompetition_eventId_status_idx" ON "EventCompetition"("eventId", "status");

-- CreateIndex
CREATE INDEX "EventCompetition_votingEndsAt_idx" ON "EventCompetition"("votingEndsAt");

-- CreateIndex
CREATE INDEX "CompetitionCategory_competitionId_idx" ON "CompetitionCategory"("competitionId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionCategory_competitionId_position_key" ON "CompetitionCategory"("competitionId", "position");

-- CreateIndex
CREATE INDEX "CompetitionNominee_categoryId_idx" ON "CompetitionNominee"("categoryId");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionNominee_categoryId_position_key" ON "CompetitionNominee"("categoryId", "position");

-- CreateIndex
CREATE INDEX "CompetitionVote_competitionId_nomineeId_idx" ON "CompetitionVote"("competitionId", "nomineeId");

-- CreateIndex
CREATE INDEX "CompetitionVote_userId_createdAt_idx" ON "CompetitionVote"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "CompetitionVote_categoryId_userId_key" ON "CompetitionVote"("categoryId", "userId");

-- AddForeignKey
ALTER TABLE "EventCompetition" ADD CONSTRAINT "EventCompetition_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionCategory" ADD CONSTRAINT "CompetitionCategory_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "EventCompetition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionNominee" ADD CONSTRAINT "CompetitionNominee_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CompetitionCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionVote" ADD CONSTRAINT "CompetitionVote_competitionId_fkey" FOREIGN KEY ("competitionId") REFERENCES "EventCompetition"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionVote" ADD CONSTRAINT "CompetitionVote_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "CompetitionCategory"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionVote" ADD CONSTRAINT "CompetitionVote_nomineeId_fkey" FOREIGN KEY ("nomineeId") REFERENCES "CompetitionNominee"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompetitionVote" ADD CONSTRAINT "CompetitionVote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

