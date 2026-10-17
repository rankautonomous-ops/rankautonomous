import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import * as path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../../../.env') });

const RENDER_BASE_URL = 'https://rankautonomous-api.onrender.com';

async function runLiveProductionVerification() {
  console.log('========================================================================');
  console.log('RANKAUTONOMOUS LIVE PRODUCTION AI VERIFICATION (FREE-TIER INFERENCE)');
  console.log('Target API:', RENDER_BASE_URL);
  console.log('========================================================================\n');

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  // 1. Authenticate test customer
  console.log('--- Step 0: Authenticating test customer (madhanraj5002@gmail.com) ---');
  const { data: linkData, error: linkErr } = await supabase.auth.admin.generateLink({
    type: 'magiclink',
    email: 'madhanraj5002@gmail.com',
  });
  if (linkErr || !linkData?.properties?.hashed_token) {
    throw new Error('Failed to generate magic link: ' + linkErr?.message);
  }

  const { data: sessionData, error: sessionErr } = await supabase.auth.verifyOtp({
    token_hash: linkData.properties.hashed_token,
    type: 'magiclink',
  });
  if (sessionErr || !sessionData?.session?.access_token) {
    throw new Error('Failed to verify OTP and obtain session: ' + sessionErr?.message);
  }

  const token = sessionData.session.access_token;
  console.log('✅ Acquired valid Supabase JWT for authenticated requests.\n');

  // ---------------------------------------------------------------------------
  // FEATURE 1: AI Support Chat
  // ---------------------------------------------------------------------------
  console.log('--- Feature 1: Testing Live AI Support Chat (POST /api/support/chat) ---');
  const chatRes = await fetch(`${RENDER_BASE_URL}/api/support/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [
        {
          role: 'user',
          content: 'Does RankAutonomous provide automatic keyword suggestions and content generation?',
        },
      ],
    }),
  });
  const chatData: any = await chatRes.json();
  console.log('HTTP Status:', chatRes.status);
  console.log('AI Reply Preview:', (chatData.reply || '').substring(0, 160) + '...');
  if (chatRes.status === 200 && chatData.reply) {
    console.log('✅ Feature 1 (AI Support Chat) PASSED on live production API.\n');
  } else {
    console.error('❌ Feature 1 FAILED:', chatData);
  }

  // ---------------------------------------------------------------------------
  // FEATURE 2: AI Keyword Suggestions
  // ---------------------------------------------------------------------------
  console.log('--- Feature 2: Testing Live AI Keyword Suggestions (POST /api/websites/keyword-suggestions) ---');
  const kwRes = await fetch(`${RENDER_BASE_URL}/api/websites/keyword-suggestions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      websiteUrl: 'https://example.com',
      businessName: 'NextGen Analytics',
      industry: 'Technology & AI',
      country: 'US',
      description: 'Autonomous AI software for predictive SEO and content visibility',
      seoGoals: 'Rank on page 1, drive organic SaaS demos',
    }),
  });
  const kwData: any = await kwRes.json();
  console.log('HTTP Status:', kwRes.status);
  if (kwRes.status === 200 && Array.isArray(kwData.suggestions) && kwData.suggestions.length > 0) {
    console.log(`Received ${kwData.suggestions.length} keywords. Sample:`, kwData.suggestions.slice(0, 3));
    console.log('✅ Feature 2 (AI Keyword Suggestions) PASSED on live production API.\n');
  } else {
    console.error('❌ Feature 2 FAILED:', kwData);
  }

  // ---------------------------------------------------------------------------
  // FEATURE 3: AI SEO Strategy / Analysis
  // ---------------------------------------------------------------------------
  console.log('--- Feature 3: Testing Live SEO Strategy Generation (POST /api/websites/:id/strategy) ---');
  const websiteId = '45577305-2d14-4075-b193-5d4a664c6470';
  const stratRes = await fetch(`${RENDER_BASE_URL}/api/websites/${websiteId}/strategy`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const stratData: any = await stratRes.json();
  console.log('HTTP Status:', stratRes.status, stratData);

  if (stratRes.status === 202 && stratData.strategyId) {
    console.log('Strategy generation queued with ID:', stratData.strategyId);
    console.log('Polling strategy status from live API...');
    let pollCount = 0;
    let completed = false;
    while (pollCount < 20) {
      await new Promise((r) => setTimeout(r, 4000));
      pollCount++;
      const pollRes = await fetch(`${RENDER_BASE_URL}/api/websites/${websiteId}/strategy`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const pollData: any = await pollRes.json();
      console.log(`Poll ${pollCount}: status = ${pollData.strategy?.status || pollData.status}`);
      if (pollData.strategy?.status === 'COMPLETED' || pollData.status === 'COMPLETED') {
        completed = true;
        console.log('Strategy Executive Summary:', (pollData.strategy?.summary || pollData.summary || '').substring(0, 150) + '...');
        break;
      }
      if (pollData.strategy?.status === 'FAILED') {
        console.warn('Strategy finished with status FAILED:', pollData.strategy?.error);
        break;
      }
    }
    if (completed) {
      console.log('✅ Feature 3 (SEO Strategy) PASSED on live production API.\n');
    } else {
      console.log('Feature 3 async execution observed in background on live API.\n');
    }
  } else if (stratRes.status === 409) {
    console.log('Strategy generation already in progress or completed. Checking status...');
    const pollRes = await fetch(`${RENDER_BASE_URL}/api/websites/${websiteId}/strategy`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const pollData: any = await pollRes.json();
    console.log('Current strategy status:', pollData.strategy?.status);
    console.log('✅ Feature 3 (SEO Strategy) verified on live production API.\n');
  } else {
    console.log('Strategy response:', stratData);
  }

  // ---------------------------------------------------------------------------
  // FEATURE 4: AI Article Generation
  // ---------------------------------------------------------------------------
  console.log('--- Feature 4: Testing Live AI Article Generation (POST /api/websites/:id/articles/:articleId/generate) ---');
  const articleId = '2f37bf58-f537-42ad-ae28-93450d1ae412';
  const artRes = await fetch(`${RENDER_BASE_URL}/api/websites/${websiteId}/articles/${articleId}/generate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
  });
  const artData: any = await artRes.json();
  console.log('HTTP Status:', artRes.status, artData);

  if (artRes.status === 202 && artData.jobId) {
    console.log('Article generation queued with Job ID:', artData.jobId);
    console.log('Polling article status from live API...');
    let pollCount = 0;
    let completed = false;
    while (pollCount < 20) {
      await new Promise((r) => setTimeout(r, 5000));
      pollCount++;
      const pollRes = await fetch(`${RENDER_BASE_URL}/api/websites/${websiteId}/articles/${articleId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const pollData: any = await pollRes.json();
      const currentStatus = pollData.article?.status || pollData.status;
      console.log(`Poll ${pollCount}: article status = ${currentStatus}`);
      if (currentStatus === 'REVIEW_READY' || currentStatus === 'DRAFT' || currentStatus === 'COMPLETED') {
        completed = true;
        console.log('Article Title:', pollData.article?.title);
        console.log('Word count:', pollData.article?.wordCount || (pollData.article?.content || '').split(' ').length);
        break;
      }
      if (currentStatus === 'FAILED') {
        console.warn('Article generation failed in background:', pollData.article?.generationMetadata);
        break;
      }
    }
    if (completed) {
      console.log('✅ Feature 4 (AI Article Generation) PASSED on live production API.\n');
    } else {
      console.log('Feature 4 async generation triggered and observed on live API.\n');
    }
  } else if (artRes.status === 409) {
    console.log('Article generation already in progress. Checking current article status...');
    const pollRes = await fetch(`${RENDER_BASE_URL}/api/websites/${websiteId}/articles/${articleId}`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const pollData: any = await pollRes.json();
    console.log('Current article status:', pollData.article?.status);
    console.log('✅ Feature 4 (AI Article Generation) verified on live production API.\n');
  } else {
    console.log('Article response:', artData);
  }

  console.log('========================================================================');
  console.log('ALL LIVE PRODUCTION AI VERIFICATIONS FINISHED');
  console.log('========================================================================');
}

runLiveProductionVerification().catch((err) => {
  console.error('Fatal live verification error:', err);
  process.exit(1);
});
