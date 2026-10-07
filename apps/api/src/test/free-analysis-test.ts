import { runFreeAnalysis } from '../services/freeAnalysis';
import request from 'supertest';
import express from 'express';
import publicRouter from '../routes/public';

const app = express();
app.use(express.json());
// Trust proxy for IP rate limit testing
app.set('trust proxy', true);
app.use('/api/public', publicRouter);

async function main() {
  console.log('--- Running Free Analysis Tests ---');
  let exitCode = 0;

  try {
    // 1. Test Valid Public URL directly
    console.log('Test 1: Valid Public URL (Service level)');
    const result = await runFreeAnalysis('https://example.com');
    if (!result || result.overallScore === undefined || !result.url) {
      throw new Error('Result missing expected properties');
    }
    console.log('✅ Valid URL passed');

    // 2. Test Invalid URL directly
    console.log('Test 2: Invalid URL (Service level)');
    try {
      await runFreeAnalysis('not-a-url');
      throw new Error('Should have failed for invalid URL');
    } catch (e: any) {
      if (e.message.includes('Invalid URL provided.')) {
        console.log('✅ Invalid URL correctly rejected');
      } else {
        throw new Error(`Unexpected error message: ${e.message}`);
      }
    }

    // 3. Test Localhost/SSRF SSRF Safe Fetch (API level)
    console.log('Test 3: Localhost SSRF via API');
    const ssrfRes = await request(app)
      .post('/api/public/free-analysis')
      .send({ url: 'http://127.0.0.1:4000' });
    if (ssrfRes.status !== 400 || !ssrfRes.body.message.includes('Failed to crawl')) {
      throw new Error(`SSRF not blocked correctly: ${ssrfRes.status} ${JSON.stringify(ssrfRes.body)}`);
    }
    console.log('✅ SSRF correctly blocked');

    // 4. Test Unauthenticated Access and Rate Limiting
    console.log('Test 4: Unauthenticated Access & Rate Limiting');
    
    // Send 3 requests (should pass or fail cleanly if site unreachable, but not rate limit)
    // We'll use a fast-failing URL so it doesn't take long
    const dummyUrl = 'http://example.com';
    let rateLimitRes;
    
    for (let i = 0; i < 3; i++) {
       await request(app)
        .post('/api/public/free-analysis')
        .set('X-Forwarded-For', '192.168.1.5')
        .send({ url: dummyUrl });
    }

    // 4th request should hit rate limit
    rateLimitRes = await request(app)
        .post('/api/public/free-analysis')
        .set('X-Forwarded-For', '192.168.1.5')
        .send({ url: dummyUrl });

    if (rateLimitRes.status !== 429) {
      throw new Error(`Rate limit did not trigger, got status ${rateLimitRes.status}`);
    }
    console.log('✅ Rate Limiting works');

  } catch (err: any) {
    console.error('❌ Test failed:', err);
    exitCode = 1;
  }

  process.exit(exitCode);
}

main();
