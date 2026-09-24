-- CreateEnum
CREATE TYPE "CmsProvider" AS ENUM ('WORDPRESS', 'SHOPIFY', 'WEBFLOW', 'CUSTOM');

-- CreateEnum
CREATE TYPE "CmsConnectionStatus" AS ENUM ('CONNECTED', 'ERROR', 'DISCONNECTED');

-- CreateEnum
CREATE TYPE "PublicationStatus" AS ENUM ('PUBLISHED', 'FAILED');

-- CreateTable
CREATE TABLE "CmsConnection" (
    "id" TEXT NOT NULL,
    "websiteId" TEXT NOT NULL,
    "provider" "CmsProvider" NOT NULL,
    "name" TEXT NOT NULL,
    "status" "CmsConnectionStatus" NOT NULL DEFAULT 'CONNECTED',
    "baseUrl" TEXT,
    "credentials" TEXT,
    "metadata" JSONB,
    "lastTestedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CmsConnection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ArticlePublication" (
    "id" TEXT NOT NULL,
    "articleId" TEXT NOT NULL,
    "cmsConnectionId" TEXT NOT NULL,
    "remoteId" TEXT,
    "remoteUrl" TEXT,
    "status" "PublicationStatus" NOT NULL DEFAULT 'PUBLISHED',
    "publishedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ArticlePublication_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CmsConnection_websiteId_idx" ON "CmsConnection"("websiteId");

-- CreateIndex
CREATE INDEX "ArticlePublication_cmsConnectionId_idx" ON "ArticlePublication"("cmsConnectionId");

-- CreateIndex
CREATE UNIQUE INDEX "ArticlePublication_articleId_cmsConnectionId_key" ON "ArticlePublication"("articleId", "cmsConnectionId");

-- AddForeignKey
ALTER TABLE "CmsConnection" ADD CONSTRAINT "CmsConnection_websiteId_fkey" FOREIGN KEY ("websiteId") REFERENCES "Website"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticlePublication" ADD CONSTRAINT "ArticlePublication_articleId_fkey" FOREIGN KEY ("articleId") REFERENCES "Article"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ArticlePublication" ADD CONSTRAINT "ArticlePublication_cmsConnectionId_fkey" FOREIGN KEY ("cmsConnectionId") REFERENCES "CmsConnection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
