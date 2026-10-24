import {
  isPrivateIP,
  validatePreflightUrl
} from '../services/freeAnalysis/httpFetcher';
import { runAllWebsiteChecks } from '../services/freeAnalysis/checks';
import { calculateWebsiteOverallScore, CATEGORY_WEIGHTS } from '../services/freeAnalysis/scoring';
import { HttpResponseData } from '../services/freeAnalysis/types';

function assert(condition: boolean, message: string) {
  if (condition) {
    console.log(`PASS: ${message}`);
  } else {
    console.error(`FAIL: ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runComprehensiveTests() {
  console.log('\n==================================================');
  console.log('RUNNING COMPREHENSIVE WEBSITE CHECKER TESTS');
  console.log('==================================================\n');

  // -------------------------------------------------------------
  // TEST GROUP 1: SSRF & IP Restriction Validation
  // -------------------------------------------------------------
  console.log('--- Test Group 1: SSRF Defense & IP Filtering ---');
  
  // Private IPv4 ranges
  assert(isPrivateIP('127.0.0.1'), 'Blocks 127.0.0.1 (Loopback)');
  assert(isPrivateIP('127.1.2.3'), 'Blocks 127.0.0.0/8 subnet');
  assert(isPrivateIP('10.0.0.1'), 'Blocks 10.0.0.0/8 (Private A)');
  assert(isPrivateIP('172.16.0.1'), 'Blocks 172.16.0.0/12 (Private B)');
  assert(isPrivateIP('172.31.255.255'), 'Blocks 172.31.255.255 (Private B boundary)');
  assert(isPrivateIP('192.168.1.1'), 'Blocks 192.168.0.0/16 (Private C)');
  assert(isPrivateIP('169.254.169.254'), 'Blocks 169.254.169.254 (Cloud metadata & link-local)');
  assert(isPrivateIP('100.64.0.1'), 'Blocks 100.64.0.0/10 (CGNAT & GCP metadata)');
  assert(isPrivateIP('0.0.0.0'), 'Blocks 0.0.0.0/8');

  // IPv6 checks
  assert(isPrivateIP('::1'), 'Blocks IPv6 loopback ::1');
  assert(isPrivateIP('0:0:0:0:0:0:0:1'), 'Blocks full IPv6 loopback');
  assert(isPrivateIP('fc00::1'), 'Blocks IPv6 Unique Local fc00::/7');
  assert(isPrivateIP('fd12:3456:789a::1'), 'Blocks IPv6 Unique Local fd00::/8');
  assert(isPrivateIP('fe80::1'), 'Blocks IPv6 Link-Local fe80::/10');
  assert(isPrivateIP('::ffff:127.0.0.1'), 'Blocks IPv4-mapped IPv6 loopback');
  assert(isPrivateIP('::ffff:169.254.169.254'), 'Blocks IPv4-mapped IPv6 metadata address');

  // Public IPs allowed
  assert(!isPrivateIP('93.184.216.34'), 'Allows public IPv4 (example.com)');
  assert(!isPrivateIP('8.8.8.8'), 'Allows public IPv4 (Google DNS)');
  assert(!isPrivateIP('2606:4700:4700::1111'), 'Allows public IPv6 (Cloudflare DNS)');

  // Preflight URL validation
  const localRes = validatePreflightUrl('http://localhost:8080');
  assert(!localRes.valid, 'Rejects localhost hostname');

  const privateRes = validatePreflightUrl('http://192.168.1.100/admin');
  assert(!privateRes.valid, 'Rejects direct private IP URL');

  const metaRes = validatePreflightUrl('http://169.254.169.254/latest/meta-data/');
  assert(!metaRes.valid, 'Rejects AWS metadata IP URL');

  const badProto = validatePreflightUrl('ftp://example.com/file');
  assert(!badProto.valid, 'Rejects non-HTTP/HTTPS protocol (ftp)');

  const validPreflight = validatePreflightUrl('https://example.com/blog');
  assert(validPreflight.valid, 'Accepts valid HTTPS URL');

  // -------------------------------------------------------------
  // TEST GROUP 2: Perfect Fixture (All Categories Optimal)
  // -------------------------------------------------------------
  console.log('\n--- Test Group 2: High Quality Website Fixture ---');

  const perfectHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <title>Autonomous SEO Engine &amp; Growth Platform</title>
      <meta name="description" content="RankAutonomous delivers automated programmatic SEO, autonomous blog publishing, and high-authority backlinks.">
      <link rel="canonical" href="https://rankautonomous.com">
      <meta property="og:title" content="RankAutonomous AI SEO">
      <meta property="og:description" content="Autonomous programmatic SEO platform for modern growth teams.">
      <meta property="og:image" content="https://rankautonomous.com/og.jpg">
      <meta property="og:url" content="https://rankautonomous.com">
      <meta property="og:type" content="website">
      <meta name="twitter:card" content="summary_large_image">
      <script type="application/ld+json">
      {
        "@context": "https://schema.org",
        "@type": "SoftwareApplication",
        "name": "RankAutonomous",
        "applicationCategory": "BusinessApplication"
      }
      </script>
    </head>
    <body>
      <h1>Automate Your Organic Growth with AI SEO</h1>
      <p>This is a complete, well-formed web page that contains substantial, high-quality descriptive copy. We provide comprehensive automated SEO workflows, programmatic article generation, high-tier backlink discovery, and deep technical audits. Our software helps marketing leaders and founders scale their search presence without manual content bottlenecks or agency retainers.</p>
      <p>Every article generated is checked against search intent, structured data guidelines, and keyword distribution rules to ensure maximum search visibility and long-term ranking stability.</p>
      <img src="https://rankautonomous.com/logo.png" alt="RankAutonomous Platform Logo" width="200" height="50">
    </body>
    </html>
  `;

  const perfectHttp: HttpResponseData = {
    initialUrl: 'https://rankautonomous.com',
    finalUrl: 'https://rankautonomous.com',
    statusCode: 200,
    statusText: 'OK',
    redirectCount: 0,
    redirectChain: [],
    contentType: 'text/html; charset=utf-8',
    contentEncoding: 'gzip',
    headers: {
      'content-type': 'text/html; charset=utf-8',
      'content-encoding': 'gzip',
      'cache-control': 'public, max-age=3600',
      'strict-transport-security': 'max-age=31536000; includeSubDomains',
      'x-content-type-options': 'nosniff',
      'content-security-policy': "default-src 'self'",
      'x-frame-options': 'SAMEORIGIN',
      'referrer-policy': 'strict-origin-when-cross-origin'
    },
    html: perfectHtml,
    htmlSizeBytes: Buffer.byteLength(perfectHtml),
    timings: {
      ttfbMs: 140,
      downloadMs: 35,
      totalMs: 175
    },
    tls: {
      issuer: "Let's Encrypt",
      subject: 'rankautonomous.com',
      validFrom: '2026-01-01',
      validTo: '2026-12-31',
      daysRemaining: 120,
      authorized: true,
      protocol: 'TLSv1.3'
    },
    isHttps: true
  };

  const perfectRobots = {
    accessible: true,
    statusCode: 200,
    content: 'User-agent: *\nAllow: /\nSitemap: https://rankautonomous.com/sitemap.xml',
    disallowsRoot: false
  };

  const perfectAudit = runAllWebsiteChecks({ http: perfectHttp, robotsTxt: perfectRobots });
  assert(perfectAudit.categories.length === 8, 'Evaluates all 8 defined SEO categories');

  const perfectOverallScore = calculateWebsiteOverallScore(perfectAudit.categories);
  assert(perfectOverallScore >= 95, `High quality page receives score >= 95 (got ${perfectOverallScore})`);

  const criticalOrHighFindings = perfectAudit.categories
    .flatMap(c => c.findings)
    .filter(f => f.priority === 'CRITICAL' || f.priority === 'HIGH');
  assert(criticalOrHighFindings.length === 0, 'No critical or high severity findings on optimal page');

  // Verify Structured Data extraction
  assert(perfectAudit.metadata.structuredData.types.includes('SoftwareApplication'), 'Extracted SoftwareApplication schema type');
  assert(!perfectAudit.metadata.structuredData.hasMalformedJsonLd, 'Detected no JSON-LD syntax errors');

  // -------------------------------------------------------------
  // TEST GROUP 3: Defective Fixture (Missing Title, Multiple H1s, Missing Alt)
  // -------------------------------------------------------------
  console.log('\n--- Test Group 3: On-Page & Metadata Flaws ---');

  const defectiveHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <!-- Missing title tag -->
      <!-- Missing meta description -->
    </head>
    <body>
      <h1>First Heading</h1>
      <h1>Second Heading (Multiple H1s)</h1>
      <h2></h2> <!-- Empty heading -->
      <p>Thin content.</p>
      <img src="/broken-image.jpg"> <!-- Missing alt, missing width/height -->
      <img src=""> <!-- Malformed src -->
    </body>
    </html>
  `;

  const defectiveHttp: HttpResponseData = {
    ...perfectHttp,
    html: defectiveHtml,
    htmlSizeBytes: Buffer.byteLength(defectiveHtml),
    headers: {} // Missing all security headers & caching
  };

  const defectiveAudit = runAllWebsiteChecks({ http: defectiveHttp, robotsTxt: perfectRobots });
  const allDefectiveFindings = defectiveAudit.categories.flatMap(c => c.findings);

  assert(allDefectiveFindings.some(f => f.id === 'missing-title'), 'Detects missing <title> tag (HIGH)');
  assert(allDefectiveFindings.some(f => f.id === 'missing-meta-description'), 'Detects missing meta description (HIGH)');
  assert(allDefectiveFindings.some(f => f.id === 'multiple-h1'), 'Detects multiple <h1> headings as advisory');
  assert(allDefectiveFindings.some(f => f.id === 'empty-headings-detected'), 'Detects empty heading tags');
  assert(allDefectiveFindings.some(f => f.id === 'missing-image-alt'), 'Detects missing image alt attribute');
  assert(allDefectiveFindings.some(f => f.id === 'thin-content'), 'Detects thin content (< 300 words)');
  assert(allDefectiveFindings.some(f => f.id === 'missing-html-lang'), 'Detects missing html lang attribute');

  // -------------------------------------------------------------
  // TEST GROUP 4: Malformed JSON-LD Structured Data
  // -------------------------------------------------------------
  console.log('\n--- Test Group 4: Malformed JSON-LD Structured Data ---');

  const malformedJsonLdHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <title>Valid Title With Normal Length Here</title>
      <meta name="description" content="Valid meta description with appropriate length between seventy and one hundred sixty characters.">
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Organization",
          "name": "RankAutonomous",  // Trailing comma or syntax flaw
        }
      </script>
    </head>
    <body>
      <h1>Main Topic Heading</h1>
      <p>Content goes here with sufficient copy to satisfy basic length checks for testing purposes.</p>
    </body>
    </html>
  `;

  const malformedHttp: HttpResponseData = {
    ...perfectHttp,
    html: malformedJsonLdHtml
  };

  const malformedAudit = runAllWebsiteChecks({ http: malformedHttp, robotsTxt: perfectRobots });
  const malformedFindings = malformedAudit.categories.flatMap(c => c.findings);

  assert(malformedFindings.some(f => f.id === 'malformed-json-ld'), 'Detects malformed JSON-LD syntax (HIGH)');
  const structuredDataCat = malformedAudit.categories.find(c => c.category === 'Structured Data');
  assert(structuredDataCat!.score < 70, `Penalizes structured data category for syntax error (score: ${structuredDataCat!.score})`);

  // -------------------------------------------------------------
  // TEST GROUP 5: Security & Expired TLS Certificate
  // -------------------------------------------------------------
  console.log('\n--- Test Group 5: Security Headers & Expired TLS Cert ---');

  const expiredTlsHttp: HttpResponseData = {
    ...perfectHttp,
    tls: {
      issuer: 'Untrusted Authority',
      subject: 'example.com',
      validFrom: '2024-01-01',
      validTo: '2025-01-01',
      daysRemaining: -45, // Expired!
      authorized: false,
      authorizationError: 'CERT_HAS_EXPIRED',
      protocol: 'TLSv1.2'
    }
  };

  const expiredAudit = runAllWebsiteChecks({ http: expiredTlsHttp, robotsTxt: perfectRobots });
  const expiredFindings = expiredAudit.categories.flatMap(c => c.findings);

  assert(expiredFindings.some(f => f.id === 'invalid-ssl-cert'), 'Detects expired/unauthorized SSL certificate (CRITICAL)');
  const secCat = expiredAudit.categories.find(c => c.category === 'Security & HTTPS');
  assert(secCat!.score <= 65, `Penalizes security score for expired certificate (score: ${secCat!.score})`);

  // Test Plain HTTP
  const plainHttp: HttpResponseData = {
    ...perfectHttp,
    isHttps: false,
    tls: null
  };
  const plainAudit = runAllWebsiteChecks({ http: plainHttp, robotsTxt: perfectRobots });
  const plainFindings = plainAudit.categories.flatMap(c => c.findings);
  assert(plainFindings.some(f => f.id === 'insecure-http'), 'Detects plain HTTP site as insecure (HIGH)');

  // -------------------------------------------------------------
  // TEST GROUP 6: Performance Latency & Excessive HTML Size
  // -------------------------------------------------------------
  console.log('\n--- Test Group 6: Performance Timing & HTML Bloat ---');

  const slowPerfHttp: HttpResponseData = {
    ...perfectHttp,
    timings: {
      ttfbMs: 2450, // Critically slow (> 1.8s)
      downloadMs: 120,
      totalMs: 2570
    },
    htmlSizeBytes: 3.5 * 1024 * 1024, // 3.5 MB
    contentEncoding: null // Uncompressed
  };

  const slowAudit = runAllWebsiteChecks({ http: slowPerfHttp, robotsTxt: perfectRobots });
  const slowFindings = slowAudit.categories.flatMap(c => c.findings);

  assert(slowFindings.some(f => f.id === 'critical-ttfb'), 'Detects slow TTFB > 1800ms (HIGH)');
  assert(slowFindings.some(f => f.id === 'excessive-html-size'), 'Detects excessive HTML size > 2MB (HIGH)');
  assert(slowFindings.some(f => f.id === 'missing-compression'), 'Detects uncompressed HTML > 50KB (MEDIUM)');

  // -------------------------------------------------------------
  // TEST GROUP 7: Indexability Directives (Noindex & Disallow Root)
  // -------------------------------------------------------------
  console.log('\n--- Test Group 7: Indexability & Crawling Directives ---');

  const noindexHtml = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <title>Internal Staging Portal</title>
      <meta name="robots" content="noindex, nofollow">
      <link rel="canonical" href="https://example.com/staging">
    </head>
    <body><h1>Staging Environment</h1></body>
    </html>
  `;

  const blockedRobotsTxt = {
    accessible: true,
    statusCode: 200,
    content: 'User-agent: *\nDisallow: /',
    disallowsRoot: true
  };

  const blockedHttp: HttpResponseData = {
    ...perfectHttp,
    html: noindexHtml
  };

  const indexabilityAudit = runAllWebsiteChecks({ http: blockedHttp, robotsTxt: blockedRobotsTxt });
  const indexFindings = indexabilityAudit.categories.flatMap(c => c.findings);

  assert(indexFindings.some(f => f.id === 'noindex-directive'), 'Detects noindex directive (CRITICAL)');
  assert(indexFindings.some(f => f.id === 'robots-disallow-root'), 'Detects robots.txt blocking root Disallow: / (HIGH)');
  assert(indexFindings.some(f => f.id === 'noindex-canonical-conflict'), 'Detects conflict between noindex and canonical tag');

  // -------------------------------------------------------------
  // TEST GROUP 8: Mathematical Score Determinism & Weights
  // -------------------------------------------------------------
  console.log('\n--- Test Group 8: Score Consistency & Weight Normalization ---');

  const weightsSum = Object.values(CATEGORY_WEIGHTS).reduce((a, b) => a + b, 0);
  assert(weightsSum === 100, `Category weights sum exactly to 100% (got ${weightsSum})`);

  const scoreA = calculateWebsiteOverallScore(perfectAudit.categories);
  const scoreB = calculateWebsiteOverallScore(perfectAudit.categories);
  assert(scoreA === scoreB, `Deterministic repeat scoring gives identical result (${scoreA} === ${scoreB})`);

  // -------------------------------------------------------------
  // TEST GROUP 9: Comprehensive Results & No Truncation
  // -------------------------------------------------------------
  console.log('\n--- Test Group 9: Comprehensive Results Delivery ---');

  // In defectiveAudit, there are at least 7 distinct findings
  assert(allDefectiveFindings.length >= 7, `Returns full findings list without 3-issue truncation (found ${allDefectiveFindings.length} issues)`);

  console.log('\n==================================================');
  console.log('✅ ALL COMPREHENSIVE WEBSITE CHECKER TESTS PASSED!');
  console.log('==================================================\n');
}

runComprehensiveTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
