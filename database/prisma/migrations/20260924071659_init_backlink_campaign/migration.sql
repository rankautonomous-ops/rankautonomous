-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('DRAFT', 'READY', 'CONTACTED', 'REPLIED', 'ACCEPTED', 'REJECTED', 'COMPLETED', 'CANCELLED');

-- CreateTable
CREATE TABLE "BacklinkCampaign" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "opportunityId" TEXT NOT NULL,
    "status" "CampaignStatus" NOT NULL DEFAULT 'DRAFT',
    "contactName" TEXT,
    "contactEmail" TEXT,
    "subject" TEXT,
    "message" TEXT,
    "sentAt" TIMESTAMP(3),
    "respondedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BacklinkCampaign_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BacklinkCampaign_websiteId_idx" ON "BacklinkCampaign"("websiteId");

-- CreateIndex
CREATE INDEX "BacklinkCampaign_opportunityId_idx" ON "BacklinkCampaign"("opportunityId");

-- CreateIndex
CREATE INDEX "BacklinkCampaign_websiteId_status_idx" ON "BacklinkCampaign"("websiteId", "status");

-- AddForeignKey
ALTER TABLE "BacklinkCampaign" ADD CONSTRAINT "BacklinkCampaign_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacklinkCampaign" ADD CONSTRAINT "BacklinkCampaign_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "BacklinkOpportunity"("id") ON DELETE CASCADE ON UPDATE CASCADE;
