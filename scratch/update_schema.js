const fs = require('fs');
let schema = fs.readFileSync('database/prisma/schema.prisma', 'utf8');

if (!schema.includes('cmsConnections        CmsConnection[]')) {
  schema = schema.replace(/  seoMonthlyReports     SeoMonthlyReport\[\]\r?\n\r?\n  @@index\(\[userId\]\)\r?\n\}/, '  seoMonthlyReports     SeoMonthlyReport[]\r\n  cmsConnections        CmsConnection[]\r\n\r\n  @@index([userId])\r\n}');
}

if (!schema.includes('publications          ArticlePublication[]')) {
  schema = schema.replace(/  cmsPublicationInfo    Json\?\r?\n  createdAt             DateTime      @default\(now\(\)\)\r?\n  updatedAt             DateTime      @updatedAt\r?\n\r?\n  @@index\(\[websiteId\]\)/, '  cmsPublicationInfo    Json?\r\n  createdAt             DateTime      @default(now())\r\n  updatedAt             DateTime      @updatedAt\r\n\r\n  publications          ArticlePublication[]\r\n\r\n  @@index([websiteId])');
}

if (!schema.includes('model CmsConnection')) {
  schema += '\r\n\r\n' + `enum CmsProvider {
  WORDPRESS
  SHOPIFY
  WEBFLOW
  CUSTOM
}

enum CmsConnectionStatus {
  CONNECTED
  ERROR
  DISCONNECTED
}

model CmsConnection {
  id              String              @id @default(uuid())
  websiteId       String
  website         Website             @relation(fields: [websiteId], references: [id], onDelete: Cascade)
  provider        CmsProvider
  name            String
  status          CmsConnectionStatus @default(CONNECTED)
  baseUrl         String?
  credentials     String?             // Encrypted JSON
  metadata        Json?
  lastTestedAt    DateTime?
  lastError       String?             @db.Text
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  publications    ArticlePublication[]

  @@index([websiteId])
}

enum PublicationStatus {
  PUBLISHED
  FAILED
}

model ArticlePublication {
  id               String            @id @default(uuid())
  articleId        String
  article          Article           @relation(fields: [articleId], references: [id], onDelete: Cascade)
  cmsConnectionId  String
  cmsConnection    CmsConnection     @relation(fields: [cmsConnectionId], references: [id], onDelete: Cascade)
  remoteId         String?
  remoteUrl        String?
  status           PublicationStatus @default(PUBLISHED)
  publishedAt      DateTime?
  lastError        String?           @db.Text
  createdAt        DateTime          @default(now())
  updatedAt        DateTime          @updatedAt

  @@unique([articleId, cmsConnectionId])
  @@index([cmsConnectionId])
}`;
}

fs.writeFileSync('database/prisma/schema.prisma', schema);
