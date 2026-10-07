-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "CmsProvider" ADD VALUE 'WIX';
ALTER TYPE "CmsProvider" ADD VALUE 'SQUARESPACE';
ALTER TYPE "CmsProvider" ADD VALUE 'BIGCOMMERCE';
ALTER TYPE "CmsProvider" ADD VALUE 'DUDA';
ALTER TYPE "CmsProvider" ADD VALUE 'HUBSPOT';
ALTER TYPE "CmsProvider" ADD VALUE 'HIGHLEVEL';
ALTER TYPE "CmsProvider" ADD VALUE 'LOVABLE';
ALTER TYPE "CmsProvider" ADD VALUE 'RSS';
ALTER TYPE "CmsProvider" ADD VALUE 'FRAMER';
ALTER TYPE "CmsProvider" ADD VALUE 'NOTION';
ALTER TYPE "CmsProvider" ADD VALUE 'GHOST';
ALTER TYPE "CmsProvider" ADD VALUE 'WORDPRESS_COM';
ALTER TYPE "CmsProvider" ADD VALUE 'WEBHOOK';
ALTER TYPE "CmsProvider" ADD VALUE 'NEXTJS';
