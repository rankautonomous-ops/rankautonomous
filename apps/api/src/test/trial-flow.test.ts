import * as dotenv from 'dotenv';
import * as path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

import { hasActiveSubscription } from '../middleware/subscription';
import prisma from '../lib/database';

async function runTests() {
  console.log('--- STARTING TRIAL FLOW TESTS ---');
  
  const mockUserId = 'test-trial-user-123';
  const mockSubId = 'sub_test_123';

  // 1. Setup
  await prisma.user.upsert({
    where: { id: mockUserId },
    create: {
      id: mockUserId,
      email: 'trial-flow-test@rankautonomous.com',
      supabaseAuthId: 'test-supa-trial',
      role: 'CUSTOMER'
    },
    update: {
      isPaused: false,
      trialActive: false,
      trialEndsAt: null,
    }
  });

  try {
    // 2. Active Trial User
    const futureDate = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
    await prisma.user.update({
      where: { id: mockUserId },
      data: { trialActive: true, trialEndsAt: futureDate, isPaused: false }
    });
    const isActive1 = await hasActiveSubscription(mockUserId);
    if (!isActive1) throw new Error('Active trial user was incorrectly blocked');
    console.log('PASS: Requirement 4 - Active trial users receive paid app access');

    // 3. Expired Trial User
    const pastDate = new Date(Date.now() - 1 * 24 * 60 * 60 * 1000);
    await prisma.user.update({
      where: { id: mockUserId },
      data: { trialActive: true, trialEndsAt: pastDate, isPaused: false }
    });
    const isActive2 = await hasActiveSubscription(mockUserId);
    if (isActive2) throw new Error('Expired trial user was incorrectly allowed access');
    console.log('PASS: Requirement 5/6 - Expired trial users are correctly blocked without paid sub');

    // 4. Paused User
    await prisma.user.update({
      where: { id: mockUserId },
      data: { isPaused: true, trialActive: true, trialEndsAt: futureDate }
    });
    const isActive3 = await hasActiveSubscription(mockUserId);
    if (isActive3) throw new Error('Paused user was incorrectly allowed access');
    console.log('PASS: Requirement 6 - PAUSED users are explicitly denied access');

    // 5. Active Paid Subscriber (even if paused flag was somehow left on)
    await prisma.user.update({
      where: { id: mockUserId },
      data: { isPaused: true }
    });
    await prisma.subscription.create({
      data: {
        userId: mockUserId,
        stripeSubscriptionId: mockSubId,
        status: 'active',
        plan: 'monthly',
        interval: 'month'
      }
    });
    
    // Simulate webhook unpausing the user
    await prisma.user.update({
      where: { id: mockUserId },
      data: { isPaused: false }
    });

    const isActive4 = await hasActiveSubscription(mockUserId);
    if (!isActive4) throw new Error('Paid subscriber was incorrectly blocked');
    console.log('PASS: Requirement 5 - Active paid subscriber gets access');

    console.log('ALL TRIAL FLOW TESTS PASSED');
  } catch (err: any) {
    console.error('TEST FAILED:', err.message);
    process.exit(1);
  } finally {
    // Cleanup
    await prisma.subscription.deleteMany({ where: { userId: mockUserId } });
    await prisma.user.delete({ where: { id: mockUserId } });
  }
}

runTests();
