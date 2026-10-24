import request from 'supertest';
import app, { isAllowedOrigin } from '../index';
import { setAiProvider, AiProviderError } from '../services/aiProvider';

async function main() {
  console.log('--- Running Support API & CORS Regression Tests ---');
  let exitCode = 0;

  setAiProvider({
    generateCompletion: async () => 'RankAutonomous is an autonomous SEO visibility platform.'
  });

  try {
    // 1. Test CORS Origin Validator
    console.log('Test 1: CORS Origin Validation logic');
    if (!isAllowedOrigin('https://rankautonomous.com')) throw new Error('Failed to allow apex domain');
    if (!isAllowedOrigin('https://www.rankautonomous.com')) throw new Error('Failed to allow www domain');
    if (!isAllowedOrigin('https://app.rankautonomous.com')) throw new Error('Failed to allow subdomain');
    if (!isAllowedOrigin('https://preview-123.vercel.app')) throw new Error('Failed to allow vercel preview');
    if (!isAllowedOrigin('http://localhost:3000')) throw new Error('Failed to allow localhost:3000');
    if (isAllowedOrigin('https://malicious-attacker.com')) throw new Error('Should deny unverified third-party origin');
    console.log('✅ CORS Origin Validator works accurately');

    // 2. Test CORS Preflight OPTIONS on /api/support/chat with www origin
    console.log('Test 2: CORS Preflight OPTIONS with https://www.rankautonomous.com');
    const corsOptionsRes = await request(app)
      .options('/api/support/chat')
      .set('Origin', 'https://www.rankautonomous.com')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type,Authorization');

    if (corsOptionsRes.status !== 204 && corsOptionsRes.status !== 200) {
      throw new Error(`Expected 204/200 for OPTIONS, received ${corsOptionsRes.status}`);
    }
    const allowOriginHeader = corsOptionsRes.headers['access-control-allow-origin'];
    if (allowOriginHeader !== 'https://www.rankautonomous.com') {
      throw new Error(`Expected Access-Control-Allow-Origin: https://www.rankautonomous.com, got: ${allowOriginHeader}`);
    }
    console.log('✅ CORS preflight for www.rankautonomous.com succeeded with 204 No Content');

    // 3. Test CORS Preflight OPTIONS on /api/websites/keyword-suggestions with www origin
    console.log('Test 3: CORS Preflight OPTIONS on keyword-suggestions with www origin');
    const kwCorsRes = await request(app)
      .options('/api/websites/keyword-suggestions')
      .set('Origin', 'https://www.rankautonomous.com')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'Content-Type,Authorization');

    if (kwCorsRes.status !== 204 && kwCorsRes.status !== 200) {
      throw new Error(`Expected 204/200 for OPTIONS, received ${kwCorsRes.status}`);
    }
    if (kwCorsRes.headers['access-control-allow-origin'] !== 'https://www.rankautonomous.com') {
      throw new Error(`Expected Access-Control-Allow-Origin: https://www.rankautonomous.com on keyword suggestions`);
    }
    console.log('✅ CORS preflight on keyword-suggestions succeeded for www domain');

    // 4. Test Empty Message Rejection
    console.log('Test 4: Empty Message Rejection');
    const emptyRes = await request(app)
      .post('/api/support/chat')
      .set('Origin', 'https://www.rankautonomous.com')
      .send({ messages: [{ role: 'user', content: '   ' }] });
    if (emptyRes.status !== 400 || !emptyRes.body.error.includes('cannot be empty')) {
      throw new Error(`Empty message not rejected properly: ${emptyRes.status}`);
    }
    console.log('✅ Empty message rejected');

    // 5. Test Oversized Message Rejection
    console.log('Test 5: Oversized Message Rejection');
    const longString = 'a'.repeat(2500);
    const largeRes = await request(app)
      .post('/api/support/chat')
      .set('Origin', 'https://www.rankautonomous.com')
      .send({ messages: [{ role: 'user', content: longString }] });
    if (largeRes.status !== 400 || !largeRes.body.error.includes('2000 character limit')) {
      throw new Error(`Large message not rejected properly: ${largeRes.status}`);
    }
    console.log('✅ Large message rejected');

    // 6. Test Invalid Body Format
    console.log('Test 6: Invalid Body Format');
    const formatRes = await request(app)
      .post('/api/support/chat')
      .set('Origin', 'https://www.rankautonomous.com')
      .send({ content: 'Hello' }); // Missing messages array
    if (formatRes.status !== 400) {
      throw new Error('Should reject missing messages array');
    }
    console.log('✅ Invalid format rejected');

    // 7. Normal Public Chat
    console.log('Test 7: Public Chat Call with www Origin');
    const chatRes = await request(app)
      .post('/api/support/chat')
      .set('Origin', 'https://www.rankautonomous.com')
      .set('X-Forwarded-For', '10.0.0.120')
      .send({ messages: [{ role: 'user', content: 'What is RankAutonomous?' }] });
      
    if (chatRes.status !== 200 || !chatRes.body.reply) {
      throw new Error(`Chat API failed: ${chatRes.status} - ${JSON.stringify(chatRes.body)}`);
    }
    if (chatRes.headers['access-control-allow-origin'] !== 'https://www.rankautonomous.com') {
      throw new Error('Missing CORS allow-origin header on response');
    }
    console.log('✅ Chat API successfully returned a reply with valid CORS headers');

    // 8. Test Provider Error Handling
    console.log('Test 8: AI Provider Error Propagation as JSON');
    setAiProvider({
      generateCompletion: async () => {
        throw new AiProviderError('Gemini API rate limit exceeded.', 429, 'AI_RATE_LIMITED', true);
      }
    });

    const errRes = await request(app)
      .post('/api/support/chat')
      .set('Origin', 'https://www.rankautonomous.com')
      .set('X-Forwarded-For', '10.0.0.121')
      .send({ messages: [{ role: 'user', content: 'Test rate limit' }] });

    if (errRes.status !== 429 || !errRes.body.error) {
      throw new Error(`Expected status 429 JSON response, got ${errRes.status}: ${JSON.stringify(errRes.body)}`);
    }
    console.log('✅ AI Provider error handled as JSON status 429 without HTML');

    // 9. Test AI Completion Options: maxTokens >= 2048 & Un-truncated System Prompt
    console.log('Test 9: Verify maxTokens is at least 2048 and prompt mandates complete answers');
    let capturedOptions: any = null;
    setAiProvider({
      generateCompletion: async (opts) => {
        capturedOptions = opts;
        return 'Detailed, step-by-step guidance without truncation.';
      }
    });

    const fullAnswerRes = await request(app)
      .post('/api/support/chat')
      .set('Origin', 'https://www.rankautonomous.com')
      .set('X-Forwarded-For', '10.0.0.122')
      .send({
        messages: [
          { role: 'user', content: 'Explain technical SEO audit steps and how RankAutonomous implements them.' }
        ]
      });

    if (fullAnswerRes.status !== 200 || !fullAnswerRes.body.reply) {
      throw new Error(`Expected 200 OK, got ${fullAnswerRes.status}: ${JSON.stringify(fullAnswerRes.body)}`);
    }

    if (!capturedOptions) {
      throw new Error('generateCompletion was not called');
    }

    if (!capturedOptions.maxTokens || capturedOptions.maxTokens < 2048) {
      throw new Error(`maxTokens is too small (${capturedOptions.maxTokens}), expected >= 2048`);
    }

    if (capturedOptions.systemPrompt.includes('Be concise, helpful, and actionable')) {
      throw new Error('System prompt still contains outdated "Be concise" instruction');
    }

    if (!capturedOptions.systemPrompt.includes('step-by-step guidance') || !capturedOptions.systemPrompt.includes('cutting off mid-sentence')) {
      throw new Error('System prompt missing complete, step-by-step guidance instructions');
    }

    console.log('✅ AI Provider called with maxTokens >= 2048 and complete answer system prompt');

  } catch (err: any) {
    console.error('❌ Test failed:', err);
    exitCode = 1;
  } finally {
    setAiProvider(null);
  }

  process.exit(exitCode);
}

main();

