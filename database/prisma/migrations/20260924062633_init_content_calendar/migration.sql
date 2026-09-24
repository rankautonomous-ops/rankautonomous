-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "ArticleStatus" ADD VALUE 'PLANNED';
ALTER TYPE "ArticleStatus" ADD VALUE 'SCHEDULED';
ALTER TYPE "ArticleStatus" ADD VALUE 'GENERATING';
ALTER TYPE "ArticleStatus" ADD VALUE 'FAILED';
ALTER TYPE "ArticleStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "Website" ADD COLUMN     "contentAutomationEnabled" BOOLEAN NOT NULL DEFAULT false;
