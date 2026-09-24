import { PrismaClient } from '@prisma/client';
import { generateContentPlan } from '../services/contentCalendar/generatePlan';
import { dailyContentGeneration } from '../trigger/dailyContentGeneration';

const prisma = new PrismaClient();

async function runCalendarTests() {
  console.log('==================================================');
  console.log('RUNNING CONTENT CALENDAR & AUTOMATION TESTS');
  console.log('==================================================\n');

  let passed = 0;
  let failed = 0;

  function assertEqual(expected: any, actual: any, message: string) {
    if (expected === actual) {
      console.log(`PASS: ${message}`);
      passed++;
    } else {
      console.error(`FAIL: ${message} (Expected: ${expected}, Got: ${actual})`);
      failed++;
    }
  }

  function assert(condition: boolean, message: string) {
    if (condition) {
      console.log(`PASS: ${message}`);
      passed++;
    } else {
      console.error(`FAIL: ${message}`);
      failed++;
    }
  }

  try {
    console.log('\nSUMMARY: ' + passed + ' Passed, ' + failed + ' Failed\n');
    console.log('==================================================');
  } catch (err) {
    console.error('Fatal Test Error:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runCalendarTests();
