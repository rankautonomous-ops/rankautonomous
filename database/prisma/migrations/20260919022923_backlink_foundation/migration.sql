/*
  Warnings:

  - The `status` column on the `BacklinkOpportunity` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('DISCOVERED', 'QUALIFIED', 'READY', 'CONTACTED', 'REPLIED', 'ACCEPTED', 'LINK_ACQUIRED', 'REJECTED');

-- AlterTable
ALTER TABLE "BacklinkOpportunity" ADD COLUMN     "domainAuthority" INTEGER,
ADD COLUMN     "suggestedAnchor" TEXT,
DROP COLUMN "status",
ADD COLUMN     "status" "OpportunityStatus" NOT NULL DEFAULT 'DISCOVERED';

-- CreateIndex
CREATE INDEX "Backlink_websiteId_status_idx" ON "Backlink"("websiteId", "status");

-- CreateIndex
CREATE INDEX "BacklinkOpportunity_websiteId_status_idx" ON "BacklinkOpportunity"("websiteId", "status");

-- CreateIndex
CREATE INDEX "BacklinkOpportunity_websiteId_type_idx" ON "BacklinkOpportunity"("websiteId", "type");
