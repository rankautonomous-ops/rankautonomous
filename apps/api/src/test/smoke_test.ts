import { startCrawl } from '../services/crawler';
import prisma from '../lib/database';

async function runSmokeTests() {
  // We need a dummy user for the DB
  const user = await prisma.user.upsert({
    where: { email: 'smoke-test@test.com' },
    update: {},
    create: { email: 'smoke-test@test.com', role: 'CUSTOMER', supabaseAuthId: 'smoke-uuid' }
  });

  // TEST 1: SUCCESSFUL CRAWL OF EXAMPLE.COM
  console.log('--- TEST 1: CRAWLING https://example.com ---');
  const site1 = await prisma.website.create({
    data: { userId: user.id, url: 'https://example.com', name: 'Example', status: 'CONNECTED' }
  });
  const job1 = await prisma.crawlJob.create({ data: { websiteId: site1.id, status: 'PENDING' } });
  
  await startCrawl(site1.id, job1.id, site1.url);
  
  const finalJob1 = await prisma.crawlJob.findUnique({ where: { id: job1.id } });
  console.log('Result for example.com:', JSON.stringify(finalJob1, null, 2));

  // TEST 2: FAILED CRAWL (Invalid domain / timeout)
  console.log('\n--- TEST 2: CRAWLING FAILED DOMAIN (https://this.is.a.bad.domain.that.doesnt.exist) ---');
  const site2 = await prisma.website.create({
    data: { userId: user.id, url: 'https://this.is.a.bad.domain.that.doesnt.exist', name: 'Bad Domain', status: 'CONNECTED' }
  });
  const job2 = await prisma.crawlJob.create({ data: { websiteId: site2.id, status: 'PENDING' } });
  
  await startCrawl(site2.id, job2.id, site2.url);
  
  const finalJob2 = await prisma.crawlJob.findUnique({ where: { id: job2.id } });
  console.log('Result for bad domain:', JSON.stringify(finalJob2, null, 2));
}

runSmokeTests().then(() => {
  console.log('Done.');
  process.exit(0);
}).catch(e => {
  console.error(e);
  process.exit(1);
});
