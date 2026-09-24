-- CreateEnum
CREATE TYPE "ReportStatus" AS ENUM ('GENERATING', 'READY', 'FAILED');

-- CreateTable
CREATE TABLE "SeoMonthlyReport" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "reportMonth" INTEGER NOT NULL,
    "reportYear" INTEGER NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "periodEnd" TIMESTAMP(3) NOT NULL,
    "status" "ReportStatus" NOT NULL DEFAULT 'GENERATING',
    "seoScore" DOUBLE PRECISION,
    "previousSeoScore" DOUBLE PRECISION,
    "organicClicks" INTEGER,
    "previousOrganicClicks" INTEGER,
    "organicImpressions" INTEGER,
    "previousOrganicImpressions" INTEGER,
    "organicCtr" DOUBLE PRECISION,
    "previousOrganicCtr" DOUBLE PRECISION,
    "averagePosition" DOUBLE PRECISION,
    "previousAveragePosition" DOUBLE PRECISION,
    "organicSessions" INTEGER,
    "previousOrganicSessions" INTEGER,
    "keywordsTracked" INTEGER,
    "keywordsImproved" INTEGER,
    "keywordsDeclined" INTEGER,
    "backlinksAcquired" INTEGER,
    "backlinksLost" INTEGER,
    "recommendationsCompleted" INTEGER,
    "recommendationsOpen" INTEGER,
    "articlesPublished" INTEGER,
    "reportData" JSONB,
    "generatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SeoMonthlyReport_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeoMonthlyReport_websiteId_idx" ON "SeoMonthlyReport"("websiteId");

-- CreateIndex
CREATE INDEX "SeoMonthlyReport_reportYear_reportMonth_idx" ON "SeoMonthlyReport"("reportYear", "reportMonth");

-- CreateIndex
CREATE UNIQUE INDEX "SeoMonthlyReport_websiteId_reportYear_reportMonth_key" ON "SeoMonthlyReport"("websiteId", "reportYear", "reportMonth");

-- AddForeignKey
ALTER TABLE "SeoMonthlyReport" ADD CONSTRAINT "SeoMonthlyReport_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;
