import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  const oppCount = await prisma.backlinkOpportunity.count();
  const blCount = await prisma.backlink.count();
  
  const oppStatuses = await prisma.backlinkOpportunity.groupBy({
    by: ['status'],
    _count: true
  });
  
  const blStatuses = await prisma.backlink.groupBy({
    by: ['status'],
    _count: true
  });
  
  console.log(JSON.stringify({oppCount, blCount, oppStatuses, blStatuses}, null, 2));
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
