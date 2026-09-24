-- CreateEnum
CREATE TYPE "CompetitorStatus" AS ENUM ('DISCOVERED', 'ANALYZING', 'ANALYZED', 'ERROR');

-- CreateTable
CREATE TABLE "Competitor" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "domain" TEXT NOT NULL,
    "url" TEXT,
    "name" TEXT,
    "status" "CompetitorStatus" NOT NULL DEFAULT 'DISCOVERED',
    "analysisData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Competitor_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Competitor_websiteId_idx" ON "Competitor"("websiteId");

-- CreateIndex
CREATE INDEX "Competitor_websiteId_domain_idx" ON "Competitor"("websiteId", "domain");

-- CreateIndex
CREATE INDEX "Competitor_status_idx" ON "Competitor"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Competitor_websiteId_domain_key" ON "Competitor"("websiteId", "domain");

-- AddForeignKey
ALTER TABLE "Competitor" ADD CONSTRAINT "Competitor_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;
