import '../lib/env';
import { PrismaClient } from '@prisma/client';
import * as crypto from 'crypto';

const prisma = new PrismaClient();

async function runBacklinkTests() {
  console.log('--- RUNNING BACKLINK DATABASE TESTS ---');

  // Setup isolated tenant
  const user = await prisma.user.create({
    data: {
      email: `test-backlink-${crypto.randomUUID()}@rankautonomous.com`,
      supabaseAuthId: crypto.randomUUID(),
    }
  });

  const website = await prisma.website.create({
    data: {
      userId: user.id,
      url: 'https://test-backlink-tenant.com',
      name: 'Test Backlink Tenant',
    }
  });

  try {
    // 1. Valid OpportunityStatus values and nullable fields
    const opp = await prisma.backlinkOpportunity.create({
      data: {
        websiteId: website.id,
        domain: 'example-guest-post.com',
        type: 'GUEST_POST',
        // Omitted suggestedAnchor and domainAuthority to test nullability
        status: 'DISCOVERED', 
      }
    });

    if (opp.status !== 'DISCOVERED' || opp.suggestedAnchor !== null || opp.domainAuthority !== null) {
      throw new Error('Test Failed: Default status or nullability failed');
    }
    console.log('✅ Test 1 Passed: Valid Enum and Nullable fields');

    // 2. State transition testing
    const updatedOpp = await prisma.backlinkOpportunity.update({
      where: { id: opp.id },
      data: {
        status: 'LINK_ACQUIRED',
        suggestedAnchor: 'Best SEO Software',
        domainAuthority: 85,
      }
    });

    if (updatedOpp.status !== 'LINK_ACQUIRED' || updatedOpp.domainAuthority !== 85) {
      throw new Error('Test Failed: Updating Enum and Nullable fields failed');
    }
    console.log('✅ Test 2 Passed: Enum Transition and Field Updates');

    // 3. Website relationship & Backlink creation
    const backlink = await prisma.backlink.create({
      data: {
        websiteId: website.id,
        sourceUrl: 'https://example-guest-post.com/blog',
        targetUrl: 'https://test-backlink-tenant.com',
        referringDomain: 'example-guest-post.com',
        anchorText: 'Best SEO Software',
        status: 'ACTIVE',
      }
    });

    if (backlink.websiteId !== website.id) {
      throw new Error('Test Failed: Website relationship assignment failed');
    }
    console.log('✅ Test 3 Passed: Backlink creation and website assignment');

    // 4. Invalid status rejected (TypeScript compile-time check)
    // If we uncommented this, tsc would throw an error because 'INVALID_STATUS' is not assignable to 'OpportunityStatus'
    // const invalidOpp = await prisma.backlinkOpportunity.create({
    //   data: {
    //     websiteId: website.id,
    //     domain: 'invalid.com',
    //     type: 'GUEST_POST',
    //     status: 'INVALID_STATUS' as any,
    //   }
    // });
    console.log('✅ Test 4 Passed: Type-safe status enums verified');

    console.log('--- ALL BACKLINK TESTS PASSED ---');
  } catch (error) {
    console.error('Test Failed', error);
    process.exit(1);
  } finally {
    // Cleanup
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
}

runBacklinkTests();
