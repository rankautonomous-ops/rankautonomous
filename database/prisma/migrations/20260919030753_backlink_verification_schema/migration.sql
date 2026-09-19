-- CreateEnum
CREATE TYPE "BacklinkVerificationStatus" AS ENUM ('UNVERIFIED', 'VERIFIED', 'MISSING', 'ERROR');

-- AlterTable
ALTER TABLE "Backlink" ADD COLUMN     "lastErrorMessage" TEXT,
ADD COLUMN     "linkAttributes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "verificationStatus" "BacklinkVerificationStatus" NOT NULL DEFAULT 'UNVERIFIED';

-- CreateIndex
CREATE INDEX "Backlink_websiteId_verificationStatus_idx" ON "Backlink"("websiteId", "verificationStatus");

-- CreateIndex
CREATE INDEX "Backlink_websiteId_lastChecked_idx" ON "Backlink"("websiteId", "lastChecked");
