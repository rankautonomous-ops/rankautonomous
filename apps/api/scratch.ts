import { syncGoogleIntegrations } from './src/services/google';
import prisma from './src/lib/database';

async function main() {
  const websiteId = '98aac94b-aa56-4f4c-9fa3-c857fe9198ae';
  const userId = '6d6f1f6f-dabf-4cd5-9853-acf869ae6815';
  
  console.log('Running sync for website:', websiteId);
  const result = await syncGoogleIntegrations(websiteId, userId);
  console.log('Sync result:');
  console.log(JSON.stringify(result, null, 2));

  console.log('\nChecking GSC records in DB:');
  const gscRecords = await prisma.searchPerformanceRecord.count({
    where: { websiteId }
  });
  console.log('GSC Records count:', gscRecords);

  console.log('\nChecking GA4 records in DB:');
  const ga4Records = await prisma.analyticsSnapshot.count({
    where: { websiteId, source: 'GOOGLE_ANALYTICS' }
  });
  console.log('GA4 Records count:', ga4Records);
}

main().finally(() => prisma.$disconnect());
