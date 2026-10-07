import request from 'supertest';
import express from 'express';
// Using require since esModuleInterop is causing issues
// Or just require it if TS complains
const supportRoute = require('../routes/support').default || require('../routes/support');

const app = express();
app.use(express.json());
app.set('trust proxy', true);
app.use('/api/support', supportRoute);

async function main() {
  console.log('--- Running Support API Tests ---');
  let exitCode = 0;

  try {
    // 1. Test Empty Message Validation
    console.log('Test 1: Empty Message Rejection');
    const emptyRes = await request(app)
      .post('/api/support/chat')
      .send({ messages: [{ role: 'user', content: '   ' }] });
    if (emptyRes.status !== 400 || !emptyRes.body.error.includes('cannot be empty')) {
      throw new Error(`Empty message not rejected properly: ${emptyRes.status}`);
    }
    console.log('✅ Empty message rejected');

    // 2. Test Oversized Message Validation
    console.log('Test 2: Oversized Message Rejection');
    const longString = 'a'.repeat(2500);
    const largeRes = await request(app)
      .post('/api/support/chat')
      .send({ messages: [{ role: 'user', content: longString }] });
    if (largeRes.status !== 400 || !largeRes.body.error.includes('2000 character limit')) {
      throw new Error(`Large message not rejected properly: ${largeRes.status}`);
    }
    console.log('✅ Large message rejected');

    // 3. Test Invalid Body Format
    console.log('Test 3: Invalid Body Format');
    const formatRes = await request(app)
      .post('/api/support/chat')
      .send({ content: 'Hello' }); // Missing messages array
    if (formatRes.status !== 400) {
      throw new Error('Should reject missing messages array');
    }
    console.log('✅ Invalid format rejected');

    // 4. Test Rate Limiting
    console.log('Test 4: Rate Limiting (Public limit is 5)');
    let rateLimitRes;
    for (let i = 0; i < 5; i++) {
      await request(app)
        .post('/api/support/chat')
        .set('X-Forwarded-For', '10.0.0.99') // Use a unique IP to avoid clashing
        .send({ messages: [{ role: 'user', content: 'Hello' }] });
    }
    
    rateLimitRes = await request(app)
      .post('/api/support/chat')
      .set('X-Forwarded-For', '10.0.0.99')
      .send({ messages: [{ role: 'user', content: 'Hello again' }] });

    if (rateLimitRes.status !== 429) {
      throw new Error(`Rate limit did not trigger, got status ${rateLimitRes.status}`);
    }
    console.log('✅ Rate Limiting works');

    // 5. Normal Public Chat
    console.log('Test 5: Public Chat Call');
    const chatRes = await request(app)
      .post('/api/support/chat')
      .set('X-Forwarded-For', '10.0.0.100')
      .send({ messages: [{ role: 'user', content: 'What is RankAutonomous?' }] });
      
    if (chatRes.status !== 200 || !chatRes.body.reply) {
      throw new Error(`Chat API failed: ${chatRes.status} - ${JSON.stringify(chatRes.body)}`);
    }
    console.log('✅ Chat API successfully returned a reply');
    
  } catch (err: any) {
    console.error('❌ Test failed:', err);
    exitCode = 1;
  }

  process.exit(exitCode);
}

main();
