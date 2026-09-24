-- CreateEnum
CREATE TYPE "RecommendationCategory" AS ENUM ('TECHNICAL', 'CONTENT', 'KEYWORD', 'COMPETITOR', 'BACKLINK', 'PERFORMANCE', 'INTERNAL_LINKING', 'ON_PAGE');

-- CreateEnum
CREATE TYPE "RecommendationPriority" AS ENUM ('CRITICAL', 'HIGH', 'MEDIUM', 'LOW');

-- CreateEnum
CREATE TYPE "RecommendationStatus" AS ENUM ('OPEN', 'IN_PROGRESS', 'COMPLETED', 'DISMISSED', 'SNOOZED');

-- CreateEnum
CREATE TYPE "AutomationType" AS ENUM ('MANUAL', 'AI_ASSISTED', 'AUTOMATED');

-- CreateEnum
CREATE TYPE "RecommendationActionType" AS ENUM ('CREATE_ARTICLE', 'VERIFY_BACKLINK', 'START_OUTREACH', 'OPTIMIZE_CONTENT', 'FIX_TECHNICAL_ISSUE', 'INVESTIGATE_PERFORMANCE', 'NO_ACTION');

-- CreateTable
CREATE TABLE "SeoRecommendation" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "type" "RecommendationActionType" NOT NULL,
    "category" "RecommendationCategory" NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "RecommendationPriority" NOT NULL,
    "impact" INTEGER NOT NULL,
    "effort" INTEGER NOT NULL,
    "confidence" INTEGER NOT NULL,
    "score" INTEGER NOT NULL,
    "status" "RecommendationStatus" NOT NULL DEFAULT 'OPEN',
    "sourceType" TEXT NOT NULL,
    "sourceId" TEXT,
    "targetUrl" TEXT,
    "targetKeyword" TEXT,
    "suggestedAction" TEXT,
    "automationType" "AutomationType" NOT NULL DEFAULT 'MANUAL',
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "lastEvaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "deduplicationKey" TEXT NOT NULL,

    CONSTRAINT "SeoRecommendation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SeoRecommendation_websiteId_idx" ON "SeoRecommendation"("websiteId");

-- CreateIndex
CREATE INDEX "SeoRecommendation_status_idx" ON "SeoRecommendation"("status");

-- CreateIndex
CREATE INDEX "SeoRecommendation_priority_idx" ON "SeoRecommendation"("priority");

-- CreateIndex
CREATE INDEX "SeoRecommendation_category_idx" ON "SeoRecommendation"("category");

-- CreateIndex
CREATE INDEX "SeoRecommendation_deduplicationKey_idx" ON "SeoRecommendation"("deduplicationKey");

-- CreateIndex
CREATE UNIQUE INDEX "SeoRecommendation_websiteId_deduplicationKey_key" ON "SeoRecommendation"("websiteId", "deduplicationKey");

-- AddForeignKey
ALTER TABLE "SeoRecommendation" ADD CONSTRAINT "SeoRecommendation_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;
