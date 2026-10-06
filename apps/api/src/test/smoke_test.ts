import '../lib/env';
import { startCrawl } from '../services/crawler';
import prisma from '../lib/database';

async function runSmokeTests() {
  // We need a dummy user for the DB
  const user = await prisma.user.upsert({
    where: { email: 'smoke-test@test.com' },
    update: {},
    create: { email: 'smoke-test@test.com', role: 'CUSTOMER', supabaseAuthId: 'smoke-uuid' }
  });

  let site1Id: string | null = null;
  let site2Id: string | null = null;

  try {
    // TEST 1: SUCCESSFUL CRAWL OF EXAMPLE.COM
    console.log('--- TEST 1: CRAWLING https://example.com ---');
    const site1 = await prisma.website.create({
      data: { userId: user.id, url: 'https://example.com', name: 'Example', status: 'CONNECTED' }
    });
    site1Id = site1.id;
    const job1 = await prisma.crawlJob.create({ data: { websiteId: site1.id, status: 'PENDING' } });
    
    await startCrawl(site1.id, job1.id, site1.url);
    
    const finalJob1 = await prisma.crawlJob.findUnique({ where: { id: job1.id } });
    console.log('Result for example.com:', JSON.stringify(finalJob1, null, 2));

    // TEST 2: FAILED CRAWL (Invalid domain / timeout)
    console.log('\n--- TEST 2: CRAWLING FAILED DOMAIN (https://this.is.a.bad.domain.that.doesnt.exist) ---');
    const site2 = await prisma.website.create({
      data: { userId: user.id, url: 'https://this.is.a.bad.domain.that.doesnt.exist', name: 'Bad Domain', status: 'CONNECTED' }
    });
    site2Id = site2.id;
    const job2 = await prisma.crawlJob.create({ data: { websiteId: site2.id, status: 'PENDING' } });
    
    await startCrawl(site2.id, job2.id, site2.url);
    
    const finalJob2 = await prisma.crawlJob.findUnique({ where: { id: job2.id } });
    console.log('Result for bad domain:', JSON.stringify(finalJob2, null, 2));
  } finally {
    if (site1Id) {
      await prisma.pageResult.deleteMany({ where: { crawlJob: { websiteId: site1Id } } });
      await prisma.crawlJob.deleteMany({ where: { websiteId: site1Id } });
      await prisma.website.deleteMany({ where: { id: site1Id } });
    }
    if (site2Id) {
      await prisma.pageResult.deleteMany({ where: { crawlJob: { websiteId: site2Id } } });
      await prisma.crawlJob.deleteMany({ where: { websiteId: site2Id } });
      await prisma.website.deleteMany({ where: { id: site2Id } });
    }
    await prisma.user.deleteMany({ where: { email: 'smoke-test@test.com' } });
  }
}

runSmokeTests().then(() => {
  console.log('Done.');
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
