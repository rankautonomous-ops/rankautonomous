import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Start seeding DEVELOPMENT DATA...');

  // 1. Create a dummy user
  const user = await prisma.user.upsert({
    where: { email: 'dev@rankautonomous.com' },
    update: {},
    create: {
      email: 'dev@rankautonomous.com',
      name: 'Development User',
      role: 'CUSTOMER',
      supabaseAuthId: 'dummy-uuid-1234',
    },
  });
  console.log(`Created User: ${user.email}`);

  // 2. Create a dummy website
  const website = await prisma.website.create({
    data: {
      userId: user.id,
      url: 'https://example.com',
      name: 'Example SaaS',
      platform: 'WordPress',
      industry: 'Software',
      targetCountry: 'United States',
      targetAudience: 'Small Business Owners',
      primaryKeywords: ['SEO software', 'SaaS platform'],
      status: 'CONNECTED',
    },
  });
  console.log(`Created Website: ${website.url}`);

  // 3. Create a dummy SEO Audit & Issue
  const audit = await prisma.seoAudit.create({
    data: {
      websiteId: website.id,
      healthScore: 85.5,
      status: 'COMPLETED',
      summaryData: { totalIssues: 1 },
    },
  });
  
  await prisma.seoIssue.create({
    data: {
      websiteId: website.id,
      seoAuditId: audit.id,
      title: 'Missing Meta Description',
      description: 'The homepage is missing a meta description.',
      category: 'On-page SEO',
      priority: 'HIGH',
      recommendation: 'Add a 150-160 character description describing your service.',
      status: 'OPEN',
      affectedUrl: 'https://example.com/',
    },
  });
  console.log('Created SEO Audit & Issues');

  // 4. Create a dummy keyword
  await prisma.keyword.create({
    data: {
      websiteId: website.id,
      keyword: 'SEO software',
      searchVolume: 12000,
      difficulty: 65,
      intent: 'COMMERCIAL',
      source: 'USER_INPUT',
    },
  });

  console.log('Seeding finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
