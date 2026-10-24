import http from 'http';
import { URL } from 'url';

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`PASS: ${message}`);
  } else {
    console.error(`FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

function makeApiRequest(payload: { url?: string }, customHeaders: Record<string, string> = {}): Promise<{
  statusCode: number;
  body: any;
}> {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: 4000,
        path: '/api/public/free-analysis',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
          ...customHeaders
        },
        timeout: 15000
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed: any;
          try {
            parsed = JSON.parse(raw);
          } catch {
            parsed = raw;
          }
          resolve({
            statusCode: res.statusCode || 0,
            body: parsed
          });
        });
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });
    req.on('error', (err) => reject(err));
    req.write(data);
    req.end();
  });
}

async function runE2EVerification() {
  console.log('\n================================================================');
  console.log('RUNNING WEBSITE CHECKER END-TO-END VERIFICATION');
  console.log('================================================================\n');

  // Generate a distinct IP header to ensure test isolation from previous runs
  const testIp = `198.51.100.${Math.floor(Math.random() * 200) + 10}`;

  // -------------------------------------------------------------
  // Test 1: Valid Public HTTPS URL (https://example.com)
  // -------------------------------------------------------------
  console.log('--- Test 1: Valid Public HTTPS URL (https://example.com) ---');
  const validRes = await makeApiRequest(
    { url: 'https://example.com' },
    { 'X-Forwarded-For': testIp }
  );

  assert(validRes.statusCode === 200, `API responds with HTTP 200 OK (got ${validRes.statusCode})`);
  const data = validRes.body;

  // Basic properties
  assert(data.url === 'https://example.com/' || data.url === 'https://example.com', `Matches initial URL (got ${data.url})`);
  assert(typeof data.overallScore === 'number' && data.overallScore >= 0 && data.overallScore <= 100, `Valid overall score: ${data.overallScore}/100`);
  assert(data.pagesAnalyzed === 1, 'pagesAnalyzed is 1');
  assert(!!data.testedAt, 'Includes ISO testedAt timestamp');

  // Performance timings
  assert(typeof data.timings?.ttfbMs === 'number', `Real TTFB measurement: ${data.timings.ttfbMs} ms`);
  assert(typeof data.timings?.downloadMs === 'number', `Real download duration: ${data.timings.downloadMs} ms`);
  assert(typeof data.timings?.totalDurationMs === 'number', `Real total duration: ${data.timings.totalDurationMs} ms`);
  assert(typeof data.timings?.notes === 'string', 'Includes explicit timing notes');

  // HTTP response metadata
  assert(data.http?.statusCode === 200, `HTTP status code is 200 (got ${data.http?.statusCode})`);
  assert(data.http?.contentType?.includes('text/html'), `Content-Type is HTML: ${data.http?.contentType}`);
  assert(typeof data.http?.htmlSizeBytes === 'number' && data.http.htmlSizeBytes > 0, `Real HTML size: ${data.http?.htmlSizeBytes} bytes`);

  // Security metadata
  assert(data.security?.isHttps === true, 'Detected HTTPS connection');
  assert(!!data.security?.headers, 'Inspects security response headers');

  // Category breakdowns (Must be exactly 8)
  assert(Array.isArray(data.categoryScores) && data.categoryScores.length === 8, `Renders all 8 categories (got ${data.categoryScores?.length})`);
  const expectedCategories = [
    'Technical SEO',
    'Performance',
    'Security & HTTPS',
    'Metadata & Content Structure',
    'Images & Accessibility',
    'Social Sharing',
    'Structured Data',
    'Indexability & Crawling'
  ];
  for (const catName of expectedCategories) {
    const cat = data.categoryScores.find((c: any) => c.category === catName);
    assert(!!cat && typeof cat.score === 'number', `Category "${catName}" has valid score: ${cat?.score}`);
  }

  // Findings list — verifies NO 3-card truncation!
  assert(Array.isArray(data.findings), 'Returns findings list');
  assert(data.findings.length > 3, `Returns comprehensive findings without truncation (got ${data.findings.length} findings, expected > 3)`);
  assert(Array.isArray(data.topIssues), 'Returns topIssues for summary consumers');

  // Verify finding structure
  const firstFinding = data.findings[0];
  assert(!!firstFinding.title && !!firstFinding.description && !!firstFinding.priority && !!firstFinding.category, 'Finding contains title, description, priority, and category');
  assert(firstFinding.recommendation !== undefined, 'Finding contains actionable remediation recommendation');

  // Explicit limitations
  assert(Array.isArray(data.limitations) && data.limitations.length >= 4, 'Includes explicit audit scope & methodology limitations');

  // -------------------------------------------------------------
  // Test 2: Invalid URL Format
  // -------------------------------------------------------------
  console.log('\n--- Test 2: Invalid URL Format ---');
  const invalidIp = `198.51.100.${Math.floor(Math.random() * 200) + 10}`;
  const invalidRes = await makeApiRequest(
    { url: 'not-a-valid-url' },
    { 'X-Forwarded-For': invalidIp }
  );
  assert(invalidRes.statusCode === 400, `Rejects invalid URL format with HTTP 400 (got ${invalidRes.statusCode})`);
  assert(invalidRes.body.message?.includes('Invalid URL'), `Error message mentions invalid URL: ${invalidRes.body.message}`);

  // -------------------------------------------------------------
  // Test 3: Non-existent Domain (DNS Failure)
  // -------------------------------------------------------------
  console.log('\n--- Test 3: Non-existent Domain (DNS Failure) ---');
  const nonExistentIp = `198.51.100.${Math.floor(Math.random() * 200) + 10}`;
  const nonExistentRes = await makeApiRequest(
    { url: 'https://nonexistent-domain-test-123456789.org' },
    { 'X-Forwarded-For': nonExistentIp }
  );
  assert(nonExistentRes.statusCode === 400, `Handles DNS failure with HTTP 400 (got ${nonExistentRes.statusCode})`);
  assert(nonExistentRes.body.message?.includes('DNS resolution failed'), `Provides clear DNS error message: ${nonExistentRes.body.message}`);

  // -------------------------------------------------------------
  // Test 4: Localhost & Private IP SSRF Prevention
  // -------------------------------------------------------------
  console.log('\n--- Test 4: Localhost & Private IP SSRF Prevention ---');
  const ssrfIp = `198.51.100.${Math.floor(Math.random() * 200) + 10}`;
  const ssrfLocalRes = await makeApiRequest(
    { url: 'http://127.0.0.1:4000/api/public/free-analysis' },
    { 'X-Forwarded-For': ssrfIp }
  );
  assert(ssrfLocalRes.statusCode === 400, `Blocks localhost SSRF with HTTP 400 (got ${ssrfLocalRes.statusCode})`);
  assert(ssrfLocalRes.body.message?.includes('SSRF blocked'), `Confirms SSRF blocked message: ${ssrfLocalRes.body.message}`);

  const ssrfMetaRes = await makeApiRequest(
    { url: 'http://169.254.169.254/latest/meta-data/' },
    { 'X-Forwarded-For': ssrfIp }
  );
  assert(ssrfMetaRes.statusCode === 400, `Blocks cloud metadata SSRF with HTTP 400 (got ${ssrfMetaRes.statusCode})`);
  assert(ssrfMetaRes.body.message?.includes('SSRF blocked'), `Confirms SSRF metadata blocked message: ${ssrfMetaRes.body.message}`);

  // -------------------------------------------------------------
  // Test 5: HTTP Redirect Tracking
  // -------------------------------------------------------------
  console.log('\n--- Test 5: HTTP Redirect Tracking ---');
  const redirectIp = `198.51.100.${Math.floor(Math.random() * 200) + 10}`;
  // http://google.com redirects to http://www.google.com/ (301 redirect)
  const redirectRes = await makeApiRequest(
    { url: 'http://google.com' },
    { 'X-Forwarded-For': redirectIp }
  );
  assert(redirectRes.statusCode === 200, 'Redirected URL successfully completes with 200 OK');
  assert(redirectRes.body.http?.redirectCount >= 1, `Captures redirect count: ${redirectRes.body.http?.redirectCount} hop(s)`);
  assert(redirectRes.body.finalUrl?.includes('www.google.com'), `Captures final destination URL: ${redirectRes.body.finalUrl}`);

  // -------------------------------------------------------------
  // Test 6: Rate Limiting Enforcement (Requirement 10)
  // -------------------------------------------------------------
  console.log('\n--- Test 6: Rate Limiting Enforcement ---');
  const rateLimitTestIp = `203.0.113.${Math.floor(Math.random() * 200) + 10}`;

  // Send requests until rate limit is reached
  let hitRateLimit = false;
  for (let i = 1; i <= 4; i++) {
    const res = await makeApiRequest(
      { url: 'https://example.com' },
      { 'X-Forwarded-For': rateLimitTestIp }
    );
    if (res.statusCode === 429) {
      hitRateLimit = true;
      assert(res.body.message?.includes('Rate limit exceeded'), `429 message contains "Rate limit exceeded": ${res.body.message}`);
      console.log(`PASS: Rate limit triggered as expected on request #${i}`);
      break;
    }
  }
  assert(hitRateLimit, 'Rate limit strictly enforced after reaching max request threshold (HTTP 429)');

  console.log('\n================================================================');
  console.log('✅ ALL WEBSITE CHECKER END-TO-END VERIFICATIONS PASSED!');
  console.log('================================================================\n');
}

runE2EVerification().catch((err) => {
  console.error('❌ E2E verification failed:', err);
  process.exit(1);
});
